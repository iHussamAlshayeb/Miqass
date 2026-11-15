import React, { useMemo, useState } from 'react';
import { BellRing, CalendarCheck, CheckCheck, Printer, Star, Wallet, XCircle } from 'lucide-react';
import posApi from '../../services/posApi';
import { money } from '../../utils/posPricing';
import { isAwaitingPayment } from './posShared';
import CancelAppointmentModal from '../dashboard/CancelAppointmentModal';


const FILTERS = [
    ['pending', 'بانتظار الدفع', isAwaitingPayment],
    ['paid', 'مدفوع', (item) => item.isPaid],
    ['cancelled', 'ملغي', (item) => item.status === 'Cancelled'],
    ['all', 'الكل', () => true],
];

// لون الشريط الجانبي ونص الحالة: محجوز (كهرماني)، اكتمل بانتظار الدفع (أخضر)، مدفوع (رمادي)، ملغي (أحمر)
const statusStyle = (item) => {
    if (item.status === 'Cancelled') return { label: 'ملغي', pill: 'bg-red-50 text-red-700', stripe: 'bg-red-400' };
    if (item.isPaid) return { label: 'مدفوع', pill: 'bg-slate-100 text-slate-600', stripe: 'bg-slate-300' };
    if (item.status === 'Completed') return { label: 'اكتمل · بانتظار الدفع', pill: 'bg-emerald-50 text-emerald-700', stripe: 'bg-emerald-500' };
    return { label: item.isWalkIn ? 'في الطابور' : 'محجوز', pill: 'bg-amber-50 text-amber-800', stripe: 'bg-amber-400' };
};

