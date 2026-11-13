import React, { useEffect, useState } from 'react';
import { Banknote, ClipboardCheck, ReceiptText, RefreshCw } from 'lucide-react';
import API from '../../services/api';
import InvoiceModal from './InvoiceModal';

const paymentMethodLabels = {
    cash: 'نقدي',
    card: 'شبكة',
    transfer: 'تحويل',
    online: 'أونلاين',
};

const statusLabels = {
    Draft: 'مسودة',
    Paid: 'مدفوع',
    Partially_Paid: 'مدفوع جزئياً',
    Refunded: 'مسترجع',
    Cancelled: 'ملغي',
};
const sourceLabels = { appointment: 'مرتبط بحجز', walk_in: 'مباشر', pos: 'بيع مباشر' };
const zakatyStatusLabels = {
    NotSubmitted: 'لم تُرسل', Submitting: 'قيد الإرسال', Accepted: 'مقبولة',
    AcceptedWithWarnings: 'مقبولة مع ملاحظات', Rejected: 'مرفوضة',
    RetryPending: 'بانتظار إعادة المحاولة', Failed: 'فشلت', Unknown: 'الحالة غير مؤكدة', Conflict: 'تعارض في المعرف',
};

const toMoney = (value) => Number(value || 0).toFixed(2);

const getRemainingAmount = (sale) =>
    Math.max(Number(sale.totalAmount || 0) - Number(sale.paidAmount || 0), 0);

const getStatusClass = (status) => {
    if (status === 'Paid') return 'bg-emerald-50 text-emerald-700';
    if (status === 'Partially_Paid') return 'bg-blue-50 text-blue-700';
    if (status === 'Cancelled') return 'bg-red-50 text-red-700';
    return 'bg-amber-50 text-amber-700';
};

