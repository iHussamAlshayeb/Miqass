import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Pencil, Plus, Scissors, Tags, Trash2 } from 'lucide-react';
import API from '../../services/api';
import { ConfirmDelete, Drawer, Field, FilterChips, Notice, SearchBox, StatCard, StatusPill, Toggle } from './catalog/CatalogUI';
import { errorMessage, inputClass, toMoney } from './catalog/format';

const DEFAULT_DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const durationLabel = (minutes) => {
    const value = Number(minutes) || 0;
    if (value < 60) return `${value} دقيقة`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    const hoursLabel = hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : `${hours} ساعات`;
    return rest ? `${hoursLabel} و${rest} د` : hoursLabel;
};
const emptyService = { name: '', category: 'عام', price: '', duration: 30, description: '', isActive: true, barberPrices: {} };

/** الخدمات: إضافة وتعديل وإيقاف وحذف، وأسعار كل حلاق للخدمة من نفس النافذة. */
const ServicesTab = () => {
    const [services, setServices] = useState([]);
    const [barbers, setBarbers] = useState([]);
    const [durations, setDurations] = useState(DEFAULT_DURATIONS);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyService);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleting, setDeleting] = useState(null);
    const [busyId, setBusyId] = useState('');
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await API.get('/services');
            const list = res.data.services || [];
            setServices(list);
            setBarbers(res.data.barbers || []);
            if (res.data.durations?.length) setDurations(res.data.durations);
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر جلب الخدمات.') });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const categories = useMemo(() => [...new Set(services.map((service) => service.category || 'عام'))], [services]);
    const activeCount = services.filter((service) => service.isActive).length;
    const visible = useMemo(() => {
        const term = search.trim();
        return services.filter((service) => {
            if (filter === 'active' && !service.isActive) return false;
            if (filter === 'paused' && service.isActive) return false;
            return !term || service.name.includes(term) || (service.category || '').includes(term);
        });
    }, [services, search, filter]);
    const averagePrice = activeCount
        ? services.filter((service) => service.isActive).reduce((sum, service) => sum + Number(service.price || 0), 0) / activeCount
        : 0;

    const openForm = (service) => {
        setFormError('');
        setEditing(service || 'new');
        setForm(service
            ? {
                name: service.name, category: service.category || 'عام', price: String(service.price), duration: service.duration,
                description: service.description || '', isActive: service.isActive,
                barberPrices: Object.fromEntries((service.barberPrices || []).map((entry) => [entry.barberId, String(entry.price)])),
            }
            : emptyService);
    };
    const closeForm = useCallback(() => setEditing(null), []);
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const setBarberPrice = (barberId, value) => setForm((current) => ({ ...current, barberPrices: { ...current.barberPrices, [barberId]: value } }));
    const barberName = (barberId) => barbers.find((barber) => String(barber._id) === String(barberId))?.name || '';

    const save = async (event) => {
        event?.preventDefault();
        if (!form.name.trim()) { setFormError('اكتب اسم الخدمة.'); return; }
        if (form.price === '' || Number(form.price) < 0) { setFormError('اكتب سعر الخدمة.'); return; }
        setSaving(true);
        setFormError('');
        const body = {
            ...form,
            price: Number(form.price),
            duration: Number(form.duration),
            // الفارغ = السعر الأساسي؛ تُرسل القائمة كاملة فتستبدل أسعار هذه الخدمة لدى كل الحلاقين
            barberPrices: Object.entries(form.barberPrices || {})
                .filter(([, price]) => price !== '')
                .map(([barberId, price]) => ({ barberId, price: Number(price) })),
        };
        try {
            const res = editing === 'new'
                ? await API.post('/services', body)
                : await API.put(`/services/${editing._id}`, body);
            setNotice({ ok: true, text: res.data.message });
            setEditing(null);
            load();
        } catch (error) {
            setFormError(errorMessage(error, 'تعذر حفظ الخدمة.'));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (service) => {
        setBusyId(service._id);
        try {
            await API.put(`/services/${service._id}`, { isActive: !service.isActive });
            setNotice({ ok: true, text: service.isActive ? `أُوقفت "${service.name}" ولن تظهر في الحجز ونقطة البيع.` : `"${service.name}" متاحة الآن.` });
            load();
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر تحديث الخدمة.') });
        } finally {
            setBusyId('');
        }
    };

    const confirmDelete = async () => {
        setBusyId(deleting._id);
        try {
            const res = await API.delete(`/services/${deleting._id}`);
            setNotice({ ok: true, text: res.data.message });
            setDeleting(null);
            load();
        } catch (error) {
            setNotice({ ok: false, text: errorMessage(error, 'تعذر حذف الخدمة.') });
            setDeleting(null);
        } finally {
            setBusyId('');
        }
    };

    const durationOptions = [...new Set([...durations, Number(form.duration)])].filter(Boolean).sort((a, b) => a - b);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatCard label="الخدمات المتاحة" value={activeCount} icon={Scissors} hint={services.length > activeCount ? `${services.length - activeCount} موقوفة` : undefined} />
                <StatCard label="التصنيفات" value={categories.length} icon={Tags} />
                <StatCard label="متوسط السعر" value={`${toMoney(averagePrice)} ر.س`} icon={Clock3} tone="emerald" hint="شامل الضريبة" />
            </div>

            <Notice notice={notice} onClose={() => setNotice(null)} />

            <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                        <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم الخدمة أو التصنيف" />
                        <FilterChips value={filter} onChange={setFilter} options={[['all', 'الكل', services.length], ['active', 'متاحة', activeCount], ['paused', 'موقوفة', services.length - activeCount]]} />
                    </div>
                    <button type="button" onClick={() => openForm(null)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-black text-white hover:bg-slate-800">
                        <Plus size={17} /> خدمة جديدة
                    </button>
                </div>

                {loading ? (
                    <p className="py-16 text-center font-bold text-slate-400">جاري التحميل...</p>
                ) : visible.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
                        <Scissors size={28} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-bold text-slate-500">{services.length ? 'لا توجد نتائج.' : 'لم تُضف خدمات بعد. بدون خدمات يكون الحجز "حجز مقعد" فقط.'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs text-slate-500">
                                    <th className="py-3 text-right font-black">الخدمة</th>
                                    <th className="py-3 text-right font-black">المدة</th>
                                    <th className="py-3 text-left font-black">السعر</th>
                                    <th className="py-3 text-center font-black">المبيعات</th>
                                    <th className="py-3 text-center font-black">الحالة</th>
                                    <th className="py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((service) => (
                                    <tr key={service._id} className={`border-b border-slate-50 last:border-0 ${service.isActive ? '' : 'opacity-60'}`}>
                                        <td className="py-3">
                                            <p className="font-black text-slate-800">{service.name}</p>
                                            <p className="mt-0.5 text-xs font-bold text-slate-400">{service.category || 'عام'}{service.description ? ` · ${service.description}` : ''}</p>
                                            {service.barberPrices?.length > 0 && (
                                                <p className="mt-1 flex flex-wrap gap-1">
                                                    {service.barberPrices.filter((entry) => barberName(entry.barberId)).map((entry) => (
                                                        <span key={entry.barberId} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-800">{barberName(entry.barberId)}: <span dir="ltr">{toMoney(entry.price)}</span></span>
                                                    ))}
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-3 font-bold text-slate-600">{durationLabel(service.duration)}</td>
                                        <td className="py-3 text-left font-black text-slate-800" dir="ltr">{toMoney(service.price)} <span className="text-xs text-slate-400">ر.س</span></td>
                                        <td className="py-3 text-center font-bold text-slate-500">{service.soldCount || '—'}</td>
                                        <td className="py-3 text-center">
                                            <button type="button" disabled={busyId === service._id} onClick={() => toggleActive(service)} title={service.isActive ? 'إيقاف مؤقت' : 'تفعيل'} className="disabled:opacity-50">
                                                <StatusPill active={service.isActive} onLabel="متاحة" offLabel="موقوفة" />
                                            </button>
                                        </td>
                                        <td className="py-3">
                                            <div className="flex justify-end gap-1">
                                                <button type="button" onClick={() => openForm(service)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><Pencil size={14} /> تعديل</button>
                                                <button type="button" onClick={() => setDeleting(service)} aria-label={`حذف ${service.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="mt-4 text-xs font-bold text-slate-400">الأسعار شاملة ضريبة القيمة المضافة. لسعر مختلف لحلاق معيّن افتح الخدمة واكتب سعره في قسم "أسعار الحلاقين".</p>
            </section>

            {editing && (
                <Drawer
                    title={editing === 'new' ? 'خدمة جديدة' : 'تعديل الخدمة'}
                    subtitle="تظهر في صفحة الحجز ونقطة البيع"
                    onClose={closeForm}
                    footer={(
                        <div className="space-y-2">
                            {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{formError}</p>}
                            <button type="submit" form="service-form" disabled={saving} className="h-12 w-full rounded-lg bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                {saving ? 'جارٍ الحفظ…' : editing === 'new' ? 'إضافة الخدمة' : 'حفظ التعديلات'}
                            </button>
                        </div>
                    )}
                >
                    <form id="service-form" onSubmit={save} className="space-y-4">
                        <Field label="اسم الخدمة">
                            <input autoFocus value={form.name} maxLength={80} onChange={(event) => update('name', event.target.value)} placeholder="مثال: قص وتشذيب لحية" className={inputClass} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="السعر (شامل الضريبة)">
                                <input type="number" min="0" step="0.5" inputMode="decimal" value={form.price} onChange={(event) => update('price', event.target.value)} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="المدة">
                                <select value={form.duration} onChange={(event) => update('duration', Number(event.target.value))} className={inputClass}>
                                    {durationOptions.map((value) => <option key={value} value={value}>{durationLabel(value)}</option>)}
                                </select>
                            </Field>
                        </div>
                        <Field label="التصنيف" hint="يجمع الخدمات المتشابهة في نقطة البيع، مثل: شعر، لحية، عناية.">
                            <input list="service-categories" value={form.category} maxLength={40} onChange={(event) => update('category', event.target.value)} className={inputClass} />
                            <datalist id="service-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
                        </Field>
                        <Field label="وصف مختصر (اختياري)">
                            <textarea value={form.description} maxLength={300} rows={3} onChange={(event) => update('description', event.target.value)} className={`${inputClass} h-auto py-2`} />
                        </Field>
                        {barbers.length > 0 && (
                            <div className="rounded-lg border border-slate-200">
                                <div className="border-b border-slate-100 px-3 py-2.5">
                                    <p className="text-sm font-black text-slate-800">أسعار الحلاقين</p>
                                    <p className="mt-0.5 text-[11px] font-bold text-slate-500">اكتب سعراً خاصاً لحلاق معيّن، أو اتركه فارغاً ليأخذ السعر الأساسي{form.price !== '' ? ` (${toMoney(form.price)})` : ''}.</p>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {barbers.map((barber) => {
                                        const value = form.barberPrices?.[barber._id] ?? '';
                                        return (
                                            <div key={barber._id} className={`flex items-center gap-3 px-3 py-2 ${barber.isActive ? '' : 'opacity-60'}`}>
                                                <span className="h-3 w-3 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: barber.iconColor || '#94a3b8' }} />
                                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{barber.name}{!barber.isActive && <span className="mr-1 text-xs text-slate-400">(متوقف)</span>}</span>
                                                <input
                                                    type="number" min="0" step="0.5" inputMode="decimal"
                                                    value={value}
                                                    placeholder={form.price === '' ? 'الأساسي' : String(Number(form.price))}
                                                    onChange={(event) => setBarberPrice(barber._id, event.target.value)}
                                                    aria-label={`سعر ${form.name || 'الخدمة'} لدى ${barber.name}`}
                                                    className={`h-10 w-28 rounded-lg border px-3 text-sm font-black outline-none focus:border-emerald-400 ${value !== '' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-800'}`}
                                                    dir="ltr"
                                                />
                                                {value !== '' && (
                                                    <button type="button" onClick={() => setBarberPrice(barber._id, '')} className="text-xs font-black text-slate-400 hover:text-rose-600">مسح</button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <Toggle checked={form.isActive} onChange={(value) => update('isActive', value)} label="متاحة للحجز والبيع" description="أوقفها مؤقتاً بدل حذفها إن كانت ستعود لاحقاً." />
                    </form>
                </Drawer>
            )}

            {deleting && (
                <ConfirmDelete
                    title={`حذف "${deleting.name}"؟`}
                    body={deleting.soldCount > 0
                        ? 'لهذه الخدمة مبيعات سابقة، فستختفي من الحجز ونقطة البيع وتبقى في الفواتير والتقارير القديمة. تُحذف أيضاً أسعار الحلاقين الخاصة بها.'
                        : 'ستُحذف الخدمة من الحجز ونقطة البيع، مع أسعار الحلاقين الخاصة بها. الحجوزات السابقة تحتفظ باسمها وسعرها.'}
                    busy={busyId === deleting._id}
                    onCancel={() => setDeleting(null)}
                    onConfirm={confirmDelete}
                />
            )}
        </div>
    );
};

export default ServicesTab;
