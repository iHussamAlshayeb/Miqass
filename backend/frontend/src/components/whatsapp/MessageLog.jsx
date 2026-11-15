import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCheck, ChevronDown, Clock, Loader2, RefreshCw, RotateCw, Search, XCircle } from 'lucide-react';

const TYPE_LABELS = {
    confirmation: 'تأكيد حجز',
    reminder: 'تذكير',
    cancellation: 'إلغاء',
    reschedule: 'تعديل موعد',
    review: 'طلب تقييم',
    loyalty: 'مكافأة ولاء',
    retention: 'اشتقنالك',
    campaign: 'حملة',
    access_code: 'رمز دخول',
};

const STATUS = {
    queued: { label: 'بالانتظار', tone: 'bg-amber-50 text-amber-800', icon: Clock },
    sending: { label: 'قيد الإرسال', tone: 'bg-amber-50 text-amber-800', icon: Loader2 },
    sent: { label: 'أُرسلت', tone: 'bg-slate-100 text-slate-700', icon: Check },
    delivered: { label: 'وصلت', tone: 'bg-sky-50 text-sky-700', icon: CheckCheck },
    read: { label: 'قُرئت', tone: 'bg-emerald-50 text-emerald-700', icon: CheckCheck },
    failed: { label: 'فشلت', tone: 'bg-red-50 text-red-700', icon: XCircle },
    skipped: { label: 'لم تُرسل', tone: 'bg-orange-50 text-orange-700', icon: AlertTriangle },
    expired: { label: 'انتهت صلاحيتها', tone: 'bg-slate-100 text-slate-500', icon: Clock },
};

const STATUS_FILTERS = [
    ['', 'كل الحالات'], ['problems', 'المشاكل فقط'], ['queued', 'بالانتظار'], ['sent', 'أُرسلت'],
    ['delivered', 'وصلت'], ['read', 'قُرئت'], ['failed', 'فشلت'], ['skipped', 'لم تُرسل'], ['expired', 'انتهت صلاحيتها'],
];

const formatTime = (value) => (value
    ? new Date(value).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' })
    : '');
const displayPhone = (to) => {
    const digits = String(to || '');
    return digits.startsWith('966') ? `0${digits.slice(3)}` : digits;
};

const Stat = ({ label, value, tone }) => (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
        <p className="text-[11px] font-black text-slate-400">{label}</p>
        <p className={`text-lg font-black ${tone}`}>{value.toLocaleString('ar-SA')}</p>
    </div>
);

/**
 * سجل رسائل واتساب: الحالة لكل رسالة (أُرسلت، وصلت، قُرئت، فشلت وسببها) مع إعادة الإرسال.
 * load(params) و resend(id) يحددان المصدر (الصالون أو السوبر أدمن).
 */
