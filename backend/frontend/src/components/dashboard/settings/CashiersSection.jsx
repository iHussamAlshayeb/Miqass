import { useEffect, useState } from 'react';
import { KeyRound, MonitorSmartphone, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import API from '../../../services/api';
import { forgetDevice, saveDeviceToken, thisDeviceId } from '../../../services/posApi';

const WEAK = new Set(['1122', '2580', '0852', '1004', '2000', '1010', '6969', '1379']);
// نفس فحص الخادم: رقم مكرر أو تسلسل أو نمط متكرر
const isWeakPin = (pin) => {
    if (/^(\d)\1+$/.test(pin) || /^(\d{2})\1+$/.test(pin) || /^(\d{3})\1+$/.test(pin) || /^(\d{4})\1$/.test(pin)) return true;
    const steps = [...pin].slice(1).map((digit, index) => Number(digit) - Number(pin[index]));
    return steps.every((step) => step === 1) || steps.every((step) => step === -1) || WEAK.has(pin);
};
const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

const digitsOnly = (value) => String(value || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 8);

// الكاشيرون: كل كاشير يدخل نقطة البيع برمزه، ولا يرى لوحة التحكم
const CashiersSection = ({ slug }) => {
    const [cashiers, setCashiers] = useState(null);
    const [name, setName] = useState('');
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [pinEdit, setPinEdit] = useState({ id: '', pin: '' });
    const [devices, setDevices] = useState(null);
    const [activation, setActivation] = useState(null);
    const [now, setNow] = useState(() => Date.now());
    const [currentDeviceId, setCurrentDeviceId] = useState(() => thisDeviceId());

    useEffect(() => {
        API.get('/pos/cashiers')
            .then((res) => setCashiers(res.data.cashiers || []))
            .catch(() => { setCashiers([]); setNotice({ ok: false, text: 'تعذر تحميل الكاشيرين.' }); });
        API.get('/pos/devices')
            .then((res) => setDevices(res.data.devices || []))
            .catch(() => setDevices([]));
    }, []);

    // عدّاد صلاحية رمز التفعيل
    useEffect(() => {
        if (!activation) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [activation]);
    const secondsLeft = activation ? Math.max(0, Math.round((new Date(activation.expiresAt).getTime() - now) / 1000)) : 0;

    const activateHere = () => run(async () => {
        const res = await API.post('/pos/devices', { name: 'جهاز المالك' });
        saveDeviceToken(res.data.deviceToken, res.data.device._id);
        setCurrentDeviceId(res.data.device._id);
        setDevices((list) => [...(list || []), res.data.device]);
    }, 'تم تفعيل هذا الجهاز. يقدر الكاشير يدخل منه على /pos برمزه.');

    const newCode = () => run(async () => {
        const res = await API.post('/pos/devices/activation-code');
        setActivation(res.data);
        setNow(Date.now());
    }, 'اكتب الرمز في شاشة نقطة البيع على الجهاز الجديد خلال 10 دقائق.');

    const revoke = (device) => {
        if (!window.confirm(`إلغاء تفعيل "${device.name}"؟ يخرج الكاشير منه فوراً ولن يدخل منه حتى يُفعّل من جديد.`)) return;
        run(async () => {
            await API.delete(`/pos/devices/${device._id}`);
            setDevices((list) => list.filter((item) => item._id !== device._id));
            if (device._id === currentDeviceId) { forgetDevice(); setCurrentDeviceId(''); }
        }, 'تم إلغاء تفعيل الجهاز.');
    };

    const run = async (request, success) => {
        setBusy(true);
        setNotice(null);
        try {
            await request();
            setNotice({ ok: true, text: success });
            return true;
        } catch (error) {
            setNotice({ ok: false, text: error.response?.data?.message || 'تعذر حفظ التغيير.' });
            return false;
        } finally {
            setBusy(false);
        }
    };

    const add = (event) => {
        event.preventDefault();
        run(async () => {
            const res = await API.post('/pos/cashiers', { name: name.trim(), pin });
            setCashiers((list) => [...list, res.data.cashier]);
            setName('');
            setPin('');
        }, 'تمت إضافة الكاشير.');
    };

    const update = (cashier, change, success) => run(async () => {
        const res = await API.put(`/pos/cashiers/${cashier._id}`, change);
        setCashiers((list) => list.map((item) => (item._id === cashier._id ? res.data.cashier : item)));
    }, success);

    const remove = (cashier) => {
        if (!window.confirm(`حذف الكاشير "${cashier.name}"؟ لن يستطيع الدخول لنقطة البيع.`)) return;
        run(async () => {
            await API.delete(`/pos/cashiers/${cashier._id}`);
            setCashiers((list) => list.filter((item) => item._id !== cashier._id));
        }, 'تم حذف الكاشير.');
    };

    const savePin = async (cashier) => {
        if (await update(cashier, { pin: pinEdit.pin }, 'تم تغيير الرمز.')) setPinEdit({ id: '', pin: '' });
    };

    return (
        <section className="space-y-4 rounded-lg border border-slate-100 bg-white p-5 shadow-sm md:p-7">
            <div>
                <h3 className="text-base font-black text-slate-800">حسابات الكاشير</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-500">
                    الكاشير يفتح <span className="font-mono text-slate-700" dir="ltr">miqass.app/pos</span> ويدخل برمزه، <b>من جهاز مفعّل فقط</b>.
                    يرى نقطة البيع فقط: حجوزات اليوم والتحصيل والوردية ومصروفات الصندوق، ولا يصل للوحة التحكم.
                </p>
            </div>

            {notice && <p className={`rounded-lg px-3 py-2 text-sm font-bold ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>}

            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-black text-slate-800"><ShieldCheck size={16} /> الأجهزة المفعّلة</h4>
                    <span className="flex flex-wrap gap-2">
                        {!currentDeviceId && (
                            <button type="button" disabled={busy} onClick={activateHere} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">تفعيل هذا الجهاز</button>
                        )}
                        <button type="button" disabled={busy} onClick={newCode} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-black text-white">رمز تفعيل جهاز</button>
                    </span>
                </div>
                {activation && secondsLeft > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-white p-4 text-center">
                        <p className="text-xs font-bold text-slate-500">في الجهاز الجديد افتح miqass.app/pos واكتب رابط الصالون <span className="font-mono" dir="ltr">{slug}</span> وهذا الرمز:</p>
                        <p className="mt-2 font-mono text-3xl font-black tracking-[0.25em] text-slate-900" dir="ltr">{formatCode(activation.code)}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">ينتهي بعد {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} · لمرة واحدة</p>
                    </div>
                )}
                {devices === null ? <p className="text-sm font-bold text-slate-400">جاري التحميل...</p>
                    : devices.length === 0 ? <p className="text-sm font-bold text-amber-700">لا يوجد جهاز مفعّل، فلا يستطيع أي كاشير الدخول بعد.</p>
                        : devices.map((device) => (
                            <div key={device._id} className="flex items-center gap-3 rounded-lg bg-white p-3">
                                <MonitorSmartphone size={18} className="text-slate-500" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black text-slate-800">{device.name}{device._id === currentDeviceId ? <span className="mr-2 rounded bg-emerald-50 px-1.5 text-xs text-emerald-700">هذا الجهاز</span> : null}</p>
                                    <p className="text-xs font-bold text-slate-400">{device.lastSeenAt ? `آخر استخدام ${new Date(device.lastSeenAt).toLocaleDateString('ar-SA-u-nu-latn')}` : 'لم يُستخدم بعد'}</p>
                                </div>
                                <button type="button" disabled={busy} onClick={() => revoke(device)} className="h-9 rounded-lg px-3 text-xs font-black text-red-600 hover:bg-red-50">إلغاء التفعيل</button>
                            </div>
                        ))}
            </div>

            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {cashiers === null ? <p className="p-4 text-sm font-bold text-slate-400">جاري التحميل...</p>
                    : cashiers.length === 0 ? <p className="p-4 text-sm font-bold text-slate-400">لا يوجد كاشير بعد. أضف أول كاشير بالأسفل.</p>
                        : cashiers.map((cashier) => (
                            <div key={cashier._id} className="flex flex-wrap items-center gap-3 p-3">
                                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${cashier.isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}><UserRound size={16} /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black text-slate-800">{cashier.name}</p>
                                    <p className="text-xs font-bold text-slate-400">{cashier.isActive ? 'مفعّل' : 'موقوف'}{cashier.lastLoginAt ? ` · آخر دخول ${new Date(cashier.lastLoginAt).toLocaleDateString('ar-SA-u-nu-latn')}` : ''}</p>
                                </div>
                                {pinEdit.id === cashier._id ? (
                                    <span className="flex items-center gap-2">
                                        <input value={pinEdit.pin} onChange={(event) => setPinEdit({ id: cashier._id, pin: digitsOnly(event.target.value) })} inputMode="numeric" placeholder="رمز جديد" dir="ltr" className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-center font-mono font-bold outline-none focus:border-slate-900" />
                                        <button type="button" disabled={busy || pinEdit.pin.length < 4 || isWeakPin(pinEdit.pin)} onClick={() => savePin(cashier)} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-black text-white disabled:opacity-40">حفظ</button>
                                        <button type="button" onClick={() => setPinEdit({ id: '', pin: '' })} className="h-9 px-2 text-xs font-black text-slate-500">إلغاء</button>
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1">
                                        <button type="button" disabled={busy} onClick={() => setPinEdit({ id: cashier._id, pin: '' })} className="flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-black text-slate-600 hover:bg-slate-50"><KeyRound size={14} /> تغيير الرمز</button>
                                        <button type="button" disabled={busy} onClick={() => update(cashier, { isActive: !cashier.isActive }, cashier.isActive ? 'تم إيقاف الكاشير.' : 'تم تفعيل الكاشير.')} className="h-9 rounded-lg px-3 text-xs font-black text-slate-600 hover:bg-slate-50">{cashier.isActive ? 'إيقاف' : 'تفعيل'}</button>
                                        <button type="button" disabled={busy} onClick={() => remove(cashier)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50" aria-label="حذف"><Trash2 size={15} /></button>
                                    </span>
                                )}
                            </div>
                        ))}
            </div>

            <form onSubmit={add} className="flex flex-wrap items-end gap-3">
                <label className="min-w-[160px] flex-1">
                    <span className="mb-1 block text-xs font-black text-slate-500">اسم الكاشير</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900" />
                </label>
                <label className="w-36">
                    <span className="mb-1 block text-xs font-black text-slate-500">الرمز (يُفضّل 6 أرقام)</span>
                    <input value={pin} onChange={(event) => setPin(digitsOnly(event.target.value))} inputMode="numeric" dir="ltr" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-center font-mono text-sm font-bold outline-none focus:border-slate-900" />
                </label>
                {pin.length >= 4 && isWeakPin(pin) && <p className="w-full text-xs font-bold text-red-600">الرمز سهل التخمين (مثل 1234 أو 1111). اختر رمزاً آخر، ويُفضّل 6 أرقام.</p>}
                <button type="submit" disabled={busy || !name.trim() || pin.length < 4 || isWeakPin(pin)} className="flex h-11 items-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-40">
                    <Plus size={16} /> إضافة
                </button>
            </form>
        </section>
    );
};

export default CashiersSection;
