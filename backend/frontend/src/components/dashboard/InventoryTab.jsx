import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ClipboardCheck, History, PackageX, SlidersHorizontal, Warehouse } from 'lucide-react';
import API from '../../services/api';
import { Drawer, Field, FilterChips, Notice, SearchBox, StatCard } from './catalog/CatalogUI';
import { errorMessage, formatQty, inputClass, toMoney } from './catalog/format';

const MOVEMENT_LABELS = {
    initial: 'رصيد افتتاحي',
    purchase: 'استلام',
    sale: 'بيع',
    return: 'مرتجع',
    adjustment: 'تعديل',
};
const ADJUST_REASONS = ['تالف', 'استخدام داخلي', 'منتهي الصلاحية', 'تصحيح خطأ'];
const ACTIONS = {
    purchase: { title: 'استلام بضاعة', icon: ArrowDownToLine, button: 'تسجيل الاستلام' },
    count: { title: 'جرد', icon: ClipboardCheck, button: 'اعتماد الجرد' },
    adjustment: { title: 'تعديل الكمية', icon: SlidersHorizontal, button: 'حفظ التعديل' },
};
const formatDate = (value) => new Date(value).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' });

/** المخزون: الكميات وقيمتها، استلام وجرد وتعديل، وسجل الحركات */
const InventoryTab = () => {
    const [products, setProducts] = useState([]);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [movementType, setMovementType] = useState('');
    const [historyProduct, setHistoryProduct] = useState(null);
    const [action, setAction] = useState(null); // { type, product }
    const [form, setForm] = useState({ quantity: '', countedQuantity: '', unitCost: '', note: '', direction: '-' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [notice, setNotice] = useState(null);

    const loadProducts = useCallback(async () => {
        try {
            const res = await API.get('/products?includeInactive=true');
            setProducts(res.data.products || []);
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر جلب المخزون.') });
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMovements = useCallback(async () => {
        try {
            const base = historyProduct ? `/products/${historyProduct._id}/movements` : '/products/inventory/movements';
            const res = await API.get(base, { params: { limit: 100, ...(movementType ? { type: movementType } : {}) } });
            setMovements(res.data.movements || []);
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر جلب حركة المخزون.') });
        }
    }, [historyProduct, movementType]);

    useEffect(() => { loadProducts(); }, [loadProducts]);
    useEffect(() => { loadMovements(); }, [loadMovements]);

    const active = products.filter((product) => product.isActive);
    const stats = useMemo(() => ({
        costValue: active.reduce((sum, product) => sum + Math.max(product.stockQuantity, 0) * Number(product.costPrice || 0), 0),
        saleValue: active.reduce((sum, product) => sum + Math.max(product.stockQuantity, 0) * Number(product.salePrice || 0), 0),
        low: active.filter((product) => product.isLowStock && product.stockQuantity > 0).length,
        out: active.filter((product) => product.stockQuantity <= 0).length,
    }), [active]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter((product) => {
            if (filter === 'low' && !(product.isLowStock && product.stockQuantity > 0)) return false;
            if (filter === 'out' && product.stockQuantity > 0) return false;
            return !term || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(term));
        });
    }, [products, search, filter]);

    const openAction = (type, product) => {
        setFormError('');
        setForm({ quantity: '', countedQuantity: '', unitCost: '', note: '', direction: '-' });
        setAction({ type, product });
    };
    const closeAction = useCallback(() => setAction(null), []);
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const current = action?.product;
    const countedDiff = action?.type === 'count' && form.countedQuantity !== '' ? Number(form.countedQuantity) - Number(current?.stockQuantity || 0) : null;
    const adjustQty = Number(form.quantity || 0) * (form.direction === '-' ? -1 : 1);
    const resulting = action?.type === 'purchase' ? Number(current?.stockQuantity || 0) + Number(form.quantity || 0)
        : action?.type === 'adjustment' ? Number(current?.stockQuantity || 0) + adjustQty
            : form.countedQuantity === '' ? null : Number(form.countedQuantity);

    const submit = async (event) => {
        event?.preventDefault();
        const body = { type: action.type, note: form.note };
        if (action.type === 'count') {
            if (form.countedQuantity === '' || Number(form.countedQuantity) < 0) { setFormError('اكتب الكمية الفعلية الموجودة.'); return; }
            body.countedQuantity = Number(form.countedQuantity);
        } else {
            if (!(Number(form.quantity) > 0)) { setFormError('اكتب الكمية.'); return; }
            body.quantity = action.type === 'purchase' ? Number(form.quantity) : adjustQty;
            if (action.type === 'adjustment' && !form.note.trim()) { setFormError('اختر سبب التعديل.'); return; }
            if (action.type === 'purchase' && form.unitCost !== '') body.unitCost = Number(form.unitCost);
        }
        setSaving(true);
        setFormError('');
        try {
            const res = await API.post(`/products/${current._id}/stock`, body);
            setNotice({ ok: true, text: `${res.data.message} الرصيد الآن ${formatQty(res.data.product?.stockQuantity)}.` });
            setAction(null);
            loadProducts();
            loadMovements();
        } catch (error) {
            setFormError(errorMessage(error, 'تعذر تحديث المخزون.'));
        } finally {
            setSaving(false);
        }
    };

    const actionButton = (type, product) => (
        <button key={type} type="button" onClick={() => openAction(type, product)} title={ACTIONS[type].title} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
            {React.createElement(ACTIONS[type].icon, { size: 14 })}
            <span className="hidden xl:inline">{ACTIONS[type].title}</span>
        </button>
    );

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="قيمة المخزون بالتكلفة" value={`${toMoney(stats.costValue)} ر.س`} icon={Warehouse} tone="emerald" />
                <StatCard label="قيمته بسعر البيع" value={`${toMoney(stats.saleValue)} ر.س`} icon={Warehouse} hint="شامل الضريبة" />
                <StatCard label="منخفض" value={stats.low} icon={AlertTriangle} tone={stats.low ? 'amber' : 'slate'} />
                <StatCard label="نفد" value={stats.out} icon={PackageX} tone={stats.out ? 'rose' : 'slate'} />
            </div>

            <Notice notice={notice} onClose={() => setNotice(null)} />

            <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو SKU أو الباركود" />
                    <FilterChips value={filter} onChange={setFilter} options={[['all', 'الكل', products.length], ['low', 'منخفض', stats.low], ['out', 'نفد', stats.out]]} />
                </div>

                {loading ? (
                    <p className="py-16 text-center font-bold text-slate-400">جاري التحميل...</p>
                ) : visible.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-14 text-center font-bold text-slate-500">
                        {products.length ? 'لا توجد منتجات هنا.' : 'أضف المنتجات أولاً من صفحة المنتجات.'}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs text-slate-500">
                                    <th className="py-3 text-right font-black">المنتج</th>
                                    <th className="py-3 text-center font-black">الكمية</th>
                                    <th className="py-3 text-center font-black">حد التنبيه</th>
                                    <th className="py-3 text-left font-black">تكلفة الوحدة</th>
                                    <th className="py-3 text-left font-black">القيمة</th>
                                    <th className="py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((product) => {
                                    const tone = product.stockQuantity <= 0 ? 'bg-rose-50 text-rose-700' : product.isLowStock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
                                    return (
                                        <tr key={product._id} className={`border-b border-slate-50 last:border-0 ${product.isActive ? '' : 'opacity-60'}`}>
                                            <td className="py-3">
                                                <p className="font-black text-slate-800">{product.name}{!product.isActive && <span className="mr-2 text-xs font-bold text-slate-400">(موقوف)</span>}</p>
                                                <p className="mt-0.5 text-xs font-bold text-slate-400">{product.category || 'عام'}</p>
                                            </td>
                                            <td className="py-3 text-center"><span className={`inline-block min-w-12 rounded-lg px-2.5 py-1 font-black ${tone}`}>{formatQty(product.stockQuantity)}</span></td>
                                            <td className="py-3 text-center font-bold text-slate-500">{formatQty(product.lowStockThreshold)}</td>
                                            <td className="py-3 text-left font-bold text-slate-600" dir="ltr">{Number(product.costPrice) ? toMoney(product.costPrice) : '—'}</td>
                                            <td className="py-3 text-left font-black text-slate-800" dir="ltr">{toMoney(Math.max(product.stockQuantity, 0) * Number(product.costPrice || 0))}</td>
                                            <td className="py-3">
                                                <div className="flex justify-end gap-1">
                                                    {['purchase', 'count', 'adjustment'].map((type) => actionButton(type, product))}
                                                    <button type="button" onClick={() => setHistoryProduct(product)} title="سجل الحركة" aria-label={`سجل حركة ${product.name}`} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 ${historyProduct?._id === product._id ? 'bg-slate-900 text-white hover:bg-slate-800' : 'text-slate-500'}`}><History size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-base font-black text-slate-800">سجل حركة المخزون</h3>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">
                            {historyProduct ? <>حركات <b>{historyProduct.name}</b> فقط · <button type="button" onClick={() => setHistoryProduct(null)} className="text-emerald-700 underline">عرض الكل</button></> : 'آخر 100 حركة: البيع والمرتجعات تُسجل تلقائياً من نقطة البيع.'}
                        </p>
                    </div>
                    <FilterChips value={movementType} onChange={setMovementType} options={[['', 'الكل'], ['purchase', 'استلام'], ['sale', 'بيع'], ['return', 'مرتجع'], ['adjustment', 'تعديل وجرد']]} />
                </div>
                {movements.length === 0 ? (
                    <p className="py-10 text-center font-bold text-slate-400">لا توجد حركات.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs text-slate-500">
                                    <th className="py-2.5 text-right font-black">التاريخ</th>
                                    <th className="py-2.5 text-right font-black">المنتج</th>
                                    <th className="py-2.5 text-right font-black">النوع</th>
                                    <th className="py-2.5 text-center font-black">الكمية</th>
                                    <th className="py-2.5 text-center font-black">الرصيد بعدها</th>
                                    <th className="py-2.5 text-right font-black">ملاحظة</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movements.map((movement) => (
                                    <tr key={movement._id} className="border-b border-slate-50 last:border-0">
                                        <td className="py-2.5 whitespace-nowrap font-bold text-slate-500">{formatDate(movement.createdAt)}</td>
                                        <td className="py-2.5 font-black text-slate-800">{movement.productId?.name || historyProduct?.name || 'منتج محذوف'}</td>
                                        <td className="py-2.5 font-bold text-slate-600">{MOVEMENT_LABELS[movement.type] || movement.type}</td>
                                        <td className={`py-2.5 text-center font-black ${movement.quantity > 0 ? 'text-emerald-700' : 'text-rose-600'}`} dir="ltr">{movement.quantity > 0 ? '+' : ''}{formatQty(movement.quantity)}</td>
                                        <td className="py-2.5 text-center font-bold text-slate-600">{formatQty(movement.balanceAfter)}</td>
                                        <td className="py-2.5 font-bold text-slate-500">{movement.note || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {action && (
                <Drawer
                    title={`${ACTIONS[action.type].title}: ${current.name}`}
                    subtitle={`الرصيد الحالي ${formatQty(current.stockQuantity)}`}
                    onClose={closeAction}
                    footer={(
                        <div className="space-y-2">
                            {resulting !== null && Number.isFinite(resulting) && (
                                <p className={`flex justify-between rounded-lg px-3 py-2 text-sm font-black ${resulting < 0 ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-700'}`}>
                                    <span>الرصيد بعد الحفظ</span><span dir="ltr">{formatQty(resulting)}</span>
                                </p>
                            )}
                            {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{formError}</p>}
                            <button type="submit" form="stock-form" disabled={saving || (resulting !== null && resulting < 0)} className="h-12 w-full rounded-lg bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                {saving ? 'جارٍ الحفظ…' : ACTIONS[action.type].button}
                            </button>
                        </div>
                    )}
                >
                    <form id="stock-form" onSubmit={submit} className="space-y-4">
                        {action.type === 'purchase' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="الكمية المستلمة">
                                        <input autoFocus type="number" min="1" inputMode="numeric" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} className={inputClass} dir="ltr" />
                                    </Field>
                                    <Field label="تكلفة الوحدة (اختياري)" hint={`الحالية ${toMoney(current.costPrice)}`}>
                                        <input type="number" min="0" step="0.01" inputMode="decimal" value={form.unitCost} onChange={(event) => update('unitCost', event.target.value)} className={inputClass} dir="ltr" />
                                    </Field>
                                </div>
                                <p className="text-xs font-bold text-slate-500">عند إدخال تكلفة جديدة يُحسب متوسط تكلفة الوحدة تلقائياً من الرصيد الحالي والكمية المستلمة.</p>
                                <Field label="المورّد أو رقم الفاتورة (اختياري)">
                                    <input value={form.note} maxLength={200} onChange={(event) => update('note', event.target.value)} className={inputClass} />
                                </Field>
                            </>
                        )}
                        {action.type === 'count' && (
                            <>
                                <Field label="الكمية الفعلية على الرف" hint="يُسجَّل الفرق تلقائياً كحركة جرد.">
                                    <input autoFocus type="number" min="0" inputMode="numeric" value={form.countedQuantity} onChange={(event) => update('countedQuantity', event.target.value)} className={inputClass} dir="ltr" />
                                </Field>
                                {countedDiff !== null && (
                                    <p className={`rounded-lg px-3 py-2 text-sm font-black ${countedDiff === 0 ? 'bg-slate-50 text-slate-600' : countedDiff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                        {countedDiff === 0 ? 'مطابق للنظام، لا يوجد فرق.' : countedDiff > 0 ? `زيادة ${formatQty(countedDiff)} عن النظام` : `عجز ${formatQty(-countedDiff)} عن النظام`}
                                    </p>
                                )}
                                <Field label="ملاحظة (اختياري)">
                                    <input value={form.note} maxLength={200} onChange={(event) => update('note', event.target.value)} className={inputClass} />
                                </Field>
                            </>
                        )}
                        {action.type === 'adjustment' && (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    {[['-', 'خصم من المخزون'], ['+', 'إضافة للمخزون']].map(([value, label]) => (
                                        <button key={value} type="button" onClick={() => update('direction', value)} className={`h-11 rounded-lg border-2 text-sm font-black ${form.direction === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>{label}</button>
                                    ))}
                                </div>
                                <Field label="الكمية">
                                    <input autoFocus type="number" min="1" inputMode="numeric" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} className={inputClass} dir="ltr" />
                                </Field>
                                <div>
                                    <span className="mb-1 block text-xs font-black text-slate-600">السبب</span>
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        {ADJUST_REASONS.map((reason) => (
                                            <button key={reason} type="button" onClick={() => update('note', reason)} className={`h-9 rounded-full border px-3 text-xs font-black ${form.note === reason ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>{reason}</button>
                                        ))}
                                    </div>
                                    <input value={form.note} maxLength={200} onChange={(event) => update('note', event.target.value)} placeholder="أو اكتب السبب" aria-label="سبب التعديل" className={inputClass} />
                                </div>
                            </>
                        )}
                    </form>
                </Drawer>
            )}
        </div>
    );
};

export default InventoryTab;
