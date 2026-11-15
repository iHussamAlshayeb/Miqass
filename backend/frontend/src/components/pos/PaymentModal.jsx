import React, { useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, X, Trash2, Plus, Split, Wallet, CheckCircle2 } from 'lucide-react';
import Keypad from './Keypad';
import { money } from '../../utils/posPricing';

const METHODS = [
    { id: 'cash', label: 'نقدي', Icon: Banknote },
    { id: 'card', label: 'شبكة', Icon: CreditCard },
    { id: 'transfer', label: 'تحويل', Icon: Landmark },
];
const MAX_PARTS = 6;

const toCents = (value) => Math.round((Number(value) || 0) * 100);
const fromCents = (cents) => String(Math.round(cents) / 100);

/** فئات نقدية سريعة أعلى من المطلوب (مثل 50، 100، 200) */
const quickCash = (dueCents) => {
    if (dueCents <= 0) return [];
    const options = new Set([dueCents]);
    for (const step of [1000, 5000, 10000, 20000, 50000]) {
        const rounded = Math.ceil(dueCents / step) * step;
        if (rounded > dueCents) options.add(rounded);
    }
    return [...options].sort((a, b) => a - b).slice(0, 5);
};

/** تقسيم المبلغ بالتساوي على عدد من الأجزاء؛ الهللات المتبقية تُضاف لآخر جزء */
const equalParts = (totalCents, count, methods = []) => {
    const base = Math.floor(totalCents / count);
    return Array.from({ length: count }, (_, index) => ({
        id: `${Date.now()}-${index}`,
        method: methods[index] || (index === 0 ? 'cash' : 'card'),
        amount: fromCents(index === count - 1 ? totalCents - base * (count - 1) : base),
    }));
};