const IconAction = ({ icon, label, onClick, disabled, tone = 'light' }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition active:scale-95 disabled:opacity-40 ${tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
    >
        {icon} <span className="whitespace-nowrap">{label}</span>
    </button>
);

/** مواعيد اليوم داخل نقطة البيع: تحصيل، إتمام، تذكير، إلغاء، طلب تقييم، وإعادة طباعة الإيصال */
const TodayBookings = ({ appointments, barbers = [], loading, activeId, accent, onCollect, onReceipt, onChanged, onToast }) => {
    const [filter, setFilter] = useState('pending');
    const [busyId, setBusyId] = useState('');
    const [cancelTarget, setCancelTarget] = useState(null);
    const barberColors = useMemo(() => new Map(barbers.map((barber) => [barber.name, barber.iconColor])), [barbers]);

    const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id, , test]) => [id, appointments.filter(test).length])), [appointments]);
    const visible = useMemo(() => appointments.filter(FILTERS.find(([id]) => id === filter)[2]), [appointments, filter]);

    const run = async (item, request, success) => {
        setBusyId(String(item._id));
        try {
            await request();
            onToast(success);
            onChanged();
        } catch (error) {
            onToast(error?.response?.data?.message || 'تعذر تنفيذ العملية.');
        } finally {
            setBusyId('');
        }
    };

    const setStatus = (item, status, extra = {}, success) => run(
        item,
        () => posApi.put(`/pos/appointments/${item._id}/status`, { status, ...extra }),
        success,
    );

    return (
        <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5">
                {FILTERS.map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setFilter(id)} className={`flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold transition ${filter === id ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        {label}
                        <span className={`rounded-full px-1.5 text-xs ${filter === id ? 'bg-white/20' : 'bg-slate-100'}`}>{counts[id]}</span>
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="mt-16 flex flex-col items-center gap-2 text-center text-slate-400">
                    <CalendarCheck size={40} strokeWidth={1.5} />
                    <p className="font-bold">{loading ? 'جاري التحميل...' : filter === 'pending' ? 'لا توجد حجوزات بانتظار الدفع الآن.' : 'لا توجد مواعيد هنا.'}</p>
                    {!loading && filter === 'pending' && <p className="text-sm font-semibold">العميل الحاضر بدون حجز؟ استخدم "حلاقة الآن".</p>}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map((item) => {
                        const id = String(item._id);
                        const active = activeId === id;
                        const busy = busyId === id;
                        const style = statusStyle(item);
                        const awaiting = isAwaitingPayment(item);
                        const due = Math.max(item.totalPrice - item.deposit, 0);
                        const barberColor = barberColors.get(item.barberName) || '#94a3b8';
                        return (
                            <div key={id} className={`relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition ${active ? 'ring-2 ring-emerald-600' : 'ring-slate-200/80 hover:shadow-md'} ${item.status === 'Cancelled' ? 'opacity-70' : ''}`}>
                                <span className={`absolute inset-y-0 right-0 w-1.5 ${style.stripe}`} />
                                <div className="flex items-start gap-3 p-4 pr-5">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-lg font-extrabold text-slate-900">{item.childName}</p>
                                        <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">{item.servicesLabel || (item.isWalkIn ? 'حلاقة مباشرة' : 'بدون خدمات محددة')}</p>
                                    </div>
                                    <span className="shrink-0 rounded-xl bg-slate-900 px-2.5 py-1 font-mono text-lg font-extrabold text-white" dir="ltr">{item.timeSlot}</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 pb-3 pr-5 text-xs font-bold">
                                    <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: barberColor }} />
                                        <span className="truncate">{item.barberName}</span>
                                    </span>
                                    <span className={`mr-auto shrink-0 rounded-full px-2.5 py-1 ${style.pill}`}>{style.label}</span>
                                </div>
                                {item.status === 'Cancelled' && item.cancelReason && <p className="px-5 pb-3 text-xs font-semibold text-red-600">السبب: {item.cancelReason}</p>}

                                <div className="mt-auto space-y-2 border-t border-slate-100 p-3 pr-4">
                                    {awaiting && (
                                        <button type="button" disabled={busy} onClick={() => onCollect(item)} className="flex h-12 w-full items-center justify-between rounded-xl px-4 font-extrabold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50" style={{ backgroundColor: accent }}>
                                            <span className="flex items-center gap-2"><Wallet size={18} /> تحصيل</span>
                                            <span className="font-mono text-lg" dir="ltr">{money(due)}</span>
                                        </button>
                                    )}
                                    {item.isPaid && (
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-sm font-bold text-slate-500">مدفوع</span>
                                            <span className="font-mono text-lg font-extrabold text-slate-700" dir="ltr">{money(item.totalPrice)}</span>
                                        </div>
                                    )}
                                    <div className="flex gap-1.5">
                                        {item.status === 'Booked' && <IconAction icon={<CheckCheck size={16} />} label="إتمام" disabled={busy} onClick={() => setStatus(item, 'Completed', {}, 'تم إتمام الموعد.')} />}
                                        {item.status === 'Booked' && !item.isWalkIn && <IconAction icon={<BellRing size={16} />} label="تذكير" disabled={busy || !item.customerPhone} onClick={() => run(item, () => posApi.post(`/pos/appointments/${item._id}/reminder`), 'تم إرسال التذكير.')} />}
                                        {item.isPaid && item.saleId && <IconAction icon={<Printer size={16} />} label="الإيصال" disabled={busy} onClick={() => onReceipt(item.saleId)} />}
                                        {item.canRequestReview && <IconAction icon={<Star size={16} />} label="تقييم" disabled={busy} onClick={() => setStatus(item, 'Completed', {}, 'تم إرسال طلب التقييم.')} />}
                                        {item.status === 'Booked' && <IconAction tone="danger" icon={<XCircle size={16} />} label="إلغاء" disabled={busy} onClick={() => setCancelTarget(item)} />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <CancelAppointmentModal
                isOpen={Boolean(cancelTarget)}
                isCanceling={Boolean(cancelTarget) && busyId === String(cancelTarget?._id)}
                onClose={() => setCancelTarget(null)}
                onConfirm={async (reason) => {
                    const target = cancelTarget;
                    await setStatus(target, 'Cancelled', { cancelReason: reason }, 'تم إلغاء الموعد.');
                    setCancelTarget(null);
                }}
            />
        </div>
    );
};

export default TodayBookings;
