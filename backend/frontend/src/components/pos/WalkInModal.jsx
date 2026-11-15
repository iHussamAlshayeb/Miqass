import React, { useEffect, useMemo, useState } from 'react';
import { Check, Scissors, UserPlus, X } from 'lucide-react';
import posApi from '../../services/posApi';
import { money } from '../../utils/posPricing';
import { normalizeSaudiMobile } from '../../utils/saudiMobile';
import { getBarberServicePrice } from '../../utils/servicePricing';

/** حلاقة الآن (كشك مصغّر للكاشير): عميل حاضر يدخل طابور الحلاق فوراً */
const WalkInModal = ({ catalog, accent, onClose, onCreated }) => {
    const barbers = useMemo(() => catalog?.barbers || [], [catalog]);
    const services = useMemo(() => catalog?.services || [], [catalog]);
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [barberId, setBarberId] = useState(barbers.length === 1 ? String(barbers[0]._id) : '');
    const [serviceIds, setServiceIds] = useState([]);
    const [known, setKnown] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const cleanPhone = normalizeSaudiMobile(phone);
    const barber = barbers.find((item) => String(item._id) === barberId) || null;

    // عميل سابق: نقترح أسماءه المسجلة
    useEffect(() => {
        if (!cleanPhone) { setKnown(null); return undefined; }
        let active = true;
        posApi.get('/pos/customers', { params: { q: cleanPhone } })
            .then((res) => {
                if (!active) return;
                const match = (res.data.customers || []).find((customer) => customer.phone === cleanPhone) || null;
                setKnown(match);
                const names = (match?.children || []).filter(Boolean);
                if (names.length === 1) setName((current) => current || names[0]);
            })
            .catch(() => { if (active) setKnown(null); });
        return () => { active = false; };
    }, [cleanPhone]);

    const chosen = useMemo(() => serviceIds.map((id) => services.find((service) => String(service._id) === id)).filter(Boolean), [serviceIds, services]);
    const total = chosen.reduce((sum, service) => sum + getBarberServicePrice(service, barber), 0);
    const toggleService = (id) => setServiceIds((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

    const submit = async (collect) => {
        if (!cleanPhone) { setError('اكتب رقم جوال صحيح (05xxxxxxxx).'); return; }
        if (!name.trim()) { setError('اكتب اسم العميل.'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await posApi.post('/pos/walk-ins', { phone: cleanPhone, name: name.trim(), barberId: barberId || undefined, serviceIds });
            onCreated(res.data.appointment, collect);
        } catch (err) {
            setError(err?.response?.data?.message || 'تعذر تسجيل العميل.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><UserPlus size={20} /></span>
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-900">حلاقة الآن</h3>
                            <p className="text-sm font-semibold text-slate-500">عميل حاضر يدخل طابور الحلاق فوراً</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X size={22} /></button>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-sm font-bold text-slate-600">جوال العميل</span>
                            <input autoFocus value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" placeholder="05xxxxxxxx" dir="ltr" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-left font-mono text-lg font-bold outline-none focus:border-slate-900" />
                            {cleanPhone && (
                                <span className={`mt-1 block text-xs font-bold ${known ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {known ? `عميل سابق · ${known.totalVisits || 0} زيارة` : 'عميل جديد'}
                                </span>
                            )}
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-bold text-slate-600">اسم العميل</span>
                            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-lg font-bold outline-none focus:border-slate-900" />
                            {(known?.children || []).length > 1 && (
                                <span className="mt-1.5 flex flex-wrap gap-1.5">
                                    {known.children.map((child) => (
                                        <button key={child} type="button" onClick={() => setName(child)} className={`h-8 rounded-full border px-3 text-xs font-bold ${name === child ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>{child}</button>
                                    ))}
                                </span>
                            )}
                        </label>
                    </div>

                    {barbers.length > 0 && (
                        <div>
                            <p className="mb-2 text-sm font-bold text-slate-600">الحلاق</p>
                            <div className="flex flex-wrap gap-2">
                                {barbers.length > 1 && (
                                    <button type="button" onClick={() => setBarberId('')} className={`h-11 rounded-xl border-2 px-4 font-bold ${!barberId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>أي حلاق</button>
                                )}
                                {barbers.map((item) => (
                                    <button key={item._id} type="button" onClick={() => setBarberId(String(item._id))} className={`flex h-11 items-center gap-2 rounded-xl border-2 px-4 font-bold ${barberId === String(item._id) ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-700'}`}>
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.iconColor || accent }} />{item.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {services.length > 0 && (
                        <div>
                            <p className="mb-2 text-sm font-bold text-slate-600">الخدمات <span className="font-semibold text-slate-400">(اختياري، تُعدّل عند التحصيل)</span></p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {services.map((service) => {
                                    const selected = serviceIds.includes(String(service._id));
                                    return (
                                        <button key={service._id} type="button" onClick={() => toggleService(String(service._id))} className={`flex h-14 items-center justify-between gap-2 rounded-xl border-2 px-3 text-right ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                {selected ? <Check size={16} className="shrink-0 text-emerald-600" /> : <Scissors size={15} className="shrink-0 text-slate-300" />}
                                                <span className="truncate text-sm font-bold text-slate-800">{service.name}</span>
                                            </span>
                                            <span className="shrink-0 font-mono text-xs font-bold text-slate-500" dir="ltr">{money(getBarberServicePrice(service, barber))}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-5">
                    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                        {chosen.length > 0 && <span className="ml-auto font-mono text-lg font-extrabold text-slate-900" dir="ltr">{money(total)}</span>}
                        <button type="button" disabled={busy} onClick={() => submit(true)} className="h-14 rounded-xl border border-slate-300 bg-white px-5 font-extrabold text-slate-700 disabled:opacity-50">إضافة وتحصيل الآن</button>
                        <button type="button" disabled={busy} onClick={() => submit(false)} className="h-14 flex-1 rounded-xl text-lg font-extrabold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>
                            {busy ? 'جاري التسجيل...' : 'إضافة للطابور'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WalkInModal;
