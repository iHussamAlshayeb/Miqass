import React, { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, ListChecks, RefreshCw, Save, Tags, XCircle } from 'lucide-react';
import API from '../../services/api';

const toMoney = (value) => Number(value || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
    category: 'تشغيل',
    description: '',
    amount: '',
    expenseDate: today(),
    paymentMethod: 'cash',
    vendorName: '',
};

const methodLabels = {
    cash: 'نقدي',
    card: 'شبكة',
    transfer: 'تحويل',
    online: 'أونلاين',
    other: 'أخرى',
};

const statusLabels = {
    Paid: 'مدفوع',
    Pending: 'معلق',
    Cancelled: 'ملغي',
};

const ExpensesTab = () => {
    const [expenses, setExpenses] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const summary = useMemo(() => {
        const paidExpenses = expenses.filter((expense) => expense.status === 'Paid');
        const totalPaid = paidExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        const byCategory = paidExpenses.reduce((acc, expense) => {
            acc[expense.category] = (acc[expense.category] || 0) + Number(expense.amount || 0);
            return acc;
        }, {});

        return {
            totalPaid,
            count: paidExpenses.length,
            topCategories: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4),
        };
    }, [expenses]);

    const fetchExpenses = async () => {
        setIsLoading(true);
        try {
            const res = await API.get('/expenses?limit=100');
            setExpenses(res.data.expenses || []);
        } catch (error) {
            setMessage(error.response?.data?.message || 'تعذر جلب المصروفات.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    const updateForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const createExpense = async () => {
        if (!form.description.trim() || Number(form.amount) <= 0) {
            setMessage('اكتب وصف المصروف والمبلغ بشكل صحيح.');
            return;
        }

        setIsSaving(true);
        setMessage('');

        try {
            const res = await API.post('/expenses', {
                ...form,
                amount: Number(form.amount),
            });
            setMessage(res.data.message || 'تم تسجيل المصروف.');
            setForm({ ...emptyForm, expenseDate: today() });
            fetchExpenses();
        } catch (error) {
            setMessage(error.response?.data?.message || 'حدث خطأ أثناء تسجيل المصروف.');
        } finally {
            setIsSaving(false);
        }
    };

    const cancelExpense = async (expense) => {
        if (!window.confirm(`إلغاء المصروف: ${expense.description}؟`)) return;

        try {
            const res = await API.post(`/expenses/${expense._id}/cancel`, {
                cancelReason: 'تم الإلغاء من لوحة التحكم',
            });
            setMessage(res.data.message || 'تم إلغاء المصروف.');
            fetchExpenses();
        } catch (error) {
            setMessage(error.response?.data?.message || 'تعذر إلغاء المصروف.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-red-100 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">إجمالي المصروفات</p>
                        <CircleDollarSign size={18} className="text-red-600" />
                    </div>
                    <h3 className="text-2xl font-black text-red-700 mt-2">{toMoney(summary.totalPaid)} ر.س</h3>
                </div>
                <div className="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">عدد العمليات</p>
                        <ListChecks size={18} className="text-slate-500" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mt-2">{summary.count}</h3>
                </div>
                <div className="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">أعلى تصنيف</p>
                        <Tags size={18} className="text-slate-500" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mt-3">
                        {summary.topCategories[0]?.[0] || 'لا يوجد'}
                    </h3>
                </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">المصروفات</h2>
                        <p className="text-sm font-bold text-slate-400 mt-1">سجل مصاريف التشغيل والمشتريات والخدمات.</p>
                    </div>
                    <button
                        type="button"
                        onClick={fetchExpenses}
                        className="inline-flex items-center justify-center gap-2 bg-slate-50 text-slate-600 border border-slate-100 px-4 py-2 rounded-lg font-black text-sm hover:bg-slate-100"
                    >
                        <RefreshCw size={15} />
                        تحديث
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
                    <div className="overflow-x-auto">
                        {isLoading ? (
                            <div className="py-16 text-center font-bold text-slate-400 animate-pulse">جاري تحميل المصروفات...</div>
                        ) : expenses.length === 0 ? (
                            <div className="py-16 text-center font-bold text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                لا توجد مصروفات مسجلة.
                            </div>
                        ) : (
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="text-slate-400 border-b border-slate-100">
                                        <th className="py-3 text-right">الوصف</th>
                                        <th className="py-3 text-right">التصنيف</th>
                                        <th className="py-3 text-right">التاريخ</th>
                                        <th className="py-3 text-right">الحالة</th>
                                        <th className="py-3 text-left">المبلغ</th>
                                        <th className="py-3 text-left">إجراء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((expense) => (
                                        <tr key={expense._id} className="border-b border-slate-50 last:border-0">
                                            <td className="py-3">
                                                <div className="font-black text-slate-800">{expense.description}</div>
                                                <div className="text-xs font-bold text-slate-400 mt-1">{expense.vendorName || methodLabels[expense.paymentMethod]}</div>
                                            </td>
                                            <td className="py-3 font-bold text-slate-500">{expense.category}</td>
                                            <td className="py-3 font-bold text-slate-500">{new Date(expense.expenseDate).toLocaleDateString('en-GB')}</td>
                                            <td className="py-3">
                                                <span className={`px-3 py-1 rounded-lg font-black text-xs ${expense.status === 'Cancelled' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {statusLabels[expense.status] || expense.status}
                                                </span>
                                            </td>
                                            <td className="py-3 text-left font-black text-slate-800 whitespace-nowrap">{toMoney(expense.amount)} ر.س</td>
                                            <td className="py-3 text-left">
                                                {expense.status !== 'Cancelled' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => cancelExpense(expense)}
                                                        className="inline-flex items-center justify-center gap-1.5 bg-red-50 text-red-600 px-3 py-2 rounded-lg font-black text-xs hover:bg-red-100"
                                                    >
                                                        <XCircle size={13} />
                                                        إلغاء
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <aside className="bg-slate-50 border border-slate-100 rounded-lg p-5 space-y-3 h-fit">
                        <h3 className="text-sm font-black text-slate-700">مصروف جديد</h3>
                        <input value={form.description} onChange={(e) => updateForm('description', e.target.value)} placeholder="الوصف" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        <input value={form.category} onChange={(e) => updateForm('category', e.target.value)} placeholder="التصنيف" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        <input value={form.vendorName} onChange={(e) => updateForm('vendorName', e.target.value)} placeholder="المورد اختياري" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input type="number" min="0" value={form.amount} onChange={(e) => updateForm('amount', e.target.value)} placeholder="المبلغ" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                            <input type="date" value={form.expenseDate} onChange={(e) => updateForm('expenseDate', e.target.value)} className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        </div>
                        <select value={form.paymentMethod} onChange={(e) => updateForm('paymentMethod', e.target.value)} className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-black outline-none focus:border-blue-300">
                            {Object.entries(methodLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={createExpense}
                            disabled={isSaving}
                            className="inline-flex w-full items-center justify-center gap-2 bg-red-600 text-white py-4 rounded-lg font-black hover:bg-red-700 disabled:bg-red-300 active:scale-95 transition-all"
                        >
                            <Save size={16} />
                            {isSaving ? 'جاري الحفظ...' : 'تسجيل المصروف'}
                        </button>
                        {message && <div className="bg-white border border-slate-100 rounded-lg p-3 text-sm font-bold text-slate-600">{message}</div>}
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default ExpensesTab;
