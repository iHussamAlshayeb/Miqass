import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Printer, ReceiptText, Search, Undo2, Wallet, X, XCircle } from 'lucide-react';
import CancelAppointmentModal from '../dashboard/CancelAppointmentModal';
import posApi from '../../services/posApi';
import { money } from '../../utils/posPricing';
import { isAwaitingPayment, methodLabel } from './posShared';

// تاريخ الرياض بصيغة YYYY-MM-DD، وإزاحته بالأيام
const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
const addDays = (value, days) => {
    const date = new Date(`${value}T12:00:00+03:00`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};
const dayLabel = (value) => {
    const today = riyadhToday();
    if (value === today) return 'اليوم';
    if (value === addDays(today, -1)) return 'أمس';
    if (value === addDays(today, 1)) return 'غداً';
    return new Date(`${value}T12:00:00+03:00`).toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' });
};
// تاريخ ووقت مختصران للفاتورة: "16 نوفمبر · 12:55"
const shortDateTime = (value) => {
    const date = new Date(value);
    const day = date.toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    return `${day} · ${time}`;
};
const errorText = (error, fallback) => error?.response?.data?.message || fallback;

const APPOINTMENT_STATUS = {
    Booked: ['محجوز', 'bg-amber-50 text-amber-800'],
    Completed: ['مكتمل', 'bg-emerald-50 text-emerald-700'],
    Cancelled: ['ملغي', 'bg-red-50 text-red-700'],
};
const SALE_STATUS = {
    Paid: ['مدفوعة', 'bg-emerald-50 text-emerald-700'],
    Partially_Paid: ['مدفوعة جزئياً', 'bg-amber-50 text-amber-800'],
    Draft: ['غير مدفوعة', 'bg-slate-100 text-slate-600'],
    Refunded: ['مسترجعة', 'bg-rose-50 text-rose-700'],
    Cancelled: ['ملغاة', 'bg-slate-100 text-slate-500'],
};
const RANGES = [
    ['today', 'اليوم', () => [riyadhToday(), riyadhToday()]],
    ['yesterday', 'أمس', () => [addDays(riyadhToday(), -1), addDays(riyadhToday(), -1)]],
    ['week', '7 أيام', () => [addDays(riyadhToday(), -6), riyadhToday()]],
    ['month', '30 يوماً', () => [addDays(riyadhToday(), -29), riyadhToday()]],
];

const Pill = ({ tone, children }) => <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{children}</span>;

const Stat = ({ label, value, tone = 'text-slate-900' }) => (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className={`mt-0.5 font-mono text-xl font-extrabold ${tone}`} dir="ltr">{value}</p>
    </div>
);

const SearchField = ({ value, onChange, placeholder }) => (
    <label className="flex h-12 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-slate-900">
        <Search size={18} className="text-slate-400" />
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent font-semibold outline-none" />
        {value && <button type="button" onClick={() => onChange('')} className="p-1 text-slate-400" aria-label="مسح البحث"><X size={16} /></button>}
    </label>
);

// تأخير البحث حتى يتوقف الكاشير عن الكتابة
const useDebounced = (value, delay = 350) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};

/**
 * جلب بيانات السجل: "جاري التحميل" مشتقة من اختلاف مفتاح الطلب عن آخر نتيجة،
 * فلا تُضبط الحالة داخل الأثر مباشرة، وتُهمل الردود المتأخرة لطلب سابق.
 */
const useHistoryFetch = (url, params, reloadKey, fallback) => {
    const key = JSON.stringify([url, params, reloadKey]);
    const [state, setState] = useState({ key: null, data: null, error: '' });
    useEffect(() => {
        let active = true;
        const [requestUrl, requestParams] = JSON.parse(key);
        posApi.get(requestUrl, { params: requestParams })
            .then((res) => { if (active) setState({ key, data: res.data, error: '' }); })
            .catch((err) => { if (active) setState((current) => ({ key, data: current.data, error: errorText(err, fallback) })); });
        return () => { active = false; };
    }, [key, fallback]);
    const setData = useCallback((update) => setState((current) => ({ ...current, data: update(current.data) })), []);
    return { data: state.data, error: state.key === key ? state.error : '', loading: state.key !== key, setData };
};