// سجل المبيعات: عرض الفواتير وطباعتها، تسديد المتبقي، والإرسال إلى Zakaty.
// البيع نفسه يتم من شاشة نقطة البيع باللمس (/pos).
const SalesTab = () => {
    const [sales, setSales] = useState([]);
    const [isLoadingSales, setIsLoadingSales] = useState(false);
    const [payingSaleId, setPayingSaleId] = useState(null);
    const [paymentDrafts, setPaymentDrafts] = useState({});
    const [invoiceData, setInvoiceData] = useState(null);
    const [zakatyCheck, setZakatyCheck] = useState(null);
    const [message, setMessage] = useState('');

    const fetchSales = async () => {
        setIsLoadingSales(true);
        try {
            const res = await API.get('/sales?limit=50');
            setSales(res.data.sales || []);
        } catch (error) {
            console.error('Sales fetch error:', error);
        } finally {
            setIsLoadingSales(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, []);

    const getPaymentDraft = (sale) => paymentDrafts[sale._id] || {
        method: 'cash',
        amount: toMoney(getRemainingAmount(sale)),
    };

    const updatePaymentDraft = (saleId, patch) => {
        setPaymentDrafts((prev) => ({
            ...prev,
            [saleId]: {
                method: prev[saleId]?.method || 'cash',
                amount: prev[saleId]?.amount || '',
                ...patch,
            },
        }));
    };

    const addPaymentToSale = async (sale) => {
        const draft = getPaymentDraft(sale);
        const amount = Number(draft.amount);

        if (!amount || amount <= 0) {
            setMessage('اكتب مبلغ دفع صحيح.');
            return;
        }

        setPayingSaleId(sale._id);
        setMessage('');

        try {
            const res = await API.post(`/sales/${sale._id}/payments`, {
                method: draft.method,
                amount,
            });
            setMessage(res.data.message || 'تم تسجيل الدفعة.');
            setPaymentDrafts((prev) => {
                const next = { ...prev };
                delete next[sale._id];
                return next;
            });
            fetchSales();
        } catch (error) {
            setMessage(error.response?.data?.message || 'حدث خطأ أثناء تسجيل الدفعة.');
        } finally {
            setPayingSaleId(null);
        }
    };

    const showSaleInvoice = async (sale) => {
        try {
            const res = await API.get(`/sales/${sale._id}/invoice`);
            setInvoiceData(res.data.invoice);
        } catch (error) {
            setMessage(error.response?.data?.message || 'تعذر جلب الفاتورة.');
        }
    };

    const checkZakatyReadiness = async (sale) => {
        setZakatyCheck({ saleId: sale._id, invoiceNumber: sale.invoiceNumber, loading: true });
        try {
            const { data } = await API.get(`/sales/${sale._id}/zakaty-readiness`);
            setZakatyCheck({ saleId: sale._id, ...data, loading: false });
        } catch (error) {
            setZakatyCheck({ saleId: sale._id, invoiceNumber: sale.invoiceNumber, issues: [error.response?.data?.message || 'تعذر فحص الفاتورة.'], ready: false, loading: false });
        }
    };

    const processZakaty = async (reconcile = false) => {
        const saleId = zakatyCheck?.saleId;
        if (!saleId) return;
        if (!reconcile && !window.confirm(`إرسال الفاتورة ${zakatyCheck.invoiceNumber} إلى Zakaty؟`)) return;
        setZakatyCheck((current) => ({ ...current, loading: true }));
        try {
            const endpoint = reconcile ? 'reconcile' : 'submit';
            const { data } = await API.post(`/sales/${saleId}/zakaty/${endpoint}`);
            setZakatyCheck((current) => ({ ...current, loading: false, zakatyStatus: data.zakaty.status, statusMessage: data.zakaty.lastError || '', ready: false }));
            fetchSales();
        } catch (error) {
            setZakatyCheck((current) => ({ ...current, loading: false, ready: false, zakatyStatus: 'Unknown', statusMessage: error.response?.data?.message || 'تعذر الاتصال بـ Zakaty.' }));
        }
    };

    return (
        <div className="space-y-6">
            {message && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">{message}</div>
            )}
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">آخر المبيعات</h3>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">البيع يتم من «نقطة البيع» في القائمة، والفواتير تظهر هنا.</p>
                    </div>
                    <button
                        type="button"
                        onClick={fetchSales}
                        className="inline-flex items-center justify-center gap-2 bg-slate-50 text-slate-600 border border-slate-100 px-4 py-2 rounded-lg font-black text-sm hover:bg-slate-100"
                    >
                        <RefreshCw size={15} />
                        تحديث
                    </button>
                </div>

                {isLoadingSales ? (
                    <div className="py-8 text-center font-bold text-slate-400 animate-pulse">جاري تحميل المبيعات...</div>
                ) : sales.length === 0 ? (
                    <div className="py-8 text-center font-bold text-slate-400">لا توجد مبيعات مسجلة بعد.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-slate-100">
                                    <th className="py-3 text-right">الفاتورة</th>
                                    <th className="py-3 text-right">العميل</th>
                                    <th className="py-3 text-right">المصدر</th>
                                    <th className="py-3 text-right">الحالة</th>
                                    <th className="py-3 text-right">المدفوع</th>
                                    <th className="py-3 text-left">الإجمالي</th>
                                    <th className="py-3 text-left">إجراء</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map((sale) => {
                                    const remainingAmount = getRemainingAmount(sale);
                                    const draft = getPaymentDraft(sale);
                                    const canPay = sale.status !== 'Paid' && sale.status !== 'Cancelled' && remainingAmount > 0;

                                    return (
                                        <tr key={sale._id} className="border-b border-slate-50 last:border-0 align-top">
                                            <td className="py-3 font-black text-slate-800">{sale.invoiceNumber}</td>
                                            <td className="py-3 font-bold text-slate-500">{sale.customerSnapshot?.name || 'عميل نقدي'}</td>
                                            <td className="py-3 text-xs font-bold text-slate-500">{sourceLabels[sale.source] || sale.source}</td>
                                            <td className="py-3">
                                                <span className={`${getStatusClass(sale.status)} px-3 py-1 rounded-lg font-black text-xs whitespace-nowrap`}>
                                                    {statusLabels[sale.status] || sale.status}
                                                </span>
                                            </td>
                                            <td className="py-3 font-bold text-slate-500 whitespace-nowrap">
                                                {toMoney(sale.paidAmount)} ر.س
                                                {canPay && (
                                                    <div className="text-[11px] text-amber-600 mt-1">
                                                        المتبقي {toMoney(remainingAmount)} ر.س
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 text-left font-black text-slate-800 whitespace-nowrap">{toMoney(sale.totalAmount)} ر.س</td>
                                            <td className="py-3">
                                                <div className="flex flex-col lg:flex-row gap-2 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => showSaleInvoice(sale)}
                                                        className="inline-flex items-center justify-center gap-1.5 bg-slate-50 text-slate-700 border border-slate-100 px-3 py-2 rounded-lg font-black text-xs hover:bg-slate-100 whitespace-nowrap"
                                                    >
                                                        <ReceiptText size={13} />
                                                        فاتورة
                                                    </button>
                                                    {sale.status === 'Paid' && (
                                                        <button type="button" title="فحص جاهزية Zakaty" onClick={() => checkZakatyReadiness(sale)} className="inline-flex items-center justify-center gap-1.5 bg-slate-50 text-slate-700 border border-slate-100 px-3 py-2 rounded-lg font-black text-xs hover:bg-slate-100 whitespace-nowrap">
                                                            <ClipboardCheck size={13} />Zakaty
                                                        </button>
                                                    )}

                                                    {canPay && (
                                                        <>
                                                            <select
                                                                value={draft.method}
                                                                onChange={(e) => updatePaymentDraft(sale._id, { method: e.target.value })}
                                                                className="bg-white border border-slate-100 rounded-lg px-2 py-2 font-black text-xs outline-none min-w-24"
                                                            >
                                                                {Object.entries(paymentMethodLabels).map(([value, label]) => (
                                                                    <option key={value} value={value}>{label}</option>
                                                                ))}
                                                            </select>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={remainingAmount}
                                                                value={draft.amount}
                                                                onChange={(e) => updatePaymentDraft(sale._id, { amount: e.target.value })}
                                                                className="bg-white border border-slate-100 rounded-lg px-2 py-2 font-black text-xs outline-none w-24 text-left"
                                                            />
                                                            <button
                                                                type="button"
                                                                disabled={payingSaleId === sale._id}
                                                                onClick={() => addPaymentToSale(sale)}
                                                                className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg font-black text-xs hover:bg-emerald-700 disabled:bg-emerald-300 whitespace-nowrap"
                                                            >
                                                                <Banknote size={13} />
                                                                {payingSaleId === sale._id ? '...' : 'تسديد'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {zakatyCheck && (
                    <div role="status" className="mt-4 border-t border-slate-200 pt-4 text-sm">
                        <p className="font-bold text-slate-800">فحص {zakatyCheck.invoiceNumber}: {zakatyCheck.loading ? 'جاري الفحص...' : zakatyCheck.zakatyStatus && zakatyCheck.zakatyStatus !== 'NotSubmitted' ? zakatyStatusLabels[zakatyCheck.zakatyStatus] || zakatyCheck.zakatyStatus : zakatyCheck.ready ? 'البيانات جاهزة' : 'توجد متطلبات ناقصة'}</p>
                        {!zakatyCheck.loading && zakatyCheck.issues?.length > 0 && (
                            <ul className="mt-2 list-disc list-inside space-y-1 text-amber-800">{zakatyCheck.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                        )}
                        {!zakatyCheck.loading && <p className="mt-2 text-xs text-slate-500">الفحص لا يرسل الفاتورة إلى Zakaty أو هيئة الزكاة.</p>}
                        {zakatyCheck.statusMessage && <p role="alert" className="mt-2 text-sm text-amber-800">{zakatyCheck.statusMessage}</p>}
                        {!zakatyCheck.loading && zakatyCheck.ready && zakatyCheck.zakatyStatus === 'NotSubmitted' && (
                            <button type="button" onClick={() => processZakaty(false)} className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">إرسال الفاتورة إلى Zakaty</button>
                        )}
                        {!zakatyCheck.loading && ['Submitting', 'Unknown', 'RetryPending', 'Failed', 'Rejected'].includes(zakatyCheck.zakatyStatus) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => processZakaty(true)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">الاستعلام عن الحالة</button>
                                {zakatyCheck.zakatyStatus === 'Unknown' && <button type="button" onClick={() => processZakaty(false)} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white">إعادة المحاولة بالمعرّف نفسه</button>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {invoiceData && (
                <InvoiceModal
                    invoice={invoiceData}
                    onClose={() => setInvoiceData(null)}
                />
            )}
        </div>
    );
};

export default SalesTab;
