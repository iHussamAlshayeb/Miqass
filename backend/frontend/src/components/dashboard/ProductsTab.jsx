import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Package, PackageCheck, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import API from '../../services/api';
import { ConfirmDelete, Drawer, Field, FilterChips, Notice, SearchBox, StatCard, StatusPill, Toggle } from './catalog/CatalogUI';
import { errorMessage, formatQty, inputClass, toMoney } from './catalog/format';

const emptyProduct = {
    name: '', category: 'عام', sku: '', barcode: '', salePrice: '', costPrice: '',
    stockQuantity: '', lowStockThreshold: '3', isActive: true,
};

// هامش الربح من سعر البيع قبل الضريبة
const marginPercent = (salePrice, costPrice) => {
    const net = Number(salePrice || 0) / 1.15;
    if (!net) return null;
    return Math.round(((net - Number(costPrice || 0)) / net) * 100);
};

/** كتالوج المنتجات: إضافة وتعديل وإيقاف وحذف. الكميات تُدار من صفحة المخزون. */
const ProductsTab = ({ onOpenInventory }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [category, setCategory] = useState('');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyProduct);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleting, setDeleting] = useState(null);
    const [busyId, setBusyId] = useState('');
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await API.get('/products?includeInactive=true');
            setProducts(res.data.products || []);
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر جلب المنتجات.') });
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const categories = useMemo(() => [...new Set(products.map((product) => product.category || 'عام'))].sort(), [products]);
    const activeCount = products.filter((product) => product.isActive).length;
    const lowCount = products.filter((product) => product.isActive && product.isLowStock).length;
    const avgMargin = useMemo(() => {
        const margins = products.filter((product) => product.isActive && Number(product.costPrice) > 0)
            .map((product) => marginPercent(product.salePrice, product.costPrice)).filter((value) => value !== null);
        return margins.length ? Math.round(margins.reduce((sum, value) => sum + value, 0) / margins.length) : null;
    }, [products]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter((product) => {
            if (filter === 'active' && !product.isActive) return false;
            if (filter === 'paused' && product.isActive) return false;
            if (category && (product.category || 'عام') !== category) return false;
            return !term || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(term));
        });
    }, [products, search, filter, category]);

    const openForm = (product) => {
        setFormError('');
        setEditing(product || 'new');
        setForm(product
            ? {
                name: product.name, category: product.category || 'عام', sku: product.sku || '', barcode: product.barcode || '',
                salePrice: String(product.salePrice ?? ''), costPrice: String(product.costPrice ?? ''),
                stockQuantity: '', lowStockThreshold: String(product.lowStockThreshold ?? 0), isActive: product.isActive,
            }
            : emptyProduct);
    };
    const closeForm = useCallback(() => setEditing(null), []);
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const save = async (event) => {
        event?.preventDefault();
        if (!form.name.trim()) { setFormError('اكتب اسم المنتج.'); return; }
        if (form.salePrice === '' || Number(form.salePrice) < 0) { setFormError('اكتب سعر البيع.'); return; }
        setSaving(true);
        setFormError('');
        const body = {
            ...form,
            salePrice: Number(form.salePrice || 0),
            costPrice: Number(form.costPrice || 0),
            lowStockThreshold: Number(form.lowStockThreshold || 0),
        };
        if (editing === 'new') body.stockQuantity = Number(form.stockQuantity || 0);
        else delete body.stockQuantity;
        try {
            const res = editing === 'new'
                ? await API.post('/products', body)
                : await API.put(`/products/${editing._id}`, body);
            setNotice({ ok: true, text: res.data.message });
            setEditing(null);
            load();
        } catch (error) {
            setFormError(errorMessage(error, 'تعذر حفظ المنتج.'));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (product) => {
        setBusyId(product._id);
        try {
            await API.put(`/products/${product._id}`, { ...product, isActive: !product.isActive });
            setNotice({ ok: true, text: product.isActive ? `أُوقف "${product.name}" ولن يظهر في نقطة البيع.` : `"${product.name}" متاح للبيع الآن.` });
            load();
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر تحديث المنتج.') });
        } finally {
            setBusyId('');
        }
    };

    const confirmDelete = async () => {
        setBusyId(deleting._id);
        try {
            const res = await API.delete(`/products/${deleting._id}`);
            setNotice({ ok: true, text: res.data.message });
            load();
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر حذف المنتج.') });
        } finally {
            setDeleting(null);
            setBusyId('');
        }
    };

    const formMargin = marginPercent(form.salePrice, form.costPrice);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="المنتجات المتاحة" value={activeCount} icon={PackageCheck} hint={products.length > activeCount ? `${products.length - activeCount} موقوفة` : undefined} />
                <StatCard label="التصنيفات" value={categories.length} icon={Package} />
                <StatCard label="متوسط هامش الربح" value={avgMargin === null ? '—' : `${avgMargin}%`} icon={TrendingUp} tone="emerald" hint="من سعر البيع قبل الضريبة" />
                <StatCard label="منخفض أو نافد" value={lowCount} icon={AlertTriangle} tone={lowCount ? 'amber' : 'slate'} hint={lowCount ? 'راجع صفحة المخزون' : undefined} />
            </div>

            <Notice notice={notice} onClose={() => setNotice(null)} />

            <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو SKU أو الباركود" />
                        {categories.length > 1 && (
                            <select value={category} onChange={(event) => setCategory(event.target.value)} className={`${inputClass} sm:w-44`} aria-label="التصنيف">
                                <option value="">كل التصنيفات</option>
                                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                        )}
                        <FilterChips value={filter} onChange={setFilter} options={[['all', 'الكل', products.length], ['active', 'متاح', activeCount], ['paused', 'موقوف', products.length - activeCount]]} />
                    </div>
                    <button type="button" onClick={() => openForm(null)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-black text-white hover:bg-slate-800">
                        <Plus size={17} /> منتج جديد
                    </button>
                </div>

                {loading ? (
                    <p className="py-16 text-center font-bold text-slate-400">جاري التحميل...</p>
                ) : visible.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
                        <Package size={28} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-bold text-slate-500">{products.length ? 'لا توجد نتائج.' : 'لم تُضف منتجات بعد.'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs text-slate-500">
                                    <th className="py-3 text-right font-black">المنتج</th>
                                    <th className="py-3 text-right font-black">التصنيف</th>
                                    <th className="py-3 text-left font-black">سعر البيع</th>
                                    <th className="py-3 text-left font-black">التكلفة</th>
                                    <th className="py-3 text-center font-black">الهامش</th>
                                    <th className="py-3 text-center font-black">المخزون</th>
                                    <th className="py-3 text-center font-black">الحالة</th>
                                    <th className="py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((product) => {
                                    const margin = Number(product.costPrice) > 0 ? marginPercent(product.salePrice, product.costPrice) : null;
                                    return (
                                        <tr key={product._id} className={`border-b border-slate-50 last:border-0 ${product.isActive ? '' : 'opacity-60'}`}>
                                            <td className="py-3">
                                                <p className="font-black text-slate-800">{product.name}</p>
                                                <p className="mt-0.5 text-xs font-bold text-slate-400" dir="ltr">{[product.sku, product.barcode].filter(Boolean).join(' · ') || '—'}</p>
                                            </td>
                                            <td className="py-3 font-bold text-slate-500">{product.category || 'عام'}</td>
                                            <td className="py-3 text-left font-black text-slate-800" dir="ltr">{toMoney(product.salePrice)}</td>
                                            <td className="py-3 text-left font-bold text-slate-500" dir="ltr">{Number(product.costPrice) ? toMoney(product.costPrice) : '—'}</td>
                                            <td className={`py-3 text-center font-black ${margin === null ? 'text-slate-300' : margin < 0 ? 'text-rose-600' : 'text-emerald-700'}`} dir="ltr">{margin === null ? '—' : `${margin}%`}</td>
                                            <td className="py-3 text-center">
                                                <button type="button" onClick={() => onOpenInventory?.()} title="إدارة الكمية من صفحة المخزون" className={`rounded-lg px-2.5 py-1 text-xs font-black ${product.stockQuantity <= 0 ? 'bg-rose-50 text-rose-700' : product.isLowStock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {formatQty(product.stockQuantity)}
                                                </button>
                                            </td>
                                            <td className="py-3 text-center">
                                                <button type="button" disabled={busyId === product._id} onClick={() => toggleActive(product)} title={product.isActive ? 'إيقاف مؤقت' : 'تفعيل'} className="disabled:opacity-50">
                                                    <StatusPill active={product.isActive} />
                                                </button>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button type="button" onClick={() => openForm(product)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><Pencil size={14} /> تعديل</button>
                                                    <button type="button" onClick={() => setDeleting(product)} aria-label={`حذف ${product.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="mt-4 text-xs font-bold text-slate-400">سعر البيع شامل الضريبة، والتكلفة متوسط تكلفة الوحدة وتتحدّث تلقائياً عند استلام بضاعة بسعر جديد.</p>
            </section>

            {editing && (
                <Drawer
                    title={editing === 'new' ? 'منتج جديد' : 'تعديل المنتج'}
                    subtitle={editing === 'new' ? 'يظهر في نقطة البيع بعد الإضافة' : `المخزون الحالي ${formatQty(editing.stockQuantity)}، ويُعدّل من صفحة المخزون`}
                    onClose={closeForm}
                    footer={(
                        <div className="space-y-2">
                            {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{formError}</p>}
                            <button type="submit" form="product-form" disabled={saving} className="h-12 w-full rounded-lg bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                {saving ? 'جارٍ الحفظ…' : editing === 'new' ? 'إضافة المنتج' : 'حفظ التعديلات'}
                            </button>
                        </div>
                    )}
                >
                    <form id="product-form" onSubmit={save} className="space-y-4">
                        <Field label="اسم المنتج">
                            <input autoFocus value={form.name} maxLength={100} onChange={(event) => update('name', event.target.value)} placeholder="مثال: واكس شعر 100 مل" className={inputClass} />
                        </Field>
                        <Field label="التصنيف">
                            <input list="product-categories" value={form.category} maxLength={40} onChange={(event) => update('category', event.target.value)} className={inputClass} />
                            <datalist id="product-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="سعر البيع (شامل الضريبة)">
                                <input type="number" min="0" step="0.5" inputMode="decimal" value={form.salePrice} onChange={(event) => update('salePrice', event.target.value)} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="تكلفة الوحدة" hint={formMargin !== null && Number(form.costPrice) > 0 ? `هامش الربح ${formMargin}%` : 'لحساب الربح وقيمة المخزون'}>
                                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.costPrice} onChange={(event) => update('costPrice', event.target.value)} className={inputClass} dir="ltr" />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="SKU (اختياري)">
                                <input value={form.sku} maxLength={40} onChange={(event) => update('sku', event.target.value)} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="الباركود (اختياري)">
                                <input value={form.barcode} maxLength={40} onChange={(event) => update('barcode', event.target.value)} className={inputClass} dir="ltr" />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {editing === 'new' && (
                                <Field label="الكمية الافتتاحية">
                                    <input type="number" min="0" inputMode="numeric" value={form.stockQuantity} onChange={(event) => update('stockQuantity', event.target.value)} className={inputClass} dir="ltr" />
                                </Field>
                            )}
                            <Field label="تنبيه عند وصول الكمية إلى">
                                <input type="number" min="0" inputMode="numeric" value={form.lowStockThreshold} onChange={(event) => update('lowStockThreshold', event.target.value)} className={inputClass} dir="ltr" />
                            </Field>
                        </div>
                        <Toggle checked={form.isActive} onChange={(value) => update('isActive', value)} label="متاح في نقطة البيع" description="أوقفه مؤقتاً بدل حذفه إن كان سيعود لاحقاً." />
                    </form>
                </Drawer>
            )}

            {deleting && (
                <ConfirmDelete
                    title={`حذف "${deleting.name}"؟`}
                    body="إن لم يُبع المنتج من قبل يُحذف نهائياً مع حركات مخزونه. وإن كانت له مبيعات يختفي من القوائم ويبقى في الفواتير والتقارير السابقة."
                    busy={busyId === deleting._id}
                    onCancel={() => setDeleting(null)}
                    onConfirm={confirmDelete}
                />
            )}
        </div>
    );
};

export default ProductsTab;
