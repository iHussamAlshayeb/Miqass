import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, ClipboardCheck, ReceiptText, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
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

const SalesTab = ({ services = [], checkoutAppointment = null, onClearCheckout, onSaleSaved = () => {} }) => {
    const [items, setItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [isPaymentAmountManual, setIsPaymentAmountManual] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const requestIdRef = useRef(null);
    const [sales, setSales] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingSales, setIsLoadingSales] = useState(false);
    const [isCheckingCheckout, setIsCheckingCheckout] = useState(false);
    const [isCheckoutReady, setIsCheckoutReady] = useState(true);
    const [payingSaleId, setPayingSaleId] = useState(null);
    const [paymentDrafts, setPaymentDrafts] = useState({});
    const [invoiceData, setInvoiceData] = useState(null);
    const [zakatyCheck, setZakatyCheck] = useState(null);
    const [message, setMessage] = useState('');

    const totalAmount = useMemo(
        () => items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0),
        [items],
    );
    const depositAmount = checkoutAppointment?.payment?.status === 'Paid'
        ? Number(checkoutAppointment.payment.amount || 0) : 0;
    const remainingAmount = Math.max(totalAmount - depositAmount, 0);
    const visibleProducts = useMemo(() => products.filter((product) =>
        [product.name, product.sku, product.barcode].some((value) =>
            String(value || '').toLowerCase().includes(productSearch.trim().toLowerCase()))),
    [products, productSearch]);

    useEffect(() => {
        if (!isPaymentAmountManual) {
            setPaymentAmount(remainingAmount ? String(toMoney(remainingAmount)) : '');
        }
    }, [isPaymentAmountManual, remainingAmount]);

    useEffect(() => {
        requestIdRef.current = null;
    }, [items, customerName, customerPhone, paymentMethod, paymentAmount]);

    const fetchSales = async () => {
        setIsLoadingSales(true);
        try {
            const res = await API.get('/sales?limit=10');
            setSales(res.data.sales || []);
        } catch (error) {
            console.error('Sales fetch error:', error);
        } finally {
            setIsLoadingSales(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const res = await API.get('/products');
            setProducts(res.data.products || []);
        } catch (error) {
            console.error('Products fetch error:', error);
        }
    };

    useEffect(() => {
        fetchSales();
        fetchProducts();
    }, []);

    useEffect(() => {
        if (!checkoutAppointment?._id) {
            setIsCheckoutReady(true);
            return undefined;
        }
        let cancelled = false;
        setItems([]);
        setIsCheckingCheckout(true);
        setIsCheckoutReady(false);
        API.get('/sales', { params: { appointmentId: checkoutAppointment._id, limit: 1 } })
            .then((res) => {
                if (cancelled) return;
                if (res.data.sales?.length) {
                    setItems([]);
                    setMessage('هذا الحجز مرتبط بعملية بيع مسبقاً. يمكنك مراجعتها أو تسديد المتبقي من سجل المبيعات.');
                    onClearCheckout();
                    fetchSales();
                    return;
                }
                const bookedServices = checkoutAppointment.selectedServices || [];
                const bookedItems = bookedServices.map((service, index) => ({
                    key: `booked-${checkoutAppointment._id}-${index}`,
                    itemType: 'service',
                    serviceId: service.serviceId,
                    name: service.name,
                    unitPrice: Number(service.price || 0),
                    quantity: 1,
                    booked: true,
                }));
                if (!bookedItems.length && Number(checkoutAppointment.totalPrice) > 0) {
                    bookedItems.push({ key: `booked-${checkoutAppointment._id}`, itemType: 'service', name: 'خدمة حلاقة', unitPrice: Number(checkoutAppointment.totalPrice), quantity: 1, booked: true });
                }
                setItems(bookedItems);
                setCustomerName(checkoutAppointment.childName || '');
                setCustomerPhone(checkoutAppointment.customerPhone || '');
                setIsPaymentAmountManual(false);
                setIsCheckoutReady(true);
                setMessage('');
            })
            .catch(() => {
                if (!cancelled) setMessage('تعذر التحقق من عملية البيع المرتبطة بالحجز. حاول مرة أخرى.');
            })
            .finally(() => { if (!cancelled) setIsCheckingCheckout(false); });
        return () => { cancelled = true; };
    }, [checkoutAppointment, onClearCheckout]);

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

    const addProductItem = (product) => {
        const productId = product._id || product.id;
        if (!productId || Number(product.stockQuantity || 0) <= 0) return;

        setMessage('');
        setItems((prev) => {
            const existing = prev.find((item) => item.itemType === 'product' && item.productId === productId);
            if (existing) {
                const nextQuantity = Math.min(Number(existing.quantity || 1) + 1, Number(product.stockQuantity || 0));
                return prev.map((item) =>
                    item.key === existing.key
                        ? { ...item, quantity: nextQuantity }
                        : item,
                );
            }

            return [
                ...prev,
                {
                    key: `product-${productId}-${Date.now()}`,
                    itemType: 'product',
                    productId,
                    name: product.name,
                    quantity: 1,
                    unitPrice: Number(product.salePrice || 0),
                    stockQuantity: Number(product.stockQuantity || 0),
                },
            ];
        });
    };

    const addServiceItem = (service) => {
        const serviceId = service._id || service.id;
        if (!serviceId) return;
        setMessage('');
        setItems((prev) => {
            const existing = prev.find((item) => item.itemType === 'service' && item.serviceId === serviceId && !item.booked);
            if (existing) return prev.map((item) => item.key === existing.key ? { ...item, quantity: item.quantity + 1 } : item);
            return [...prev, { key: `service-${serviceId}`, itemType: 'service', serviceId, name: service.name, quantity: 1, unitPrice: Number(service.price || 0) }];
        });
    };

    const updateQuantity = (key, quantity) => {
        const item = items.find((currentItem) => currentItem.key === key);
        if (item?.booked) return;
        const maxQuantity = item?.itemType === 'product' ? Math.max(Number(item.stockQuantity || 1), 1) : 10000;
        const cleanQuantity = Math.min(Math.max(Math.floor(Number(quantity)) || 1, 1), maxQuantity);
        setItems((prev) =>
            prev.map((item) => (item.key === key ? { ...item, quantity: cleanQuantity } : item)),
        );
    };

    const removeItem = (key) => {
        setItems((prev) => prev.filter((item) => item.key !== key || item.booked));
    };

    const resetSaleForm = () => {
        setItems([]);
        setCustomerName('');
        setCustomerPhone('');
        setPaymentMethod('cash');
        setPaymentAmount('');
        setIsPaymentAmountManual(false);
        requestIdRef.current = null;
        onClearCheckout();
    };

    const createSale = async () => {
        if (items.length === 0) {
            setMessage('أضف خدمة أو منتجاً قبل حفظ البيع.');
            return;
        }

        setIsSaving(true);
        setMessage('');

        try {
            const cleanPaymentAmount = paymentAmount === '' ? totalAmount : Number(paymentAmount);
            if (!Number.isFinite(cleanPaymentAmount) || cleanPaymentAmount < 0 || cleanPaymentAmount > remainingAmount) {
                setMessage('مبلغ الدفع يجب أن يكون بين صفر والمبلغ المتبقي.');
                return;
            }
            if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
            const payload = {
                source: 'pos',
                requestId: requestIdRef.current,
                appointmentId: checkoutAppointment?._id || null,
                customerName: customerName.trim(),
                customerPhone: customerPhone.replace(/\D/g, ''),
                items: items.filter((item) => !item.booked).map((item) => ({
                    itemType: item.itemType,
                    serviceId: item.serviceId,
                    productId: item.productId,
                    quantity: Number(item.quantity),
                })),
                payments: cleanPaymentAmount > 0
                    ? [{ method: paymentMethod, amount: cleanPaymentAmount }]
                    : [],
            };

            const res = await API.post('/sales', payload);
            setMessage(res.data.message || 'تم حفظ البيع.');
            resetSaleForm();
            fetchProducts();
            fetchSales();
            onSaleSaved();
        } catch (error) {
            setMessage(error.response?.data?.message || 'حدث خطأ أثناء حفظ البيع.');
        } finally {
            setIsSaving(false);
        }
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
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">نقطة البيع POS</h2>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-black text-sm border border-emerald-100">
                        الإجمالي: {toMoney(totalAmount)} ر.س
                    </div>
                </div>

                {checkoutAppointment && (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                        <span>حجز {checkoutAppointment.childName} · {checkoutAppointment.date} · {checkoutAppointment.timeSlot}</span>
                        <button type="button" onClick={resetSaleForm} className="inline-flex items-center gap-1 text-emerald-800 hover:text-red-600"><X size={16} /> إغلاق</button>
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 space-y-6">
                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3">الخدمات</h3>
                            {services.length === 0 ? (
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm font-bold text-slate-400">لا توجد خدمات متاحة.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {services.map((service) => (
                                        <button key={service._id || service.id} type="button" onClick={() => addServiceItem(service)} className="text-right bg-slate-50 border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 rounded-lg p-4 transition-colors">
                                            <div className="font-black text-slate-800">{service.name}</div>
                                            <div className="text-xs font-bold text-slate-500 mt-1">{toMoney(service.price)} ر.س</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3">المنتجات</h3>
                            <div className="relative mb-3">
                                <Search size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="ابحث بالاسم أو SKU أو الباركود" className="w-full bg-slate-50 border border-slate-100 rounded-lg py-3 pr-10 pl-4 font-bold outline-none focus:border-emerald-300" />
                            </div>
                            {products.length === 0 ? (
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm font-bold text-slate-400">
                                    لا توجد منتجات متاحة للبيع. أضف المنتجات من تبويب المنتجات والمخزون.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {visibleProducts.map((product) => {
                                        const isOutOfStock = Number(product.stockQuantity || 0) <= 0;

                                        return (
                                            <button
                                                key={product._id || product.id || product.name}
                                                type="button"
                                                disabled={isOutOfStock}
                                                onClick={() => addProductItem(product)}
                                                className="text-right bg-slate-50 border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 rounded-lg p-4 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <div className="font-black text-slate-800">{product.name}</div>
                                                <div className="text-xs font-bold text-slate-400 mt-1">
                                                    {toMoney(product.salePrice)} ر.س · المتاح {product.stockQuantity}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3">بنود البيع</h3>
                            {items.length === 0 ? (
                                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 font-bold">
                                    لم تتم إضافة أي بنود بعد.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div key={item.key} className="bg-white border border-slate-100 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
                                            <div>
                                                <div className="font-black text-slate-800">{item.name}</div>
                                                <div className="text-xs font-bold text-slate-400">
                                                    {toMoney(item.unitPrice)} ر.س للوحدة
                                                    {item.booked ? ' · الخدمة المحجوزة' : item.itemType === 'product' ? ` · المتاح ${item.stockQuantity}` : ' · خدمة إضافية'}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {item.booked ? <span className="w-20 text-center font-black">1</span> : <input
                                                    type="number" min="1" max={item.itemType === 'product' ? item.stockQuantity : 10000}
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.key, e.target.value)}
                                                    className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-center font-black outline-none focus:border-blue-300"
                                                />}
                                                <span className="min-w-24 text-left font-black text-slate-800">{toMoney(item.unitPrice * item.quantity)} ر.س</span>
                                                {!item.booked && <button
                                                    type="button"
                                                    onClick={() => removeItem(item.key)}
                                                    className="inline-flex items-center justify-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg font-black hover:bg-red-100"
                                                >
                                                    <Trash2 size={14} />
                                                    حذف
                                                </button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="bg-slate-50 border border-slate-100 rounded-lg p-5 space-y-4 h-fit">
                        <h3 className="text-sm font-black text-slate-700">الدفع والعميل</h3>
                        <input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            readOnly={Boolean(checkoutAppointment)}
                            placeholder="اسم العميل اختياري"
                            className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300"
                        />
                        <input
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                            readOnly={Boolean(checkoutAppointment)}
                            placeholder="رقم الجوال اختياري"
                            dir="ltr"
                            className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300"
                        />
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-black outline-none focus:border-blue-300"
                        >
                            {Object.entries(paymentMethodLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min="0"
                            value={paymentAmount}
                            onChange={(e) => {
                                setIsPaymentAmountManual(true);
                                setPaymentAmount(e.target.value);
                            }}
                            placeholder="المبلغ المدفوع"
                            className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300"
                        />
                        {checkoutAppointment && (
                            <div className="border-t border-slate-200 pt-3 text-sm font-bold text-slate-700 space-y-1">
                                <div className="flex justify-between"><span>العربون المدفوع</span><span>{toMoney(depositAmount)} ر.س</span></div>
                                <div className="flex justify-between font-black"><span>المتبقي</span><span>{toMoney(remainingAmount)} ر.س</span></div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={createSale}
                            disabled={isSaving || isCheckingCheckout || !isCheckoutReady || items.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-lg font-black hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed active:scale-95 transition-all"
                        >
                            <Save size={16} />
                            {isSaving ? 'جاري الحفظ...' : 'حفظ البيع'}
                        </button>

                        {message && (
                            <div className="bg-white border border-slate-100 rounded-lg p-3 text-sm font-bold text-slate-600">
                                {message}
                            </div>
                        )}
                    </aside>
                </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-black text-slate-800">آخر المبيعات</h3>
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
