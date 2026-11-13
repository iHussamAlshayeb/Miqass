import React, { useMemo, useState } from 'react';
import { BellRing, CheckCheck, Printer, Star, Wallet, XCircle } from 'lucide-react';
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

const statusBadge = (item) => {
    if (item.status === 'Cancelled') return ['ملغي', 'bg-red-50 text-red-700'];
    if (item.isPaid) return ['مدفوع', 'bg-slate-100 text-slate-600'];
    if (item.status === 'Completed') return ['اكتمل · بانتظار الدفع', 'bg-emerald-50 text-emerald-700'];
    return ['محجوز', 'bg-amber-50 text-amber-700'];
};

const Action = ({ icon, label, onClick, disabled, tone = 'light' }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        className={`flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition active:scale-95 disabled:opacity-40 ${tone === 'primary' ? 'bg-emerald-600 text-white' : tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
    >
        {icon} {label}
    </button>
);

/** مواعيد اليوم داخل نقطة البيع: تحصيل، إتمام، تذكير، إلغاء، طلب تقييم، وإعادة طباعة الإيصال */
const TodayBookings = ({ appointments, loading, activeId, accent, onCollect, onReceipt, onChanged, onToast }) => {
    const [filter, setFilter] = useState('pending');
    const [busyId, setBusyId] = useState('');
    const [cancelTarget, setCancelTarget] = useState(null);

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
                    <button key={id} type="button" onClick={() => setFilter(id)} className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold ${filter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                        {label}
                        <span className={`rounded-full px-1.5 text-xs ${filter === id ? 'bg-white/20' : 'bg-slate-100'}`}>{counts[id]}</span>
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <p className="mt-16 text-center font-bold text-slate-400">{loading ? 'جاري التحميل...' : filter === 'pending' ? 'لا توجد حجوزات اليوم بانتظار الدفع.' : 'لا توجد مواعيد هنا.'}</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {visible.map((item) => {
                        const id = String(item._id);
                        const active = activeId === id;
                        const busy = busyId === id;
                        const [badge, badgeTone] = statusBadge(item);
                        const awaiting = isAwaitingPayment(item);
                        return (
                            <div key={id} className={`flex flex-col gap-3 rounded-xl border-2 bg-white p-4 shadow-sm ${active ? 'border-emerald-600' : 'border-transparent'} ${item.status === 'Cancelled' ? 'opacity-70' : ''}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-extrabold text-slate-800">{item.childName}</p>
                                        <p className="truncate text-xs font-semibold text-slate-500">{item.servicesLabel || (item.isWalkIn ? 'حلاقة مباشرة' : 'بدون خدمات محددة')}</p>
                                    </div>
                                    <span className="shrink-0 font-mono text-lg font-extrabold text-slate-900" dir="ltr">{item.timeSlot}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs font-bold">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className={`shrink-0 rounded-md px-2 py-1 ${badgeTone}`}>{badge}</span>
                                        <span className="truncate text-slate-500">{item.barberName}</span>
                                    </span>
                                    <span className="shrink-0 font-mono text-lg font-extrabold" style={{ color: accent }} dir="ltr">{money(Math.max(item.totalPrice - item.deposit, 0))}</span>
                                </div>
                                {item.status === 'Cancelled' && item.cancelReason && <p className="text-xs font-semibold text-red-600">السبب: {item.cancelReason}</p>}

                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                    {awaiting && <Action tone="primary" icon={<Wallet size={16} />} label="تحصيل" disabled={busy} onClick={() => onCollect(item)} />}
                                    {item.status === 'Booked' && (
                                        <>
                                            <Action icon={<CheckCheck size={16} />} label="إتمام" disabled={busy} onClick={() => setStatus(item, 'Completed', {}, 'تم إتمام الموعد.')} />
                                            <Action icon={<BellRing size={16} />} label="تذكير" disabled={busy || !item.customerPhone} onClick={() => run(item, () => posApi.post(`/pos/appointments/${item._id}/reminder`), 'تم إرسال التذكير.')} />
                                        </>
                                    )}
                                    {item.isPaid && item.saleId && <Action icon={<Printer size={16} />} label="الإيصال" disabled={busy} onClick={() => onReceipt(item.saleId)} />}
                                    {item.canRequestReview && <Action icon={<Star size={16} />} label="طلب تقييم" disabled={busy} onClick={() => setStatus(item, 'Completed', {}, 'تم إرسال طلب التقييم.')} />}
                                    {item.status === 'Booked' && <span className="mr-auto"><Action tone="danger" icon={<XCircle size={16} />} label="إلغاء" disabled={busy} onClick={() => setCancelTarget(item)} /></span>}
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
