import React, { useEffect, useState } from 'react';
import { KeyRound, LogIn, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import posApi, {
    deviceToken, forgetDevice, isDeviceNotActivated, reportInstalledApp, savedSalonSlug, saveDeviceToken, startCashierSession, POS_SLUG_KEY,
} from '../../services/posApi';

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
const shell = "flex min-h-[100dvh] items-center justify-center bg-slate-100 p-4";
const font = { fontFamily: "'IBM Plex Sans Arabic', 'Tajawal', sans-serif" };
const cleanSlug = (value) => value.trim().toLowerCase().replace(/^.*miqass\.app\//, '').replace(/\/.*$/, '');

/** تفعيل الجهاز مرة واحدة برمز من لوحة التحكم، ثم دخول الكاشير برمزه */
const CashierLogin = ({ onSignedIn }) => {
    // checking | activate | pin
    const [stage, setStage] = useState(() => (deviceToken() ? 'checking' : 'activate'));
    const [device, setDevice] = useState(null);
    const [slug, setSlug] = useState(() => savedSalonSlug());
    const [code, setCode] = useState('');
    const [deviceName, setDeviceName] = useState('');
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (stage !== 'checking') return;
        posApi.post('/pos/device/status', { deviceToken: deviceToken() })
            .then((res) => {
                if (res.data.activated) { setDevice(res.data); setStage('pin'); }
                else { forgetDevice(); setStage('activate'); }
            })
            .catch(() => { setDevice(null); setStage('pin'); });
    }, [stage]);

    const activate = async (event) => {
        event.preventDefault();
        const salon = cleanSlug(slug);
        if (!salon || code.replace(/[\s-]/g, '').length !== 8) { setError('اكتب رابط الصالون ورمز التفعيل (8 خانات).'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await posApi.post('/pos/device/activate', { slug: salon, code, name: deviceName.trim() });
            saveDeviceToken(res.data.deviceToken, res.data.device?._id);
            reportInstalledApp();
            try { localStorage.setItem(POS_SLUG_KEY, salon); } catch { /* تجاهل */ }
            setCode('');
            setStage('checking');
        } catch (err) {
            setError(err?.response?.data?.message || 'تعذر التفعيل. تحقق من الاتصال.');
        } finally {
            setBusy(false);
        }
    };

    const press = (key) => {
        setError('');
        if (key === 'clear') setPin('');
        else if (key === 'back') setPin((value) => value.slice(0, -1));
        else setPin((value) => (value.length < 8 ? value + key : value));
    };

    const signIn = async (event) => {
        event?.preventDefault();
        if (pin.length < 4) { setError('اكتب رمزك (4 أرقام على الأقل).'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await posApi.post('/pos/login', { deviceToken: deviceToken(), pin });
            startCashierSession(res.data.token);
            onSignedIn(res.data);
        } catch (err) {
            setPin('');
            if (isDeviceNotActivated(err)) { forgetDevice(); setStage('activate'); }
            setError(err?.response?.data?.message || 'تعذر الدخول. تحقق من الاتصال.');
        } finally {
            setBusy(false);
        }
    };

    if (stage === 'checking') {
        return <div className={shell} dir="rtl" style={font}><p className="rounded-xl bg-white px-5 py-4 font-bold text-slate-600 shadow">جاري التحقق من الجهاز...</p></div>;
    }

    if (stage === 'activate') {
        return (
            <div className={shell} dir="rtl" style={font}>
                <form onSubmit={activate} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white"><MonitorSmartphone size={22} /></span>
                        <div>
                            <h1 className="text-xl font-extrabold text-slate-900">تفعيل جهاز نقطة البيع</h1>
                            <p className="text-sm font-semibold text-slate-500">مرة واحدة لكل جهاز</p>
                        </div>
                    </div>
                    <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
                        من لوحة التحكم: الإعدادات ← الكاشير ← <b>رمز تفعيل جهاز</b>. الرمز صالح 10 دقائق ولمرة واحدة.
                    </p>
                    <label className="block">
                        <span className="mb-1 block text-sm font-bold text-slate-600">رابط الصالون</span>
                        <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="مثال: balloon" dir="ltr" autoCapitalize="off" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-left font-mono font-semibold outline-none focus:border-slate-900" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-bold text-slate-600">رمز التفعيل</span>
                        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="XXXX-XXXX" dir="ltr" autoCapitalize="characters" autoComplete="off" maxLength={9} className="h-14 w-full rounded-xl border border-slate-200 px-3 text-center font-mono text-2xl font-bold tracking-[0.3em] outline-none focus:border-slate-900" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-bold text-slate-600">اسم الجهاز (اختياري)</span>
                        <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={60} placeholder="مثال: الكاونتر" className="h-12 w-full rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-slate-900" />
                    </label>
                    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                    <button type="submit" disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-lg font-extrabold text-white disabled:opacity-60">
                        <ShieldCheck size={20} /> {busy ? 'جاري التفعيل...' : 'تفعيل الجهاز'}
                    </button>
                    <a href="/login" className="block text-center text-sm font-bold text-slate-400 hover:text-slate-600">دخول المالك للوحة التحكم</a>
                </form>
            </div>
        );
    }

    return (
        <div className={shell} dir="rtl" style={font}>
            <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white"><KeyRound size={22} /></span>
                    <div className="min-w-0">
                        <h1 className="text-xl font-extrabold text-slate-900">دخول الكاشير</h1>
                        <p className="truncate text-sm font-semibold text-slate-500">{device?.salonName || 'نقطة البيع'}{device?.deviceName ? ` · ${device.deviceName}` : ''}</p>
                    </div>
                </div>

                <div className="mb-4 flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50" aria-label="الرمز">
                    {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
                        <span key={index} className={`h-3.5 w-3.5 rounded-full ${index < pin.length ? 'bg-slate-900' : 'bg-slate-300'}`} />
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-2" dir="ltr">
                    {PIN_KEYS.map((key) => (
                        <button key={key} type="button" onClick={() => press(key)} className="flex h-16 items-center justify-center rounded-xl border border-slate-200 bg-white text-2xl font-bold text-slate-800 shadow-sm transition active:scale-95 active:bg-slate-100">
                            {key === 'back' ? '⌫' : key === 'clear' ? <span className="text-sm">مسح</span> : key}
                        </button>
                    ))}
                </div>

                {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

                <button type="submit" disabled={busy} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-lg font-extrabold text-white disabled:opacity-60">
                    <LogIn size={20} /> {busy ? 'جاري الدخول...' : 'دخول'}
                </button>
                <a href="/login" className="mt-3 block text-center text-sm font-bold text-slate-400 hover:text-slate-600">دخول المالك للوحة التحكم</a>
            </form>
        </div>
    );
};

export default CashierLogin;
