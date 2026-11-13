import React, { useState } from 'react';
import { X, Printer, LockKeyhole } from 'lucide-react';
import Keypad from './Keypad';
import { money } from '../../utils/posPricing';
import { methodLabel, printShiftReport, formatDateTime } from './posShared';

const Stat = ({ label, value, tone = 'slate' }) => (
    <div className={`rounded-xl px-4 py-3 ${tone === 'dark' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <p className={`text-xs font-bold ${tone === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>{label}</p>
        <p className="mt-1 font-mono text-xl font-extrabold" dir="ltr">{value}</p>
    </div>
);

/** إغلاق الصندوق: ملخص الوردية، النقد المعدود، والفرق عن المتوقع */
const CloseShiftModal = ({ shift, salonName, onClose, onConfirm, busy, error }) => {
    const [counted, setCounted] = useState('');
    const [note, setNote] = useState('');
    const s = shift?.summary || {};
    const expected = Number(s.expectedCash || 0);
    const difference = counted === '' ? null : Math.round((Number(counted) - expected) * 100) / 100;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
            <div className="grid max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[1.2fr_1fr]">
                <div className="flex flex-col gap-4 overflow-y-auto p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-2xl font-extrabold text-slate-900">إغلاق الوردية</h2>
                            <p className="text-sm font-semibold text-slate-500">منذ {formatDateTime(shift?.openedAt)}{shift?.openedBy ? ` · ${shift.openedBy}` : ''}</p>
                        </div>
                        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق">
                            <X size={24} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="عدد الفواتير" value={s.salesCount ?? 0} />
                        <Stat label="إجمالي المبيعات" value={money(s.salesTotal)} />
                        <Stat label="الخصومات" value={money(s.discountTotal)} />
                        <Stat label="الضريبة المضمنة" value={money(s.vatTotal)} />
                    </div>
                    <div className="rounded-xl border border-slate-200">
                        {['cash', 'card', 'transfer', 'online'].map((method) => (
                            <div key={method} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0">
                                <span className="font-bold text-slate-700">{methodLabel(method)} <span className="text-sm text-slate-400">({s.payments?.[method]?.count || 0})</span></span>
                                <span className="font-mono text-lg font-bold" dir="ltr">{money(s.payments?.[method]?.amount)}</span>
                            </div>
                        ))}
                    </div>
                    {s.unpaidCount > 0 && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{s.unpaidCount} فاتورة غير مكتملة الدفع في هذه الوردية.</p>
                    )}
                    <div className={`grid gap-3 ${s.cashExpenses > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        <Stat label="النقد الافتتاحي" value={money(shift?.openingCash)} />
                        {s.cashExpenses > 0 && <Stat label={`مصروفات من الصندوق (${s.cashExpensesCount})`} value={`-${money(s.cashExpenses)}`} />}
                        <Stat label="المتوقع في الدرج" value={money(expected)} tone="dark" />
                    </div>
                </div>

                <div className="flex flex-col gap-3 overflow-y-auto border-t border-slate-200 bg-slate-50 p-6 md:border-r md:border-t-0">
                    <span className="text-sm font-bold text-slate-600">النقد المعدود في الدرج</span>
                    <div className="flex h-16 items-center justify-between rounded-xl bg-white px-4 shadow-sm">
                        <span className="text-sm font-bold text-slate-500">ر.س</span>
                        <span className={`font-mono text-3xl font-bold ${counted === '' ? 'text-slate-300' : 'text-slate-900'}`} dir="ltr">{counted === '' ? '0' : counted}</span>
                    </div>
                    {difference !== null && (
                        <div className={`flex justify-between rounded-lg px-4 py-2 text-lg font-extrabold ${difference === 0 ? 'bg-emerald-100 text-emerald-800' : difference < 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                            <span>{difference === 0 ? 'مطابق' : difference < 0 ? 'عجز' : 'زيادة'}</span>
                            <span className="font-mono" dir="ltr">{money(Math.abs(difference))}</span>
                        </div>
                    )}
                    <Keypad value={counted} onChange={setCounted} compact />
                    <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={500}
                        placeholder="ملاحظة (اختياري)"
                        className="h-12 rounded-xl border border-slate-300 px-4 font-semibold outline-none focus:border-slate-900"
                    />
                    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                    <div className="mt-auto flex gap-2">
                        <button type="button" onClick={() => printShiftReport(shift, salonName)} className="flex h-14 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-700">
                            <Printer size={20} /> تقرير مبدئي
                        </button>
                        <button
                            type="button"
                            disabled={busy || counted === ''}
                            onClick={() => onConfirm({ countedCash: counted, note })}
                            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-lg font-extrabold text-white shadow disabled:opacity-50"
                        >
                            <LockKeyhole size={20} /> {busy ? 'جارٍ الإغلاق…' : 'إغلاق الوردية'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CloseShiftModal;