const MessageLog = ({ load, resend, showSalon = false, salons = [], extraHeader = null }) => {
    const [filters, setFilters] = useState({ status: '', type: '', q: '', tenantId: '' });
    const [query, setQuery] = useState('');
    const [data, setData] = useState({ messages: [], summary: {}, nextBefore: null });
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [open, setOpen] = useState('');
    const [resending, setResending] = useState('');
    const [notice, setNotice] = useState('');
    const requestRef = useRef(0);
    // مصدر البيانات قد يُمرَّر كدالة جديدة في كل رسم؛ نحفظه في ref حتى لا يتكرر التحميل
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);

    const fetchPage = useCallback(async (before = null) => {
        const requestId = ++requestRef.current;
        const params = Object.fromEntries(Object.entries({ ...filters, before }).filter(([, value]) => value));
        const result = await loadRef.current(params);
        return requestId === requestRef.current ? result : null;
    }, [filters]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await fetchPage();
            if (result) setData(result);
        } catch (err) {
            setError(err?.response?.data?.message || 'تعذر تحميل السجل.');
        } finally {
            setLoading(false);
        }
    }, [fetchPage]);

    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => {
        const timer = setTimeout(() => setFilters((current) => (current.q === query ? current : { ...current, q: query })), 350);
        return () => clearTimeout(timer);
    }, [query]);

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const result = await fetchPage(data.nextBefore);
            if (result) setData((current) => ({ ...result, messages: [...current.messages, ...result.messages] }));
        } finally {
            setLoadingMore(false);
        }
    };

    const doResend = async (message) => {
        setResending(message._id);
        setNotice('');
        try {
            const res = await resend(message._id);
            setData((current) => ({ ...current, messages: [res.message, ...current.messages] }));
            setNotice('أُضيفت الرسالة للإرسال من جديد، وتظهر حالتها هنا خلال ثوانٍ.');
            setTimeout(refresh, 12000);
        } catch (err) {
            setNotice(err?.response?.data?.message || 'تعذر إعادة الإرسال.');
        } finally {
            setResending('');
        }
    };

    const s = data.summary || {};
    const sum = (...keys) => keys.reduce((total, key) => total + Number(s[key] || 0), 0);

    return (
        <div className="space-y-4">
            {extraHeader}
            <div>
                <p className="mb-2 text-xs font-black text-slate-500">آخر 24 ساعة</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Stat label="أُرسلت" value={sum('sent', 'delivered', 'read')} tone="text-slate-900" />
                    <Stat label="وصلت للعميل" value={sum('delivered', 'read')} tone="text-sky-700" />
                    <Stat label="قُرئت" value={sum('read')} tone="text-emerald-700" />
                    <Stat label="بالانتظار" value={sum('queued', 'sending')} tone="text-amber-700" />
                    <Stat label="فشلت أو لم تُرسل" value={sum('failed', 'skipped', 'expired')} tone="text-red-700" />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[180px] flex-1">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو الجوال" className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm font-bold outline-none focus:border-slate-900" />
                </label>
                <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold">
                    {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold">
                    <option value="">كل الأنواع</option>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {showSalon && (
                    <select value={filters.tenantId} onChange={(event) => setFilters({ ...filters, tenantId: event.target.value })} className="h-10 max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold">
                        <option value="">كل الصالونات</option>
                        {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.salonName}</option>)}
                    </select>
                )}
                <button type="button" onClick={refresh} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="تحديث">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {notice && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">{notice}</p>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-white">
                {!loading && data.messages.length === 0 && (
                    <p className="p-6 text-center text-sm font-bold text-slate-400">لا توجد رسائل مطابقة. السجل يبدأ من تاريخ تفعيل هذه الميزة ويحتفظ بآخر 90 يوماً.</p>
                )}
                {data.messages.map((message) => {
                    const status = STATUS[message.status] || STATUS.sent;
                    const Icon = status.icon;
                    const expanded = open === message._id;
                    return (
                        <div key={message._id} className="p-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-black ${status.tone}`}>
                                    <Icon size={13} className={message.status === 'sending' ? 'animate-spin' : ''} /> {status.label}
                                </span>
                                <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs font-black text-slate-600">{TYPE_LABELS[message.type] || message.type}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">
                                    {message.recipientName || 'عميل'}
                                    <span className="mr-2 font-mono text-xs font-bold text-slate-400" dir="ltr">{displayPhone(message.to)}</span>
                                    {showSalon && message.salonName && <span className="mr-2 text-xs font-bold text-slate-400">· {message.salonName}</span>}
                                </span>
                                <span className="shrink-0 text-xs font-bold text-slate-400">{formatTime(message.createdAt)}</span>
                                <span className="flex shrink-0 items-center gap-1">
                                    {message.canResend && (
                                        <button type="button" disabled={resending === message._id} onClick={() => doResend(message)} className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                            <RotateCw size={13} /> إعادة إرسال
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setOpen(expanded ? '' : message._id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50" aria-label="التفاصيل">
                                        <ChevronDown size={16} className={`transition ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                </span>
                            </div>
                            {message.lastError && ['failed', 'skipped', 'queued'].includes(message.status) && (
                                <p className={`mt-2 text-xs font-bold ${message.status === 'queued' ? 'text-amber-700' : 'text-red-600'}`}>
                                    {message.status === 'queued' ? `محاولة ${message.attempts} فشلت مؤقتاً، ستُعاد تلقائياً: ` : 'السبب: '}{message.lastError}
                                </p>
                            )}
                            {expanded && (
                                <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                                    <p className="whitespace-pre-line text-sm font-semibold leading-7 text-slate-700">{message.text}</p>
                                    <p className="text-xs font-bold text-slate-400">
                                        {[
                                            message.sentAt && `أُرسلت ${formatTime(message.sentAt)}`,
                                            message.deliveredAt && `وصلت ${formatTime(message.deliveredAt)}`,
                                            message.readAt && `قُرئت ${formatTime(message.readAt)}`,
                                            message.attempts > 1 && `${message.attempts} محاولات`,
                                            message.resendOf && 'إعادة إرسال',
                                        ].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {data.nextBefore && (
                <button type="button" disabled={loadingMore} onClick={loadMore} className="mx-auto flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                    {loadingMore && <Loader2 size={15} className="animate-spin" />} المزيد
                </button>
            )}
        </div>
    );
};

export default MessageLog;
