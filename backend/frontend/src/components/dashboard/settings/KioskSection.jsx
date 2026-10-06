import { useEffect, useState } from 'react';
import { Copy, LockKeyhole, RefreshCw, Tablet } from 'lucide-react';
import API from '../../../services/api';

// إعدادات الكشك: قفله على الأجهزة المفعّلة، ورمز التفعيل الذي يكتبه الموظف في شاشة الكشك
const KioskSection = ({ currentPlan }) => {
    const isPremium = currentPlan === 'Premium';
    const [settings, setSettings] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isPremium) return;
        API.get('/appointments/kiosk/settings')
            .then((res) => setSettings(res.data))
            .catch(() => setNotice({ ok: false, text: 'تعذر جلب إعدادات الكشك.' }));
    }, [isPremium]);

    const toggleLock = async () => {
        if (!settings) return;
        const lockEnabled = !settings.lockEnabled;
        if (lockEnabled && !window.confirm('بعد القفل يعمل الكشك على الأجهزة المفعّلة فقط. تأكد أن جهاز الكشك في الصالون مفعّل برمز التفعيل قبل المتابعة.')) return;
        setBusy(true);
        setNotice(null);
        try {
            const res = await API.put('/appointments/kiosk/settings', { lockEnabled });
            setSettings({ ...settings, lockEnabled: res.data.lockEnabled });
            setNotice({ ok: true, text: res.data.message });
        } catch (error) {
            setNotice({ ok: false, text: error.response?.data?.message || 'تعذر حفظ إعدادات الكشك.' });
        } finally {
            setBusy(false);
        }
    };

    const revokeDevices = async () => {
        if (!window.confirm('سيتوقف كل جهاز كشك مفعّل، ويتغير رمز التفعيل. ستحتاج لتفعيل جهاز الصالون بالرمز الجديد. متابعة؟')) return;
        setBusy(true);
        setNotice(null);
        try {
            const res = await API.post('/appointments/kiosk/revoke');
            setSettings({ ...settings, activationCode: res.data.activationCode });
            setNotice({ ok: true, text: res.data.message });
        } catch (error) {
            setNotice({ ok: false, text: error.response?.data?.message || 'تعذر إلغاء تفعيل الأجهزة.' });
        } finally {
            setBusy(false);
        }
    };

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(settings?.activationCode || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { setCopied(false); }
    };

    return (
        <section className="bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Tablet size={18} /> القفل ورمز التفعيل
            </h3>

            {!isPremium ? (
                <p className="mt-3 text-sm font-bold text-slate-500">الكشك متاح في الباقة المميزة.</p>
            ) : !settings ? (
                <p className="mt-3 text-sm font-bold text-slate-400">{notice?.text || 'جاري التحميل...'}</p>
            ) : (
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-black text-slate-800 flex items-center gap-2"><LockKeyhole size={16} /> قفل الكشك</p>
                                <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
                                    عند التشغيل يعمل الكشك على الأجهزة المفعّلة فقط، ولا يستطيع أحد استخدامه من خارج الصالون عبر رابطه.
                                </p>
                            </div>
                            <button
                                type="button" role="switch" aria-checked={settings.lockEnabled} aria-label="قفل الكشك"
                                onClick={toggleLock} disabled={busy}
                                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${settings.lockEnabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                            >
                                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.lockEnabled ? 'left-1' : 'left-6'}`} />
                            </button>
                        </div>
                        <p className={`mt-3 text-xs font-black ${settings.lockEnabled ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {settings.lockEnabled ? 'مقفل: يعمل على الأجهزة المفعّلة فقط.' : 'غير مقفل: يعمل على أي جهاز يفتح رابط الكشك.'}
                        </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4">
                        <p className="font-black text-slate-800">رمز تفعيل الجهاز</p>
                        <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
                            يكتبه الموظف مرة واحدة في شاشة الكشك لتفعيل الجهاز لمدة سنة، فتظهر للعملاء أسماؤهم المحفوظة.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <span dir="ltr" className="rounded-md bg-slate-100 px-3 py-1.5 text-2xl font-black tracking-[0.3em] text-slate-800">{settings.activationCode}</span>
                            <button type="button" onClick={copyCode} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                <Copy size={13} /> {copied ? 'تم النسخ' : 'نسخ'}
                            </button>
                        </div>
                        <button type="button" onClick={revokeDevices} disabled={busy} className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-red-500 hover:text-red-600 disabled:opacity-50">
                            <RefreshCw size={13} /> إلغاء تفعيل كل الأجهزة وتغيير الرمز
                        </button>
                    </div>
                </div>
            )}

            {settings && notice?.text && (
                <p role={notice.ok ? 'status' : 'alert'} className={`mt-4 rounded-lg border px-3 py-2 text-sm font-bold ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    {notice.text}
                </p>
            )}
        </section>
    );
};

export default KioskSection;
