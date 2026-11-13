import React, { useState } from 'react';
import { LockOpen, ArrowRight } from 'lucide-react';
import Keypad from './Keypad';
import { money } from '../../utils/posPricing';

/** شاشة فتح الوردية: لا يبدأ البيع قبل تسجيل النقد الافتتاحي في الصندوق */
const OpenShiftGate = ({ salon, onOpen, onExit, exitLabel = 'العودة للوحة التحكم', cashierName = '', busy, error }) => {
    const [cash, setCash] = useState('');
    const [name, setName] = useState(() => {
        try { return localStorage.getItem('pos_cashier_name') || ''; } catch { return ''; }
    });

    const submit = () => {
        try { localStorage.setItem('pos_cashier_name', name.trim()); } catch { /* تجاهل */ }
        onOpen({ openingCash: cash === '' ? '0' : cash, openedBy: cashierName || name.trim() });
    };

    return (
        <div className="flex min-h-full items-center justify-center p-6">
            <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
                <div className="flex flex-col justify-between gap-8 bg-slate-900 p-8 text-white">
                    <div>
                        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                            <LockOpen size={28} />
                        </div>
                        <p className="text-sm font-semibold text-slate-400">{salon?.name}</p>
                        <h1 className="mt-1 text-3xl font-extrabold leading-tight">افتح الوردية</h1>
                        <p className="mt-3 text-base leading-relaxed text-slate-300">
                            اعدّ النقد الموجود في الدرج الآن وأدخله. عند الإغلاق نقارن المعدود بالمتوقع.
                        </p>
                    </div>
                    <button type="button" onClick={onExit} className="flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">
                        <ArrowRight size={18} /> {exitLabel}
                    </button>
                </div>
                <div className="flex flex-col gap-4 p-6">
                    {cashierName ? (
                        <p className="rounded-xl bg-slate-100 px-4 py-3 text-base font-bold text-slate-700">الكاشير: {cashierName}</p>
                    ) : <label className="block">
                        <span className="text-sm font-bold text-slate-600">اسم الكاشير (اختياري)</span>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={80}
                            className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-4 text-lg font-semibold outline-none focus:border-slate-900"
                        />
                    </label>}
                    <div>
                        <span className="text-sm font-bold text-slate-600">النقد الافتتاحي</span>
                        <div className="mt-1 flex h-16 items-center justify-between rounded-xl bg-slate-100 px-4">
                            <span className="text-sm font-bold text-slate-500">ر.س</span>
                            <span className="font-mono text-3xl font-bold text-slate-900" dir="ltr">{cash === '' ? '0' : cash}</span>
                        </div>
                    </div>
                    <Keypad value={cash} onChange={setCash} compact />
                    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={submit}
                        className="h-16 rounded-xl bg-emerald-600 text-xl font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
                    >
                        {busy ? 'جارٍ الفتح…' : `فتح الوردية بـ ${money(cash || 0)} ر.س`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OpenShiftGate;