const MethodButtons = ({ value, onChange, size = 'lg' }) => (
    <div className={`grid grid-cols-3 ${size === 'lg' ? 'gap-2' : 'gap-1'}`}>
        {METHODS.map(({ id, label, Icon }) => (
            <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={`flex items-center justify-center rounded-xl border-2 font-extrabold transition ${size === 'lg' ? 'h-16 flex-col gap-1 text-base' : 'h-10 gap-1 text-xs'} ${value === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
                {React.createElement(Icon, { size: size === 'lg' ? 22 : 15 })} {label}
            </button>
        ))}
    </div>
);

/**
 * الدفع: دفعة واحدة (مع حساب الباقي النقدي) أو تقسيم المبلغ على أكثر من طريقة/شخص.
 * onComplete(payments, { tendered, change })
 */
const PaymentModal = ({ total, onClose, onComplete, busy, error }) => {
    const totalCents = toCents(total);
    const [mode, setMode] = useState('single');

    // دفعة واحدة
    const [method, setMethod] = useState('cash');
    const [entry, setEntry] = useState('');
    const entryCents = entry === '' ? totalCents : toCents(entry);
    const changeCents = method === 'cash' ? Math.max(entryCents - totalCents, 0) : 0;
    const quick = useMemo(() => quickCash(totalCents), [totalCents]);
    const singleProblem = entryCents < totalCents
        ? 'المبلغ أقل من المطلوب. للدفع بأكثر من طريقة اختر "تقسيم".'
        : method !== 'cash' && entryCents > totalCents ? 'الشبكة والتحويل بالمبلغ المطلوب بالضبط.' : '';

    // التقسيم
    const [parts, setParts] = useState(() => equalParts(totalCents, 2));
    const [activeId, setActiveIdState] = useState(null);
    // أول ضغطة بعد اختيار جزء تستبدل مبلغه بدل الإضافة إليه
    const [replaceNext, setReplaceNext] = useState(false);
    const setActiveId = (id) => { setActiveIdState(id); setReplaceNext(Boolean(id)); };
    const partsCents = parts.reduce((sum, part) => sum + toCents(part.amount), 0);
    const differenceCents = totalCents - partsCents;
    const activePart = parts.find((part) => part.id === activeId) || null;
    const splitReady = differenceCents === 0 && parts.every((part) => toCents(part.amount) > 0);

    const updatePart = (id, change) => setParts((list) => list.map((part) => (part.id === id ? { ...part, ...change } : part)));
    // تعديل مبلغ جزء: الجزء الأخير (أو الأول إن كان المعدَّل هو الأخير) يأخذ الفرق تلقائياً ليبقى المجموع مكتملاً
    const setPartAmount = (id, amount) => setParts((list) => {
        const next = list.map((part) => (part.id === id ? { ...part, amount } : part));
        if (next.length < 2) return next;
        const balanceIndex = next[next.length - 1].id === id ? 0 : next.length - 1;
        const others = next.reduce((sum, part, index) => (index === balanceIndex ? sum : sum + toCents(part.amount)), 0);
        next[balanceIndex] = { ...next[balanceIndex], amount: fromCents(Math.max(totalCents - others, 0)) };
        return next;
    });
    const addPart = () => {
        if (parts.length >= MAX_PARTS) return;
        const id = `${Date.now()}`;
        setParts((list) => [...list, { id, method: 'card', amount: fromCents(Math.max(differenceCents, 0)) }]);
        setActiveId(id);
    };
    const removePart = (id) => {
        setParts((list) => list.filter((part) => part.id !== id));
        if (activeId === id) setActiveId(null);
    };
    // يكمّل الجزء بما تبقى من المبلغ
    const fillRemaining = (id) => {
        const others = parts.filter((part) => part.id !== id).reduce((sum, part) => sum + toCents(part.amount), 0);
        updatePart(id, { amount: fromCents(Math.max(totalCents - others, 0)) });
    };

    const confirm = () => {
        if (busy) return;
        if (mode === 'single') {
            if (singleProblem || totalCents <= 0) return;
            onComplete([{ method, amount: totalCents / 100 }], { tendered: method === 'cash' ? entryCents / 100 : null, change: changeCents / 100 });
            return;
        }
        if (!splitReady) return;
        onComplete(parts.map((part) => ({ method: part.method, amount: toCents(part.amount) / 100 })), { tendered: null, change: 0 });
    };

    const canConfirm = !busy && totalCents > 0 && (mode === 'single' ? !singleProblem : splitReady);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-[2px]">
            <div className="grid max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-[1fr_1.15fr]">
                {/* الملخص */}
                <div className="flex flex-col gap-4 overflow-y-auto bg-slate-900 p-6 text-white">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-400">المطلوب</p>
                            <p className="font-mono text-5xl font-extrabold tracking-tight" dir="ltr">{money(total)}</p>
                        </div>
                        <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="إغلاق">
                            <X size={24} />
                        </button>
                    </div>

                    {mode === 'single' ? (
                        <div className="mt-auto space-y-3">
                            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                                <span className="font-bold text-slate-300">{method === 'cash' ? 'المستلم' : 'المبلغ'}</span>
                                <span className="font-mono text-2xl font-bold" dir="ltr">{money(entryCents / 100)}</span>
                            </div>
                            {method === 'cash' && (
                                <div className={`flex items-center justify-between rounded-2xl px-4 py-4 ${changeCents > 0 ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-400'}`}>
                                    <span className="text-lg font-extrabold">الباقي للعميل</span>
                                    <span className="font-mono text-3xl font-extrabold" dir="ltr">{money(changeCents / 100)}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mt-auto space-y-3">
                            {activePart && (
                                <div className="space-y-2">
                                    <p className="text-sm font-bold text-slate-300">
                                        مبلغ الجزء {parts.indexOf(activePart) + 1}
                                        {parts.length > 1 && <span className="text-slate-500"> · الجزء {parts.findIndex((part) => part.id === activePart.id) === parts.length - 1 ? 1 : parts.length} يأخذ الفرق تلقائياً</span>}
                                    </p>
                                    <Keypad value={replaceNext ? '' : activePart.amount} onChange={(value) => { setReplaceNext(false); setPartAmount(activePart.id, value); }} compact />
                                </div>
                            )}
                            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                                <div className={`h-full rounded-full transition-all ${differenceCents < 0 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min((partsCents / Math.max(totalCents, 1)) * 100, 100)}%` }} />
                            </div>
                            {!activePart && METHODS.map(({ id, label, Icon }) => {
                                const sum = parts.filter((part) => part.method === id).reduce((acc, part) => acc + toCents(part.amount), 0);
                                if (!sum) return null;
                                return (
                                    <div key={id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5">
                                        <span className="flex items-center gap-2 font-bold text-slate-300">{React.createElement(Icon, { size: 18 })} {label}</span>
                                        <span className="font-mono text-xl font-bold" dir="ltr">{money(sum / 100)}</span>
                                    </div>
                                );
                            })}
                            <div className={`flex items-center justify-between rounded-2xl px-4 py-4 ${differenceCents === 0 ? 'bg-emerald-400 text-slate-900' : differenceCents > 0 ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white'}`}>
                                <span className="flex items-center gap-2 text-lg font-extrabold">
                                    {differenceCents === 0 ? <><CheckCircle2 size={20} /> المبلغ مكتمل</> : differenceCents > 0 ? 'متبقي' : 'زيادة عن المطلوب'}
                                </span>
                                {differenceCents !== 0 && <span className="font-mono text-2xl font-extrabold" dir="ltr">{money(Math.abs(differenceCents) / 100)}</span>}
                            </div>
                        </div>
                    )}
                </div>

                {/* الإدخال */}
                <div className="flex flex-col gap-4 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
                        {[['single', 'دفعة واحدة', Wallet], ['split', 'تقسيم', Split]].map(([id, label, Icon]) => (
                            <button key={id} type="button" onClick={() => setMode(id)} className={`flex h-12 items-center justify-center gap-2 rounded-xl text-base font-extrabold transition ${mode === id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>
                                {React.createElement(Icon, { size: 18 })} {label}
                            </button>
                        ))}
                    </div>

                    {mode === 'single' ? (
                        <>
                            <MethodButtons value={method} onChange={(next) => { setMethod(next); setEntry(''); }} />
                            {method === 'cash' && quick.length > 0 && (
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
                                    {quick.map((cents) => (
                                        <button key={cents} type="button" onClick={() => setEntry(fromCents(cents))} className={`h-11 rounded-xl border px-1 font-mono text-sm font-bold transition ${entryCents === cents ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                                            {money(cents / 100)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {method === 'cash' ? <Keypad value={entry} onChange={setEntry} compact /> : (
                                <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                                    يُسجَّل {method === 'card' ? 'الدفع بالشبكة' : 'التحويل'} بالمبلغ المطلوب بالضبط.
                                </p>
                            )}
                            {entry !== '' && singleProblem && <p className="text-sm font-bold text-red-600">{singleProblem}</p>}
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-500">بالتساوي على:</span>
                                {[2, 3, 4].map((count) => (
                                    <button key={count} type="button" onClick={() => { setParts(equalParts(totalCents, count, parts.map((part) => part.method))); setActiveId(null); }} className="h-10 rounded-full border border-slate-200 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                                        {count} أجزاء
                                    </button>
                                ))}
                            </div>
                            <div className="space-y-2">
                                {parts.map((part, index) => {
                                    const active = part.id === activeId;
                                    return (
                                        <div key={part.id} className={`rounded-2xl border-2 p-3 transition ${active ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                                            <div className="mb-2 flex items-center gap-2">
                                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white">{index + 1}</span>
                                                <button type="button" onClick={() => setActiveId(active ? null : part.id)} className={`flex h-11 flex-1 items-center justify-between rounded-xl px-3 ${active ? 'bg-white ring-2 ring-slate-900' : 'bg-slate-100'}`}>
                                                    <span className="text-xs font-bold text-slate-500">{active ? 'اكتب من اللوحة' : 'المبلغ'}</span>
                                                    <span className="font-mono text-xl font-extrabold text-slate-900" dir="ltr">{part.amount === '' ? '0' : part.amount}</span>
                                                </button>
                                                {differenceCents !== 0 && (
                                                    <button type="button" onClick={() => fillRemaining(part.id)} className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800">الباقي</button>
                                                )}
                                                {parts.length > 1 && (
                                                    <button type="button" onClick={() => removePart(part.id)} className="flex h-11 w-11 items-center justify-center rounded-xl text-red-500 hover:bg-red-50" aria-label="حذف الجزء"><Trash2 size={18} /></button>
                                                )}
                                            </div>
                                            <MethodButtons size="sm" value={part.method} onChange={(next) => updatePart(part.id, { method: next })} />
                                        </div>
                                    );
                                })}
                            </div>
                            {parts.length < MAX_PARTS && (
                                <button type="button" onClick={addPart} className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 font-extrabold text-slate-600 hover:border-slate-400">
                                    <Plus size={18} /> إضافة جزء
                                </button>
                            )}
                                                    </>
                    )}

                    {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!canConfirm}
                        className="mt-auto h-16 shrink-0 rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-lg shadow-emerald-600/20 transition active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none"
                    >
                        {busy ? 'جارٍ الحفظ…' : mode === 'split' && !splitReady ? (differenceCents > 0 ? `باقي ${money(differenceCents / 100)} لم يُوزّع` : 'المجموع أكبر من المطلوب') : 'إتمام البيع'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