/** مواعيد يوم بالتنقل بين الأيام، أو بحث عن عميل في كل المواعيد */
const AppointmentsHistory = ({ onReceipt, onCollect, accent, reloadKey }) => {
    const [date, setDate] = useState(() => addDays(riyadhToday(), -1));
    const [search, setSearch] = useState('');
    const [unpaidOnly, setUnpaidOnly] = useState(false);
    const [localReload, setLocalReload] = useState(0);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [actionError, setActionError] = useState('');
    const q = useDebounced(search.trim());
    const reload = reloadKey * 1000 + localReload;
    const params = unpaidOnly ? { unpaid: '1', ...(q ? { q } : {}) } : q ? { q } : { date };
    const { data, loading, error: loadError } = useHistoryFetch('/pos/history/appointments', params, reload, 'تعذر تحميل المواعيد.');
    // عدد المواعيد السابقة التي لم تُحصّل: يظهر على زر التصفية حتى لا تُنسى
    const { data: unpaidData } = useHistoryFetch('/pos/history/appointments', { unpaid: '1' }, reload, '');
    const unpaidCount = unpaidData?.appointments?.length || 0;
    const error = loadError || actionError;
    const showDates = unpaidOnly || Boolean(q);

    const cancelAppointment = async (reason) => {
        setCancelling(true);
        setActionError('');
        try {
            await posApi.put(`/pos/appointments/${cancelTarget._id}/status`, { status: 'Cancelled', cancelReason: reason });
            setCancelTarget(null);
            setLocalReload((value) => value + 1);
        } catch (err) {
            setActionError(errorText(err, 'تعذر إلغاء الموعد.'));
            setCancelTarget(null);
        } finally {
            setCancelling(false);
        }
    };

    const list = data?.appointments || [];
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setUnpaidOnly((value) => !value)} aria-pressed={unpaidOnly}
                    className={`flex h-12 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold ${unpaidOnly ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                    <Wallet size={17} /> غير المحصّلة
                    {unpaidCount > 0 && <span className={`rounded-full px-1.5 text-xs leading-5 ${unpaidOnly ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>{unpaidCount}</span>}
                </button>
                {!showDates && (
                    <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-white">
                        <button type="button" onClick={() => setDate((value) => addDays(value, -1))} className="flex h-full w-11 items-center justify-center text-slate-600" aria-label="اليوم السابق"><ChevronRight size={20} /></button>
                        <label className="relative flex h-full min-w-[150px] cursor-pointer items-center justify-center gap-2 px-2 font-extrabold text-slate-800">
                            <CalendarDays size={17} className="text-slate-400" /> {dayLabel(date)}
                            <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="اختر التاريخ" />
                        </label>
                        <button type="button" onClick={() => setDate((value) => addDays(value, 1))} className="flex h-full w-11 items-center justify-center text-slate-600" aria-label="اليوم التالي"><ChevronLeft size={20} /></button>
                    </div>
                )}
                {!showDates && date !== riyadhToday() && <button type="button" onClick={() => setDate(riyadhToday())} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600">اليوم</button>}
                <SearchField value={search} onChange={setSearch} placeholder="ابحث عن عميل بالاسم أو الجوال في كل المواعيد" />
            </div>

            {data && unpaidOnly && (
                <div className="grid grid-cols-2 gap-2">
                    <Stat label="بانتظار التحصيل" value={data.summary.count} tone="text-amber-700" />
                    <Stat label="المتبقي على العملاء" value={money(data.summary.dueTotal)} />
                </div>
            )}
            {unpaidOnly && <p className="text-xs font-semibold text-slate-500">مواعيد الأيام السابقة (آخر 60 يوماً) لم تُصدر لها فاتورة. التحصيل يُسجل بتاريخ اليوم في الوردية الحالية، وموعد العميل الذي لم يحضر يمكن إلغاؤه.</p>}
            {data && !q && !unpaidOnly && (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <Stat label="المواعيد" value={data.summary.count} />
                    <Stat label="مكتملة" value={data.summary.completed} tone="text-emerald-700" />
                    <Stat label="ملغاة" value={data.summary.cancelled} tone="text-red-600" />
                    <Stat label="المحصّل" value={money(data.summary.paidTotal)} />
                </div>
            )}
            {q && !unpaidOnly && data && <p className="text-sm font-bold text-slate-500">{list.length ? `${list.length} موعد للعميل "${q}"${list.length >= 100 ? ' (آخر 100)' : ''}` : ''}</p>}

            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            {loading && !data ? (
                <p className="py-16 text-center font-bold text-slate-400">جاري التحميل...</p>
            ) : list.length === 0 && !error ? (
                <div className="mt-12 flex flex-col items-center gap-2 text-slate-400">
                    <CalendarDays size={38} strokeWidth={1.5} />
                    <p className="font-bold">{unpaidOnly ? 'لا توجد مواعيد بانتظار التحصيل.' : q ? 'لا توجد مواعيد لهذا العميل.' : 'لا توجد مواعيد في هذا اليوم.'}</p>
                </div>
            ) : (
                <div className={`divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 ${loading ? 'opacity-60' : ''}`}>
                    {list.map((item) => {
                        const [label, tone] = APPOINTMENT_STATUS[item.status] || [item.status, 'bg-slate-100 text-slate-600'];
                        return (
                            <div key={item._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                <div className="w-16 shrink-0 text-center">
                                    <p className="font-mono text-lg font-extrabold text-slate-900" dir="ltr">{item.timeSlot}</p>
                                    {showDates && <p className="whitespace-nowrap text-[11px] font-bold text-slate-400">{dayLabel(item.date)}</p>}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-extrabold text-slate-900">{item.childName}{item.customerPhone && <span className="mr-2 font-mono text-xs font-semibold text-slate-400" dir="ltr">{item.customerPhone}</span>}</p>
                                    <p className="truncate text-sm font-semibold text-slate-500">
                                        {item.barberName}{item.servicesLabel ? ` · ${item.servicesLabel}` : item.isWalkIn ? ' · حلاقة مباشرة' : ''}
                                    </p>
                                    {item.status === 'Cancelled' && item.cancelReason && <p className="text-xs font-semibold text-red-600">السبب: {item.cancelReason}</p>}
                                </div>
                                {!isAwaitingPayment(item) && <span className="font-mono text-base font-extrabold text-slate-700" dir="ltr">{money(item.totalPrice)}</span>}
                                <Pill tone={tone}>{label}{item.isPaid ? ' · مدفوع' : ''}</Pill>
                                {item.saleId ? (
                                    <button type="button" onClick={() => onReceipt(item.saleId)} className="flex h-10 items-center gap-1.5 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100"><Printer size={15} /> الإيصال</button>
                                ) : isAwaitingPayment(item) ? (
                                    <div className="flex gap-1.5">
                                        <button type="button" onClick={() => onCollect(item)} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-extrabold text-white" style={{ backgroundColor: accent }}>
                                            <Wallet size={15} /> تحصيل <span className="font-mono" dir="ltr">{money(Math.max(item.totalPrice - item.deposit, 0))}</span>
                                        </button>
                                        {item.status === 'Booked' && (
                                            <button type="button" onClick={() => setCancelTarget(item)} className="flex h-10 items-center gap-1 rounded-xl px-2.5 text-sm font-bold text-red-600 hover:bg-red-50" aria-label={`إلغاء موعد ${item.childName}`}><XCircle size={15} /> إلغاء</button>
                                        )}
                                    </div>
                                ) : <span className="w-[86px]" />}
                            </div>
                        );
                    })}
                </div>
            )}

            <CancelAppointmentModal
                isOpen={Boolean(cancelTarget)}
                isCanceling={cancelling}
                onClose={() => setCancelTarget(null)}
                onConfirm={cancelAppointment}
            />
        </div>
    );
};

/** سجل الفواتير لفترة مع البحث، وإعادة الطباعة والاسترجاع */
const SalesHistory = ({ onReceipt, onRefund, reloadKey }) => {
    const [range, setRange] = useState('today');
    const [from, setFrom] = useState(riyadhToday);
    const [to, setTo] = useState(riyadhToday);
    const [search, setSearch] = useState('');
    const [refundedOnly, setRefundedOnly] = useState(false);
    const q = useDebounced(search.trim());
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState('');
    const params = { from, to, ...(q ? { q } : {}), ...(refundedOnly ? { refunded: '1' } : {}) };
    const { data, loading, error: loadError, setData } = useHistoryFetch('/pos/history/sales', params, reloadKey, 'تعذر تحميل الفواتير.');
    const error = loadError || moreError;

    const loadMore = async () => {
        if (!data?.nextBefore) return;
        setLoadingMore(true);
        setMoreError('');
        try {
            const res = await posApi.get('/pos/history/sales', { params: { ...params, before: data.nextBefore } });
            setData((current) => ({ ...res.data, sales: [...(current?.sales || []), ...res.data.sales] }));
        } catch (err) {
            setMoreError(errorText(err, 'تعذر تحميل المزيد.'));
        } finally {
            setLoadingMore(false);
        }
    };

    const pickRange = (id) => {
        const [start, end] = RANGES.find(([key]) => key === id)[2]();
        setRange(id);
        setFrom(start);
        setTo(end);
    };
    const setCustom = (key, value) => {
        if (!value) return;
        setRange('custom');
        if (key === 'from') { setFrom(value); if (value > to) setTo(value); } else { setTo(value); if (value < from) setFrom(value); }
    };

    const sales = data?.sales || [];
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
                    {RANGES.map(([id, label]) => (
                        <button key={id} type="button" onClick={() => pickRange(id)} className={`h-10 rounded-lg px-3 text-sm font-extrabold ${range === id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>{label}</button>
                    ))}
                </div>
                <div className={`flex h-12 items-center gap-1 rounded-xl border bg-white px-2 text-sm font-bold ${range === 'custom' ? 'border-slate-900' : 'border-slate-200'}`}>
                    <span className="text-slate-400">من</span>
                    <input type="date" value={from} max={riyadhToday()} onChange={(event) => setCustom('from', event.target.value)} className="bg-transparent font-mono outline-none" aria-label="من تاريخ" />
                    <span className="text-slate-400">إلى</span>
                    <input type="date" value={to} max={riyadhToday()} onChange={(event) => setCustom('to', event.target.value)} className="bg-transparent font-mono outline-none" aria-label="إلى تاريخ" />
                </div>
                <SearchField value={search} onChange={setSearch} placeholder="رقم الفاتورة أو اسم العميل أو جواله" />
                <button type="button" onClick={() => setRefundedOnly((value) => !value)} className={`h-12 rounded-xl border px-4 text-sm font-bold ${refundedOnly ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>المسترجعة</button>
            </div>

            {data && (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <Stat label="عدد الفواتير" value={data.summary.count} />
                    <Stat label="المحصّل" value={money(data.summary.paid)} />
                    <Stat label="المسترجع" value={money(data.summary.refunded)} tone={data.summary.refunded ? 'text-rose-600' : 'text-slate-900'} />
                    <Stat label="الصافي" value={money(data.summary.net)} tone="text-emerald-700" />
                </div>
            )}

            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            {loading && !data ? (
                <p className="py-16 text-center font-bold text-slate-400">جاري التحميل...</p>
            ) : sales.length === 0 && !error ? (
                <div className="mt-12 flex flex-col items-center gap-2 text-slate-400">
                    <ReceiptText size={38} strokeWidth={1.5} />
                    <p className="font-bold">{q ? 'لا توجد فواتير مطابقة.' : 'لا توجد فواتير في هذه الفترة.'}</p>
                </div>
            ) : (
                <>
                    <div className={`divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 ${loading ? 'opacity-60' : ''}`}>
                        {sales.map((sale) => {
                            const [label, tone] = SALE_STATUS[sale.status] || [sale.status, 'bg-slate-100 text-slate-600'];
                            const refundable = ['Paid', 'Partially_Paid'].includes(sale.status) && sale.refundedAmount < sale.paidAmount;
                            return (
                                <div key={sale._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                    <div className="w-28 shrink-0">
                                        <p className="font-mono font-extrabold text-slate-900" dir="ltr">{sale.invoiceNumber}</p>
                                        <p className="whitespace-nowrap text-xs font-semibold text-slate-400">{shortDateTime(sale.createdAt)}</p>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-bold text-slate-800">
                                            {sale.customerName || 'عميل نقدي'}
                                            {sale.customerPhone && <span className="mr-2 font-mono text-xs font-semibold text-slate-400" dir="ltr">{sale.customerPhone}</span>}
                                        </p>
                                        <p className="truncate text-sm font-semibold text-slate-500">
                                            {sale.itemsLabel || '—'}
                                            {sale.methods.length > 0 && ` · ${sale.methods.map(methodLabel).join(' + ')}`}
                                            {sale.cashierName && ` · ${sale.cashierName}`}
                                        </p>
                                    </div>
                                    <div className="text-left">
                                        <p className="font-mono text-base font-extrabold text-slate-900" dir="ltr">{money(sale.totalAmount)}</p>
                                        {sale.refundedAmount > 0 && <p className="text-xs font-bold text-rose-600">مسترجع <span className="font-mono" dir="ltr">{money(sale.refundedAmount)}</span></p>}
                                    </div>
                                    <Pill tone={tone}>{label}</Pill>
                                    <div className="flex gap-1.5">
                                        <button type="button" onClick={() => onReceipt(sale._id)} className="flex h-10 items-center gap-1.5 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100"><Printer size={15} /> الإيصال</button>
                                        <button type="button" disabled={!refundable} onClick={() => onRefund(sale._id)} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-30" title={refundable ? 'استرجاع' : 'لا يوجد مبلغ قابل للاسترجاع'}><Undo2 size={15} /> استرجاع</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {data?.hasMore && (
                        <button type="button" disabled={loadingMore} onClick={loadMore} className="h-12 w-full rounded-xl border border-slate-200 bg-white font-bold text-slate-600 disabled:opacity-50">
                            {loadingMore ? 'جاري التحميل…' : `عرض المزيد (${sales.length} من ${data.summary.count})`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

/** السجل داخل نقطة البيع: الفواتير السابقة والمواعيد السابقة */
const PosHistory = ({ onReceipt, onRefund, onCollect, accent, reloadKey }) => {
    const [tab, setTab] = useState('sales');
    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                {[['sales', 'الفواتير', ReceiptText], ['appointments', 'المواعيد', CalendarDays]].map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setTab(id)} className={`flex h-11 items-center gap-2 rounded-full border px-5 font-extrabold transition ${tab === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                        {React.createElement(Icon, { size: 17 })} {label}
                    </button>
                ))}
            </div>
            {tab === 'sales'
                ? <SalesHistory onReceipt={onReceipt} onRefund={onRefund} reloadKey={reloadKey} />
                : <AppointmentsHistory onReceipt={onReceipt} onCollect={onCollect} accent={accent} reloadKey={reloadKey} />}
        </div>
    );
};

export default PosHistory;
