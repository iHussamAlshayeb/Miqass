import React, { useState } from 'react';
import { X } from 'lucide-react';
import Keypad from './Keypad';
import { money } from '../../utils/posPricing';

const PRESETS = [5, 10, 15, 20, 50];

/** خصم بند أو فاتورة: مبلغ بالريال أو نسبة مئوية */
const DiscountSheet = ({ title, base, initial, onApply, onClose }) => {
    const [type, setType] = useState(initial?.type || 'percent');
    const [value, setValue] = useState(initial?.value ? String(initial.value) : '');
    const numeric = Number(value) || 0;
    const amount = type === 'percent' ? (base * Math.min(numeric, 100)) / 100 : Math.min(numeric, base);
    const invalid = (type === 'percent' && numeric > 100) || (type === 'amount' && numeric > base);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-extrabold text-slate-900">{title}</h3>
                        <p className="text-sm font-semibold text-slate-500">على {money(base)} ر.س</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X size={22} /></button>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                    {[['percent', 'نسبة %'], ['amount', 'مبلغ ر.س']].map(([id, label]) => (
                        <button key={id} type="button" onClick={() => { setType(id); setValue(''); }} className={`h-11 rounded-lg font-extrabold ${type === id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>{label}</button>
                    ))}
                </div>
                {type === 'percent' && (
                    <div className="mb-3 flex gap-2">
                        {PRESETS.map((preset) => (
                            <button key={preset} type="button" onClick={() => setValue(String(preset))} className={`h-11 flex-1 rounded-lg border font-bold ${value === String(preset) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700'}`}>{preset}%</button>
                        ))}
                    </div>
                )}
                <div className="mb-3 flex h-14 items-center justify-between rounded-xl bg-slate-100 px-4">
                    <span className="text-sm font-bold text-slate-500">الخصم: <span className="font-mono" dir="ltr">{money(amount)}</span></span>
                    <span className="font-mono text-2xl font-bold" dir="ltr">{value || '0'}{type === 'percent' ? '%' : ''}</span>
                </div>
                <Keypad value={value} onChange={setValue} compact />
                {invalid && <p className="mt-2 text-sm font-bold text-red-600">{type === 'percent' ? 'النسبة لا تتجاوز 100%.' : 'الخصم أكبر من المبلغ.'}</p>}
                <div className="mt-4 flex gap-2">
                    {initial?.value ? (
                        <button type="button" onClick={() => onApply(null)} className="h-14 rounded-xl border border-red-200 px-4 font-bold text-red-600">إزالة الخصم</button>
                    ) : null}
                    <button type="button" disabled={invalid} onClick={() => onApply(numeric > 0 ? { type, value: numeric } : null)} className="h-14 flex-1 rounded-xl bg-slate-900 text-lg font-extrabold text-white disabled:opacity-50">تطبيق</button>
                </div>
            </div>
        </div>
    );
};

export default DiscountSheet;
