import React, { useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import posApi, { savedSalonSlug, startCashierSession } from '../../services/posApi';

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

/** دخول الكاشير برمزه؛ رابط الصالون يُحفظ على الجهاز فلا يُكتب إلا أول مرة */
const CashierLogin = ({ onSignedIn }) => {
    const [slug, setSlug] = useState(() => savedSalonSlug());
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [editingSlug, setEditingSlug] = useState(() => !savedSalonSlug());

    const press = (key) => {
        setError('');
        if (key === 'clear') setPin('');
        else if (key === 'back') setPin((value) => value.slice(0, -1));
        else setPin((value) => (value.length < 8 ? value + key : value));
    };

    const submit = async (event) => {
        event?.preventDefault();
        const cleanSlug = slug.trim().toLowerCase().replace(/^.*miqass\.app\//, '').replace(/\/.*$/, '');
        if (!cleanSlug) { setError('اكتب رابط الصالون.'); setEditingSlug(true); return; }
        if (pin.length < 4) { setError('اكتب رمزك (4 أرقام على الأقل).'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await posApi.post('/pos/login', { slug: cleanSlug, pin });
            startCashierSession(res.data.token, cleanSlug);
            onSignedIn(res.data);
        } catch (err) {
            setPin('');
            setError(err?.response?.data?.message || 'تعذر الدخول. تحقق من الاتصال.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-4" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', 'Tajawal', sans-serif" }}>
            <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white"><KeyRound size={22} /></span>
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900">دخول الكاشير</h1>
                        <p className="text-sm font-semibold text-slate-500">نقطة البيع فقط</p>
                    </div>
                </div>

                {editingSlug ? (
                    <label className="mb-4 block">
                        <span className="mb-1 block text-sm font-bold text-slate-600">رابط الصالون</span>
                        <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="مثال: balloon" dir="ltr" autoCapitalize="off" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-left font-mono font-semibold outline-none focus:border-slate-900" />
                    </label>
                ) : (
                    <button type="button" onClick={() => setEditingSlug(true)} className="mb-4 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
                        <span>الصالون</span><span className="font-mono" dir="ltr">{slug}</span>
                    </button>
                )}

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
