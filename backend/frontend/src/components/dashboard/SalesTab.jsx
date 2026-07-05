import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, ReceiptText, RefreshCw, Save, Trash2 } from 'lucide-react';
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

const toMoney = (value) => Number(value || 0).toFixed(2);

const getRemainingAmount = (sale) =>
    Math.max(Number(sale.totalAmount || 0) - Number(sale.paidAmount || 0), 0);

const getStatusClass = (status) => {
    if (status === 'Paid') return 'bg-emerald-50 text-emerald-700';
    if (status === 'Partially_Paid') return 'bg-blue-50 text-blue-700';
    if (status === 'Cancelled') return 'bg-red-50 text-red-700';
    return 'bg-amber-50 text-amber-700';
};

const SalesTab = ({ services = [] }) => {
    const [items, setItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [isPaymentAmountManual, setIsPaymentAmountManual] = useState(false);
    const [customName, setCustomName] = useState('');
    const [customPrice, setCustomPrice] = useState('');
    const [sales, setSales] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingSales, setIsLoadingSales] = useState(false);
    const [payingSaleId, setPayingSaleId] = useState(null);
    const [paymentDrafts, setPaymentDrafts] = useState({});
    const [invoiceData, setInvoiceData] = useState(null);
    const [message, setMessage] = useState('');

    const totalAmount = useMemo(
        () => items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0),
        [items],
    );

    useEffect(() => {
        if (!isPaymentAmountManual) {
            setPaymentAmount(totalAmount ? String(toMoney(totalAmount)) : '');
        }
    }, [isPaymentAmountManual, totalAmount]);

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

    const addServiceItem = (service) => {
        const serviceId = service._id || service.id;
        if (!serviceId) return;

        setMessage('');
        setItems((prev) => {
            const existing = prev.find((item) => item.itemType === 'service' && item.serviceId === serviceId);
            if (existing) {
                return prev.map((item) =>
                    item.key === existing.key
                        ? { ...item, quantity: Number(item.quantity || 1) + 1 }
                        : item,
                );
            }

            return [
                ...prev,
                {
                    key: `${serviceId}-${Date.now()}`,
                    itemType: 'service',
                    serviceId,
                    name: service.name,
                    quantity: 1,
                    unitPrice: Number(service.price || 0),
                },
            ];
        });
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

    const addCustomItem = () => {
        const name = customName.trim();
        const price = Number(customPrice);

        if (!name || Number.isNaN(price) || price < 0) {
            setMessage('اكتب اسم البند وسعره بشكل صحيح.');
            return;
        }

        setItems((prev) => [
            ...prev,
            {
                key: `custom-${Date.now()}`,
                itemType: 'custom',
                name,
                quantity: 1,
                unitPrice: price,
            },
        ]);
        setCustomName('');
        setCustomPrice('');
        setMessage('');
    };

    const updateQuantity = (key, quantity) => {
        const item = items.find((currentItem) => currentItem.key === key);
        const maxQuantity = item?.itemType === 'product'
            ? Math.max(Number(item.stockQuantity || 1), 1)
            : Number.MAX_SAFE_INTEGER;
        const cleanQuantity = Math.min(Math.max(Number(quantity) || 1, 1), maxQuantity);
        setItems((prev) =>
            prev.map((item) => (item.key === key ? { ...item, quantity: cleanQuantity } : item)),
        );
    };

    const removeItem = (key) => {
        setItems((prev) => prev.filter((item) => item.key !== key));
    };

    const resetSaleForm = () => {
        setItems([]);
        setCustomerName('');
        setCustomerPhone('');
        setPaymentMethod('cash');
        setPaymentAmount('');
        setIsPaymentAmountManual(false);
        setCustomName('');
        setCustomPrice('');
    };

    const createSale = async () => {
        if (items.length === 0) {
            setMessage('أضف خدمة أو بند مخصص قبل حفظ البيع.');
            return;
        }

        setIsSaving(true);
        setMessage('');

        try {
            const cleanPaymentAmount = Number(paymentAmount || totalAmount);
            const payload = {
                source: 'pos',
                customerName: customerName.trim(),
                customerPhone: customerPhone.replace(/\D/g, ''),
                items: items.map((item) => ({
                    itemType: item.itemType,
                    serviceId: item.serviceId,
                    productId: item.productId,
                    name: item.name,
                    quantity: Number(item.quantity || 1),
                    unitPrice: Number(item.unitPrice || 0),
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

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">نقطة البيع POS</h2>
                        <p className="text-sm font-bold text-slate-400 mt-1">بيع خدمات وبنود مخصصة، مع تسجيل الدفع والفاتورة.</p>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-black text-sm border border-emerald-100">
                        الإجمالي: {toMoney(totalAmount)} ر.س
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 space-y-6">
                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3">الخدمات</h3>
                            {services.length === 0 ? (
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm font-bold text-slate-400">
                                    لا توجد خدمات مفعلة. أضف الخدمات من إعدادات النظام.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {services.map((service) => (
                                        <button
                                            key={service._id || service.id || service.name}
                                            type="button"
                                            onClick={() => addServiceItem(service)}
                                            className="text-right bg-slate-50 border border-slate-100 hover:border-blue-200 hover:bg-blue-50 rounded-lg p-4 transition-all active:scale-[0.98]"
                                        >
                                            <div className="font-black text-slate-800">{service.name}</div>
                                            <div className="text-xs font-bold text-slate-400 mt-1">{toMoney(service.price)} ر.س</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3">المنتجات</h3>
                            {products.length === 0 ? (
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm font-bold text-slate-400">
                                    لا توجد منتجات متاحة للبيع. أضف المنتجات من تبويب المنتجات والمخزون.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {products.map((product) => {
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
                            <h3 className="text-sm font-black text-slate-700 mb-3">بند مخصص</h3>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3">
                                <input
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="مثال: خدمة إضافية"
                                    className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    value={customPrice}
                                    onChange={(e) => setCustomPrice(e.target.value)}
                                    placeholder="السعر"
                                    className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300"
                                />
                                <button
                                    type="button"
                                    onClick={addCustomItem}
                                    className="inline-flex items-center justify-center gap-2 bg-slate-800 text-white px-5 py-3 rounded-lg font-black hover:bg-slate-700 active:scale-95 transition-all"
                                >
                                    <Plus size={16} />
                                    إضافة
                                </button>
                            </div>
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
                                                    {item.itemType === 'product' && ` · المتاح ${item.stockQuantity}`}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.key, e.target.value)}
                                                    className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-center font-black outline-none focus:border-blue-300"
                                                />
                                                <span className="min-w-24 text-left font-black text-slate-800">{toMoney(item.unitPrice * item.quantity)} ر.س</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(item.key)}
                                                    className="inline-flex items-center justify-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg font-black hover:bg-red-100"
                                                >
                                                    <Trash2 size={14} />
                                                    حذف
                                                </button>
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
                            placeholder="اسم العميل اختياري"
                            className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300"
                        />
                        <input
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
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

                        <button
                            type="button"
                            onClick={createSale}
                            disabled={isSaving || items.length === 0}
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
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-slate-100">
                                    <th className="py-3 text-right">الفاتورة</th>
                                    <th className="py-3 text-right">العميل</th>
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
