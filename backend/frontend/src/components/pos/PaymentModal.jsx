import React, { useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, X, Trash2 } from 'lucide-react';
import { methodLabel } from './posShared';

const METHOD_BUTTONS = [
    { id: 'cash', label: 'نقدي', icon: <Banknote size={22} /> },
    { id: 'card', label: 'شبكة', icon: <CreditCard size={22} /> },
    { id: 'transfer', label: 'تحويل', icon: <Landmark size={22} /> },
];
import Keypad from './Keypad';
import { money } from '../../utils/posPricing';

const toCents = (value) => Math.round((Number(value) || 0) * 100);

/** فئات نقدية سريعة أعلى من المتبقي (مثل 50، 100، 200) */
const quickCash = (remainingCents) => {
    if (remainingCents <= 0) return [];
    const options = new Set([remainingCents]);
    for (const step of [1000, 5000, 10000, 20000, 50000]) {
        const rounded = Math.ceil(remainingCents / step) * step;
        if (rounded > remainingCents) options.add(rounded);
    }
    return [...options].sort((a, b) => a - b).slice(0, 5);
};

/** الدفع: طريقة واحدة أو تقسيم بين نقدي وشبكة وتحويل، مع حساب الباقي للعميل */
const PaymentModal = ({ total, onClose, onComplete, busy, error }) => {
    const [payments, setPayments] = useState([]);
    const [method, setMethod] = useState('cash');
    const [entry, setEntry] = useState('');

    const totalCents = toCents(total);
    const paidCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
    const remainingCents = Math.max(totalCents - paidCents, 0);
    const entryCents = entry === '' ? remainingCents : toCents(entry);
    const changeCents = method === 'cash' ? Math.max(entryCents - remainingCents, 0) : 0;
    const overpaidNonCash = method !== 'cash' && entryCents > remainingCents;
    const quick = useMemo(() => quickCash(remainingCents), [remainingCents]);

    const confirm = () => {
        if (entryCents <= 0 || overpaidNonCash || busy) return;
        const applied = Math.min(entryCents, remainingCents);
        const next = [...payments, { method, amount: applied / 100 }];
        if (applied >= remainingCents) {
            onComplete(next, { tendered: method === 'cash' ? entryCents / 100 : null, change: changeCents / 100 });
            return;
        }
        setPayments(next);
        setEntry('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
            <div className="grid max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[1fr_1.1fr]">
                <div className="flex flex-col gap-4 overflow-y-auto border-b border-slate-200 bg-slate-50 p-6 md:border-b-0 md:border-l">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-500">المطلوب</p>
                            <p className="font-mono text-4xl font-extrabold text-slate-900" dir="ltr">{money(total)}</p>
                        </div>
                        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="إغلاق">
                            <X size={24} />
                        </button>
                    </div>

                    {payments.length > 0 && (
                        <div className="space-y-2">
                            {payments.map((payment, index) => (
                                <div key={index} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
                                    <span className="font-bold text-slate-700">{methodLabel(payment.method)}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-lg font-bold" dir="ltr">{money(payment.amount)}</span>
                                        <button type="button" onClick={() => setPayments(payments.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="حذف الدفعة">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-auto space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex justify-between text-base font-bold text-slate-600">
                            <span>المتبقي</span>
                            <span className="font-mono text-slate-900" dir="ltr">{money(remainingCents / 100)}</span>
                        </div>
                        {method === 'cash' && (
                            <div className={`flex justify-between rounded-lg px-3 py-2 text-lg font-extrabold ${changeCents > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>
                                <span>الباقي للعميل</span>
                                <span className="font-mono" dir="ltr">{money(changeCents / 100)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-4 overflow-y-auto p-6">
                    <div className="grid grid-cols-3 gap-2">
                        {METHOD_BUTTONS.map(({ id, label, icon }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => { setMethod(id); setEntry(''); }}
                                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-base font-extrabold transition ${method === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                            >
                                {icon} {label}
                            </button>
                        ))}
                    </div>

                    <div className="flex h-16 items-center justify-between rounded-xl bg-slate-100 px-4">
                        <span className="text-sm font-bold text-slate-500">{method === 'cash' ? 'المستلم من العميل' : 'المبلغ'}</span>
                        <span className={`font-mono text-3xl font-bold ${entry === '' ? 'text-slate-400' : 'text-slate-900'}`} dir="ltr">
                            {entry === '' ? money(remainingCents / 100) : entry}
                        </span>
                    </div>

                    {method === 'cash' && quick.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {quick.map((cents) => (
                                <button key={cents} type="button" onClick={() => setEntry(String(cents / 100))} className="h-11 flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 font-mono text-base font-bold text-emerald-800">
                                    {money(cents / 100)}
                                </button>
                            ))}
                        </div>
                    )}

                    <Keypad value={entry} onChange={setEntry} compact />

                    {overpaidNonCash && <p className="text-sm font-bold text-red-600">لا يمكن أن يتجاوز الدفع بالشبكة أو التحويل المبلغ المتبقي.</p>}
                    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

                    <button
                        type="button"
                        onClick={confirm}
                        disabled={busy || entryCents <= 0 || overpaidNonCash}
                        className="h-16 rounded-xl bg-emerald-600 text-xl font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
                    >
                        {busy ? 'جارٍ الحفظ…' : entryCents >= remainingCents ? 'إتمام البيع' : `إضافة دفعة ${methodLabel(method)}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
