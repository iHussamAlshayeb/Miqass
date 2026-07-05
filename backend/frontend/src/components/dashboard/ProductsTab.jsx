import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PackageCheck, PackagePlus, RefreshCw, Save, Warehouse } from 'lucide-react';
import API from '../../services/api';

const toMoney = (value) => Number(value || 0).toFixed(2);

const emptyForm = {
    name: '',
    sku: '',
    barcode: '',
    category: 'عام',
    salePrice: '',
    costPrice: '',
    stockQuantity: '',
    lowStockThreshold: '3',
};

const ProductsTab = () => {
    const [products, setProducts] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [stockDrafts, setStockDrafts] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const stats = useMemo(() => {
        const activeProducts = products.filter((product) => product.isActive !== false);
        const inventoryValue = activeProducts.reduce(
            (sum, product) => sum + Number(product.stockQuantity || 0) * Number(product.costPrice || 0),
            0,
        );

        return {
            productsCount: activeProducts.length,
            lowStockCount: activeProducts.filter((product) => product.isLowStock).length,
            inventoryValue,
        };
    }, [products]);

    const fetchProducts = async () => {
        setIsLoading(true);
        try {
            const res = await API.get('/products');
            setProducts(res.data.products || []);
        } catch (error) {
            setMessage(error.response?.data?.message || 'تعذر جلب المنتجات.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const updateForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const createProduct = async () => {
        if (!form.name.trim()) {
            setMessage('اكتب اسم المنتج أولاً.');
            return;
        }

        setIsSaving(true);
        setMessage('');

        try {
            const res = await API.post('/products', {
                ...form,
                salePrice: Number(form.salePrice || 0),
                costPrice: Number(form.costPrice || 0),
                stockQuantity: Number(form.stockQuantity || 0),
                lowStockThreshold: Number(form.lowStockThreshold || 0),
            });
            setMessage(res.data.message || 'تم إضافة المنتج.');
            setForm(emptyForm);
            fetchProducts();
        } catch (error) {
            setMessage(error.response?.data?.message || 'حدث خطأ أثناء حفظ المنتج.');
        } finally {
            setIsSaving(false);
        }
    };

    const updateStockDraft = (productId, patch) => {
        setStockDrafts((prev) => ({
            ...prev,
            [productId]: {
                quantity: prev[productId]?.quantity || '',
                note: prev[productId]?.note || '',
                ...patch,
            },
        }));
    };

    const adjustStock = async (product, type = 'adjustment') => {
        const draft = stockDrafts[product._id] || {};
        const quantity = Number(draft.quantity);

        if (!quantity) {
            setMessage('اكتب كمية التعديل مثل 10 أو -2.');
            return;
        }

        try {
            const res = await API.post(`/products/${product._id}/stock`, {
                type,
                quantity,
                note: draft.note,
            });
            setMessage(res.data.message || 'تم تحديث المخزون.');
            setStockDrafts((prev) => {
                const next = { ...prev };
                delete next[product._id];
                return next;
            });
            fetchProducts();
        } catch (error) {
            setMessage(error.response?.data?.message || 'تعذر تحديث المخزون.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">المنتجات النشطة</p>
                        <PackageCheck size={18} className="text-slate-500" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mt-2">{stats.productsCount}</h3>
                </div>
                <div className="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">تنبيه مخزون منخفض</p>
                        <AlertTriangle size={18} className="text-amber-500" />
                    </div>
                    <h3 className="text-2xl font-black text-amber-600 mt-2">{stats.lowStockCount}</h3>
                </div>
                <div className="bg-white border border-emerald-100 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">قيمة المخزون بالتكلفة</p>
                        <Warehouse size={18} className="text-emerald-600" />
                    </div>
                    <h3 className="text-2xl font-black text-emerald-700 mt-2">{toMoney(stats.inventoryValue)} ر.س</h3>
                </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">المنتجات والمخزون</h2>
                        <p className="text-sm font-bold text-slate-400 mt-1">أضف المنتجات وتابع الكميات المتاحة للبيع.</p>
                    </div>
                    <button
                        type="button"
                        onClick={fetchProducts}
                        className="inline-flex items-center justify-center gap-2 bg-slate-50 text-slate-600 border border-slate-100 px-4 py-2 rounded-lg font-black text-sm hover:bg-slate-100"
                    >
                        <RefreshCw size={15} />
                        تحديث
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
                    <div className="overflow-x-auto">
                        {isLoading ? (
                            <div className="py-16 text-center font-bold text-slate-400 animate-pulse">جاري تحميل المنتجات...</div>
                        ) : products.length === 0 ? (
                            <div className="py-16 text-center font-bold text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                لا توجد منتجات بعد.
                            </div>
                        ) : (
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="text-slate-400 border-b border-slate-100">
                                        <th className="py-3 text-right">المنتج</th>
                                        <th className="py-3 text-right">التصنيف</th>
                                        <th className="py-3 text-right">المخزون</th>
                                        <th className="py-3 text-left">السعر</th>
                                        <th className="py-3 text-left">تعديل</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((product) => {
                                        const draft = stockDrafts[product._id] || {};

                                        return (
                                            <tr key={product._id} className="border-b border-slate-50 last:border-0 align-top">
                                                <td className="py-3">
                                                    <div className="font-black text-slate-800">{product.name}</div>
                                                    <div className="text-xs font-bold text-slate-400 mt-1" dir="ltr">
                                                        {product.sku || product.barcode || 'بدون كود'}
                                                    </div>
                                                </td>
                                                <td className="py-3 font-bold text-slate-500">{product.category || 'عام'}</td>
                                                <td className="py-3">
                                                    <span className={`px-3 py-1 rounded-lg font-black text-xs ${product.isLowStock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                        {product.stockQuantity}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-left font-black text-slate-800 whitespace-nowrap">{toMoney(product.salePrice)} ر.س</td>
                                                <td className="py-3">
                                                    <div className="flex flex-col lg:flex-row gap-2 justify-end">
                                                        <input
                                                            type="number"
                                                            value={draft.quantity || ''}
                                                            onChange={(e) => updateStockDraft(product._id, { quantity: e.target.value })}
                                                            placeholder="+10 / -2"
                                                            className="bg-white border border-slate-100 rounded-lg px-3 py-2 font-bold text-xs outline-none w-24 text-left"
                                                        />
                                                        <input
                                                            value={draft.note || ''}
                                                            onChange={(e) => updateStockDraft(product._id, { note: e.target.value })}
                                                            placeholder="ملاحظة"
                                                            className="bg-white border border-slate-100 rounded-lg px-3 py-2 font-bold text-xs outline-none min-w-32"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => adjustStock(product, Number(draft.quantity) > 0 ? 'purchase' : 'adjustment')}
                                                            className="inline-flex items-center justify-center gap-1.5 bg-slate-800 text-white px-3 py-2 rounded-lg font-black text-xs hover:bg-slate-700"
                                                        >
                                                            <Save size={13} />
                                                            حفظ
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <aside className="bg-slate-50 border border-slate-100 rounded-lg p-5 space-y-3 h-fit">
                        <h3 className="text-sm font-black text-slate-700">منتج جديد</h3>
                        <input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="اسم المنتج" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        <input value={form.category} onChange={(e) => updateForm('category', e.target.value)} placeholder="التصنيف" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={form.sku} onChange={(e) => updateForm('sku', e.target.value)} placeholder="SKU" dir="ltr" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                            <input value={form.barcode} onChange={(e) => updateForm('barcode', e.target.value)} placeholder="Barcode" dir="ltr" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input type="number" min="0" value={form.salePrice} onChange={(e) => updateForm('salePrice', e.target.value)} placeholder="سعر البيع" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                            <input type="number" min="0" value={form.costPrice} onChange={(e) => updateForm('costPrice', e.target.value)} placeholder="التكلفة" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input type="number" min="0" value={form.stockQuantity} onChange={(e) => updateForm('stockQuantity', e.target.value)} placeholder="الكمية" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                            <input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => updateForm('lowStockThreshold', e.target.value)} placeholder="حد التنبيه" className="w-full bg-white border border-slate-100 rounded-lg px-4 py-3 font-bold outline-none focus:border-blue-300" />
                        </div>
                        <button
                            type="button"
                            onClick={createProduct}
                            disabled={isSaving}
                            className="inline-flex w-full items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-lg font-black hover:bg-emerald-700 disabled:bg-emerald-300 active:scale-95 transition-all"
                        >
                            <PackagePlus size={16} />
                            {isSaving ? 'جاري الحفظ...' : 'إضافة المنتج'}
                        </button>
                        {message && <div className="bg-white border border-slate-100 rounded-lg p-3 text-sm font-bold text-slate-600">{message}</div>}
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default ProductsTab;
