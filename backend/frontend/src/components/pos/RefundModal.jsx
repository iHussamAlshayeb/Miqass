import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, Minus, Plus, Undo2, X } from 'lucide-react';
import posApi from '../../services/posApi';
import { money } from '../../utils/posPricing';
import { formatDateTime, methodLabel } from './posShared';

const METHODS = [
    { id: 'cash', label: 'نقدي', Icon: Banknote },
    { id: 'card', label: 'شبكة', Icon: CreditCard },
    { id: 'transfer', label: 'تحويل', Icon: Landmark },
];
const REASONS = ['خطأ في الفاتورة', 'إرجاع منتج', 'عدم رضا العميل', 'إلغاء الخدمة'];
const toCents = (value) => Math.round(Number(value || 0) * 100);

/**
 * استرجاع فاتورة مدفوعة كاملة أو بنود منها. المبلغ يُحسب في الخادم بنفس النسب؛
 * هنا تقدير للعرض فقط. onDone(refund) بعد النجاح.
 */
const RefundModal = ({ saleId, onClose, onDone }) => {
    const [data, setData] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [quantities, setQuantities] = useState({});
    const [method, setMethod] = useState('cash');
    const [reason, setReason] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        posApi.get(`/pos/sales/${saleId}/refund`)
            .then((res) => setData(res.data))
            .catch((err) => setLoadError(err?.response?.data?.message || 'تعذر تحميل الفاتورة.'));
    }, [saleId]);

    const lines = useMemo(() => data?.lines || [], [data]);
    const setQty = (line, value) => {
        setConfirming(false);
        setQuantities((current) => ({ ...current, [line.saleItemId]: Math.max(0, Math.min(value, line.refundableQuantity)) }));
    };
    const refundAll = () => {
        setConfirming(false);
        setQuantities(Object.fromEntries(lines.map((line) => [line.saleItemId, line.refundableQuantity])));
    };
    const estimateCents = lines.reduce((sum, line) => {
        const qty = Number(quantities[line.saleItemId] || 0);
        if (!qty) return sum;
        // آخر كمية متبقية تأخذ الباقي من مبلغ البند بالضبط
        const remainingCents = toCents(line.totalAmount) - Math.round(toCents(line.unitNet) * line.refundedQuantity);
        return sum + (qty === line.refundableQuantity ? remainingCents : Math.round(toCents(line.unitNet) * qty));
    }, 0);
    const selected = lines.filter((line) => Number(quantities[line.saleItemId] || 0) > 0);
    const canSubmit = selected.length > 0 && reason.trim() && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        if (!confirming) { setConfirming(true); return; }
        setBusy(true);
        setError('');
        try {
            const res = await posApi.post(`/pos/sales/${saleId}/refunds`, {
                items: selected.map((line) => ({ saleItemId: line.saleItemId, quantity: Number(quantities[line.saleItemId]) })),
                method,
                reason: reason.trim(),
            });
            onDone(res.data.refund);
        } catch (err) {
            setError(err?.response?.data?.message || 'تعذر تنفيذ الاسترجاع.');
            setConfirming(false);
        } finally {
            setBusy(false);
        }
    };

    const sale = data?.sale;
    const nothingLeft = data && lines.every((line) => line.refundableQuantity <= 0);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
            <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-600 text-white"><Undo2 size={20} /></span>
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-900">استرجاع {sale ? <span className="font-mono" dir="ltr">{sale.invoiceNumber}</span> : ''}</h3>
                            {sale && (
                                <p className="text-sm font-semibold text-slate-500">
                                    {sale.customerName || 'عميل'} · {formatDateTime(sale.createdAt)} · مدفوع <span className="font-mono" dir="ltr">{money(sale.paidAmount)}</span>
                                    {sale.refundedAmount > 0 && <> · مسترجع سابقاً <span className="font-mono" dir="ltr">{money(sale.refundedAmount)}</span></>}
                                </p>
                            )}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X size={22} /></button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                    {loadError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{loadError}</p>}
                    {!data && !loadError && <p className="py-10 text-center font-bold text-slate-400">جاري التحميل...</p>}
                    {nothingLeft && <p className="rounded-xl bg-slate-50 px-4 py-6 text-center font-bold text-slate-500">استُرجعت كل بنود هذه الفاتورة.</p>}

                    {data && !nothingLeft && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-slate-600">اختر ما يُسترجع</p>
                                <button type="button" onClick={refundAll} className="h-9 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-extrabold text-rose-700">استرجاع الفاتورة كاملة</button>
                            </div>
                            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                                {lines.map((line) => {
                                    const qty = Number(quantities[line.saleItemId] || 0);
                                    const done = line.refundableQuantity <= 0;
                                    return (
                                        <div key={line.saleItemId} className={`flex items-center gap-3 p-3 ${done ? 'opacity-50' : ''}`}>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-bold text-slate-800">{line.name}</p>
                                                <p className="text-xs font-semibold text-slate-400">
                                                    {line.quantity} × <span className="font-mono" dir="ltr">{money(line.unitNet)}</span>
                                                    {line.barberName ? ` · ${line.barberName}` : ''}
                                                    {line.refundedQuantity > 0 ? ` · مسترجع ${line.refundedQuantity}` : ''}
                                                </p>
                                            </div>
                                            {done ? <span className="text-xs font-bold text-slate-400">مسترجع بالكامل</span> : (
                                                <div className="flex items-center rounded-xl border border-slate-200">
                                                    <button type="button" onClick={() => setQty(line, qty - 1)} disabled={qty <= 0} className="flex h-10 w-10 items-center justify-center text-slate-600 disabled:opacity-30" aria-label="إنقاص"><Minus size={16} /></button>
                                                    <span className={`w-8 text-center font-mono text-lg font-extrabold ${qty ? 'text-rose-700' : 'text-slate-300'}`}>{qty}</span>
                                                    <button type="button" onClick={() => setQty(line, qty + 1)} disabled={qty >= line.refundableQuantity} className="flex h-10 w-10 items-center justify-center text-slate-600 disabled:opacity-30" aria-label="زيادة"><Plus size={16} /></button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div>
                                <p className="mb-2 text-sm font-bold text-slate-600">طريقة إرجاع المبلغ</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {METHODS.map(({ id, label, Icon }) => (
                                        <button key={id} type="button" onClick={() => { setMethod(id); setConfirming(false); }} className={`flex h-12 items-center justify-center gap-2 rounded-xl border-2 font-extrabold ${method === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>
                                            {React.createElement(Icon, { size: 18 })} {label}
                                        </button>
                                    ))}
                                </div>
                                {method === 'cash' && <p className="mt-1.5 text-xs font-semibold text-slate-400">يُصرف من درج الوردية المفتوحة ويُخصم من النقد المتوقع.</p>}
                            </div>

                            <div>
                                <p className="mb-2 text-sm font-bold text-slate-600">السبب</p>
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {REASONS.map((item) => (
                                        <button key={item} type="button" onClick={() => setReason(item)} className={`h-9 rounded-full border px-3 text-sm font-bold ${reason === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>{item}</button>
                                    ))}
                                </div>
                                <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="أو اكتب السبب" className="h-12 w-full rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-slate-900" />
                            </div>

                            {data.refunds.length > 0 && (
                                <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                                    <p className="mb-1 font-bold text-slate-600">استرجاعات سابقة</p>
                                    {data.refunds.map((refund) => (
                                        <p key={refund._id} className="font-semibold text-slate-500">
                                            <span className="font-mono" dir="ltr">{refund.refundNumber}</span> · <span className="font-mono" dir="ltr">{money(refund.totalAmount)}</span> {methodLabel(refund.method)} · {refund.reason}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {data && !nothingLeft && (
                    <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-5">
                        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={submit}
                            className={`flex h-14 w-full items-center justify-between rounded-2xl px-5 text-lg font-extrabold text-white transition disabled:bg-slate-300 ${confirming ? 'bg-rose-700' : 'bg-rose-600'}`}
                        >
                            <span>{busy ? 'جارٍ الاسترجاع…' : confirming ? 'اضغط مرة ثانية للتأكيد' : !selected.length ? 'اختر بنداً للاسترجاع' : !reason.trim() ? 'اكتب سبب الاسترجاع' : `استرجاع ${methodLabel(method)}`}</span>
                            <span className="font-mono" dir="ltr">{money(estimateCents / 100)}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RefundModal;
