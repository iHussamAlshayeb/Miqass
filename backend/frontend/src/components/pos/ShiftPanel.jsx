import React, { useCallback, useEffect, useState } from 'react';
import { Printer, ReceiptText, Wallet, X, MinusCircle, Plus } from 'lucide-react';
import posApi from '../../services/posApi';
import { money } from '../../utils/posPricing';
import Keypad from './Keypad';
import { METHODS, formatDateTime } from './posShared';

const STATUS = {
    Paid: ['مدفوعة', 'bg-emerald-50 text-emerald-700'],
    Partially_Paid: ['متبقي', 'bg-amber-50 text-amber-800'],
    Draft: ['غير مدفوعة', 'bg-red-50 text-red-700'],
    Cancelled: ['ملغاة', 'bg-slate-100 text-slate-500'],
};
const QUICK_EXPENSES = ['ماء وضيافة', 'أدوات تنظيف', 'مستلزمات حلاقة', 'توصيل'];
const errorText = (error, fallback) => error?.response?.data?.message || fallback;

/** لوحة الوردية: فواتير الوردية (إعادة طباعة وتسديد المتبقي) ومصروفات الصندوق */
const ShiftPanel = ({ onClose, onReceipt, onChanged, onToast }) => {
    const [tab, setTab] = useState('sales');
    const [sales, setSales] = useState(null);
    const [expenses, setExpenses] = useState(null);
    const [payTarget, setPayTarget] = useState(null);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [description, setDescription] = useState('');
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        posApi.get('/pos/shift/sales').then((res) => setSales(res.data.sales || [])).catch(() => setSales([]));
        posApi.get('/pos/shift/expenses').then((res) => setExpenses(res.data.expenses || [])).catch(() => setExpenses([]));
    }, []);
    useEffect(() => { load(); }, [load]);

    const resetForm = () => { setPayTarget(null); setAdding(false); setAmount(''); setDescription(''); setMethod('cash'); setError(''); };

    const submitPayment = async () => {
        setBusy(true);
        setError('');
        try {
            await posApi.post(`/pos/sales/${payTarget._id}/payments`, { method, amount: Number(amount) });
            onToast('تم تسديد الدفعة.');
            resetForm();
            load();
            onChanged();
        } catch (err) {
            setError(errorText(err, 'تعذر تسجيل الدفعة.'));
        } finally {
            setBusy(false);
        }
    };

    const submitExpense = async () => {
        setBusy(true);
        setError('');
        try {
            await posApi.post('/pos/shift/expenses', { amount: Number(amount), description });
            onToast('تم تسجيل المصروف من الصندوق.');
            resetForm();
            load();
            onChanged();
        } catch (err) {
            setError(errorText(err, 'تعذر تسجيل المصروف.'));
        } finally {
            setBusy(false);
        }
    };

    const expensesTotal = (expenses || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const remaining = payTarget ? Math.round((payTarget.totalAmount - payTarget.paidAmount) * 100) / 100 : 0;
    const formOpen = Boolean(payTarget) || adding;

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/50" onClick={onClose}>
            <aside className="flex h-full w-full max-w-xl flex-col bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                    <h2 className="text-xl font-extrabold text-slate-900">الوردية الحالية</h2>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X size={24} /></button>
                </div>
                <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-white p-2">
                    {[['sales', 'الفواتير', <ReceiptText key="s" size={18} />, sales?.length], ['expenses', 'مصروفات الصندوق', <MinusCircle key="e" size={18} />, expenses?.length]].map(([id, label, icon, count]) => (
                        <button key={id} type="button" onClick={() => { setTab(id); resetForm(); }} className={`flex h-11 items-center justify-center gap-2 rounded-lg font-extrabold ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>
                            {icon} {label} {count ? <span className="text-xs opacity-70">({count})</span> : null}
                        </button>
                    ))}
                </div>

                {formOpen ? (
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-extrabold text-slate-900">{payTarget ? `تسديد فاتورة ${payTarget.invoiceNumber || ''}` : 'مصروف من الصندوق'}</h3>
                            <button type="button" onClick={resetForm} className="text-sm font-bold text-slate-500">رجوع</button>
                        </div>
                        {payTarget && <p className="text-sm font-bold text-slate-600">المتبقي: <span className="font-mono" dir="ltr">{money(remaining)}</span></p>}
                        {payTarget && (
                            <div className="grid grid-cols-4 gap-2">
                                {METHODS.filter((item) => item.id !== 'online').map((item) => (
                                    <button key={item.id} type="button" onClick={() => setMethod(item.id)} className={`h-11 rounded-lg border font-bold ${method === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{item.label}</button>
                                ))}
                                <button type="button" onClick={() => setAmount(String(remaining))} className="h-11 rounded-lg border border-emerald-200 bg-emerald-50 font-bold text-emerald-700">كامل</button>
                            </div>
                        )}
                        {!payTarget && (
                            <>
                                <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="وصف المصروف" className="h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold outline-none focus:border-slate-900" />
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_EXPENSES.map((item) => (
                                        <button key={item} type="button" onClick={() => setDescription(item)} className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600">{item}</button>
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="flex h-16 items-center justify-between rounded-xl bg-white px-4 shadow-sm">
                            <span className="text-sm font-bold text-slate-500">ر.س</span>
                            <span className={`font-mono text-3xl font-bold ${amount ? 'text-slate-900' : 'text-slate-300'}`} dir="ltr">{amount || '0'}</span>
                        </div>
                        <Keypad value={amount} onChange={setAmount} compact />
                        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                        <button
                            type="button"
                            disabled={busy || !(Number(amount) > 0) || (!payTarget && !description.trim())}
                            onClick={payTarget ? submitPayment : submitExpense}
                            className={`mt-auto h-14 rounded-xl text-lg font-extrabold text-white disabled:opacity-50 ${payTarget ? 'bg-emerald-600' : 'bg-slate-900'}`}
                        >
                            {busy ? 'جاري الحفظ...' : payTarget ? 'تسجيل الدفعة' : 'صرف من الصندوق'}
                        </button>
                    </div>
                ) : tab === 'sales' ? (
                    <div className="flex-1 space-y-2 overflow-y-auto p-4">
                        {sales === null ? <p className="mt-10 text-center font-bold text-slate-400">جاري التحميل...</p>
                            : sales.length === 0 ? <p className="mt-10 text-center font-bold text-slate-400">لا توجد فواتير في هذه الوردية بعد.</p>
                                : sales.map((sale) => {
                                    const [label, tone] = STATUS[sale.status] || [sale.status, 'bg-slate-100 text-slate-600'];
                                    const due = Math.round((sale.totalAmount - sale.paidAmount) * 100) / 100;
                                    return (
                                        <div key={sale._id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                                            <div className="min-w-0 flex-1">
                                                <p className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                                                    <span className="font-mono" dir="ltr">{sale.invoiceNumber || '—'}</span>
                                                    <span className={`rounded-md px-2 py-0.5 text-xs ${tone}`}>{label}</span>
                                                </p>
                                                <p className="truncate text-xs font-semibold text-slate-500">{sale.customerSnapshot?.name || sale.customerSnapshot?.phone || 'عميل'} · {formatDateTime(sale.createdAt)}</p>
                                            </div>
                                            <div className="text-left">
                                                <p className="font-mono text-base font-extrabold" dir="ltr">{money(sale.totalAmount)}</p>
                                                {due > 0 && sale.status !== 'Cancelled' && <p className="font-mono text-xs font-bold text-amber-700" dir="ltr">-{money(due)}</p>}
                                            </div>
                                            {due > 0 && sale.status !== 'Cancelled' && (
                                                <button type="button" onClick={() => { setPayTarget(sale); setAmount(String(due)); }} className="flex h-10 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white"><Wallet size={16} /> تسديد</button>
                                            )}
                                            <button type="button" onClick={() => onReceipt(sale._id)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600" aria-label="طباعة الإيصال"><Printer size={18} /></button>
                                        </div>
                                    );
                                })}
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="flex-1 space-y-2 overflow-y-auto p-4">
                            {expenses === null ? <p className="mt-10 text-center font-bold text-slate-400">جاري التحميل...</p>
                                : expenses.length === 0 ? <p className="mt-10 text-center font-bold text-slate-400">لم يُصرف شيء من الصندوق في هذه الوردية.</p>
                                    : expenses.map((expense) => (
                                        <div key={expense._id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-extrabold text-slate-800">{expense.description || expense.category}</p>
                                                <p className="truncate text-xs font-semibold text-slate-500">{expense.recordedBy ? `${expense.recordedBy} · ` : ''}{formatDateTime(expense.createdAt)}</p>
                                            </div>
                                            <p className="font-mono text-base font-extrabold text-red-600" dir="ltr">-{money(expense.amount)}</p>
                                        </div>
                                    ))}
                        </div>
                        <div className="flex items-center gap-3 border-t border-slate-200 bg-white p-4">
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-500">إجمالي المصروف من الدرج</p>
                                <p className="font-mono text-lg font-extrabold" dir="ltr">{money(expensesTotal)}</p>
                            </div>
                            <button type="button" onClick={() => { setAdding(true); setError(''); }} className="flex h-12 items-center gap-2 rounded-xl bg-slate-900 px-5 font-extrabold text-white"><Plus size={18} /> مصروف جديد</button>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
};

export default ShiftPanel;
