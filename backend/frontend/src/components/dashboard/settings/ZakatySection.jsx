import React, { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, Save, Unplug } from 'lucide-react';
import API from '../../../services/api';

const SELLER_FIELDS = [
    { key: 'legalName', label: 'الاسم القانوني للمنشأة' },
    { key: 'crNumber', label: 'رقم السجل التجاري' },
    { key: 'street', label: 'الشارع' },
    { key: 'buildingNumber', label: 'رقم المبنى' },
    { key: 'city', label: 'المدينة' },
    { key: 'postalCode', label: 'الرمز البريدي' },
];

const EMPTY_SELLER = Object.fromEntries(SELLER_FIELDS.map(({ key }) => [key, '']));
const ACTIVE_STATUSES = ['preparing', 'finalizing'];

const ZakatySection = ({ onTaxNumberSaved }) => {
    const [config, setConfig] = useState({ seller: EMPTY_SELLER, setupStatus: '' });
    const [taxNumber, setTaxNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [serviceConfigured, setServiceConfigured] = useState(false);
    const [provisioningConfigured, setProvisioningConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        API.get('/zatca/zakaty/config')
            .then(({ data }) => {
                if (!active) return;
                setConfig(data.config);
                setTaxNumber(data.taxNumber || '');
                setServiceConfigured(data.serviceConfigured);
                setProvisioningConfigured(data.provisioningConfigured);
            })
            .catch(() => { if (active) setError('تعذر تحميل إعدادات Zakaty.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!ACTIVE_STATUSES.includes(config.setupStatus)) return undefined;
        let active = true;
        const timer = window.setInterval(() => {
            API.get('/zatca/zakaty/config')
                .then(({ data }) => { if (active) setConfig(data.config); })
                .catch(() => { if (active) setError('تعذر تحديث حالة الربط.'); });
        }, 4000);
        return () => { active = false; window.clearInterval(timer); };
    }, [config.setupStatus]);

    const start = async (event) => {
        event.preventDefault();
        if (!window.confirm('بدء ربط المنشأة ببياناتها الضريبية الحقيقية في Zakaty؟')) return;
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const { data } = await API.post('/zatca/zakaty/setup', {
                taxNumber: taxNumber.trim(), seller: config.seller,
            });
            setConfig(data.config);
            onTaxNumberSaved?.(taxNumber.trim());
            setMessage(data.message);
        } catch (cause) {
            setError(cause.response?.data?.message || 'تعذر بدء ربط الصالون.');
        } finally {
            setSaving(false);
        }
    };

    const submitOtp = async () => {
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const { data } = await API.post('/zatca/zakaty/setup/otp', { otp: otp.trim() });
            setConfig(data.config);
            setOtp('');
            setMessage(data.message);
        } catch (cause) {
            setError(cause.response?.data?.message || 'تعذر تأكيد OTP.');
        } finally {
            setSaving(false);
        }
    };

    const saveAddress = async () => {
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const { data } = await API.put('/zatca/zakaty/config', {
                apiKey: '', egsUnitId: config.egsUnitId, seller: config.seller,
            });
            setConfig(data.config);
            setMessage('تم حفظ العنوان.');
        } catch (cause) {
            setError(cause.response?.data?.message || 'تعذر حفظ العنوان.');
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async () => {
        if (!window.confirm('إلغاء مفتاح الصالون في Zakaty؟ سيبقى سجل المنشأة ووحدة EGS.')) return;
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const { data } = await API.delete('/zatca/zakaty/config');
            setConfig(data.config);
            setMessage(data.message);
        } catch (cause) {
            setError(cause.response?.data?.message || 'تعذر إلغاء الربط.');
        } finally {
            setSaving(false);
        }
    };

    const status = config.setupStatus;
    const isRunning = ACTIVE_STATUSES.includes(status);
    const isReady = status === 'ready';
    const hasManualKey = config.hasApiKey && !config.isProvisioned && !status;
    const identityLocked = config.isProvisioned || isRunning || status === 'awaiting_otp';

    return (
        <section className="mt-6 border-t border-slate-200 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-base font-black text-slate-800">الربط مع Zakaty</h3>
                {isReady && <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} />الربط مكتمل</span>}
                {isRunning && <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><Loader2 size={16} className="animate-spin" />{status === 'preparing' ? 'تجهيز الجهاز' : 'فحص الامتثال'}</span>}
            </div>
            {loading ? <p className="text-sm text-slate-500">جاري تحميل الإعدادات...</p> : (
                <form onSubmit={status === 'awaiting_otp' ? (event) => { event.preventDefault(); submitOtp(); } : start} className="space-y-4">
                    {(!serviceConfigured || !provisioningConfigured) && <p role="alert" className="text-sm text-amber-700">خدمة الربط غير مجهزة على خادم مقص بعد.</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block text-sm font-bold text-slate-700">
                            الرقم الضريبي
                            <input required readOnly={identityLocked} dir="ltr" inputMode="numeric" value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm font-normal read-only:bg-slate-100" />
                        </label>
                        {SELLER_FIELDS.map(({ key, label }) => (
                            <label key={key} className="block text-sm font-bold text-slate-700">
                                {label}
                                <input required readOnly={identityLocked && ['legalName', 'crNumber'].includes(key)} value={config.seller?.[key] || ''} onChange={(event) => setConfig((current) => ({ ...current, seller: { ...current.seller, [key]: event.target.value } }))} className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm font-normal read-only:bg-slate-100" />
                            </label>
                        ))}
                    </div>
                    {!status && !hasManualKey && <button type="submit" disabled={saving || !serviceConfigured || !provisioningConfigured} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Link2 size={16} />ربط الصالون</button>}
                    {status === 'attention' && !config.keyIssuePending && <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Link2 size={16} />إعادة المحاولة</button>}
                    {status === 'awaiting_otp' && (
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="text-sm font-bold text-slate-700">رمز OTP من منصة فاتورة
                                <input type="password" dir="ltr" autoComplete="one-time-code" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} className="block mt-1 w-44 rounded-md border border-slate-300 p-2.5 font-normal" />
                            </label>
                            <button type="button" disabled={saving || otp.trim().length < 4} onClick={submitOtp} className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">تأكيد OTP</button>
                        </div>
                    )}
                    {(isReady || hasManualKey) && <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={saveAddress} disabled={saving} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-bold disabled:opacity-50"><Save size={16} />حفظ العنوان</button>
                        {config.hasApiKey && <button type="button" onClick={disconnect} disabled={saving} className="inline-flex items-center gap-2 text-sm font-bold text-red-600 disabled:opacity-50"><Unplug size={16} />إلغاء المفتاح</button>}
                    </div>}
                    {isRunning && <p role="status" className="text-sm text-slate-600">يستمر تجهيز الربط على الخادم حتى بعد إغلاق الصفحة.</p>}
                    {hasManualKey && <p className="text-sm text-amber-700">يوجد مفتاح يدوي محفوظ. ألغِه قبل بدء الربط التلقائي.</p>}
                    {config.keyIssuePending && <p role="alert" className="text-sm text-amber-700">نتيجة إصدار المفتاح غير مؤكدة. يلزم مراجعة مسؤول Zakaty.</p>}
                    {config.setupError && <p role="alert" className="text-sm text-red-600">{config.setupError}{isRunning ? ' ستُعاد المحاولة تلقائيًا.' : ''}</p>}
                    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
                    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                </form>
            )}
        </section>
    );
};

export default ZakatySection;
