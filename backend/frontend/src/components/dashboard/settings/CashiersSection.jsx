import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, UserRound } from 'lucide-react';
import API from '../../../services/api';

const digitsOnly = (value) => String(value || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 8);

// الكاشيرون: كل كاشير يدخل نقطة البيع برمزه، ولا يرى لوحة التحكم
const CashiersSection = ({ slug }) => {
    const [cashiers, setCashiers] = useState(null);
    const [name, setName] = useState('');
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [pinEdit, setPinEdit] = useState({ id: '', pin: '' });

    useEffect(() => {
        API.get('/pos/cashiers')
            .then((res) => setCashiers(res.data.cashiers || []))
            .catch(() => { setCashiers([]); setNotice({ ok: false, text: 'تعذر تحميل الكاشيرين.' }); });
    }, []);

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
                    الكاشير يفتح <span className="font-mono text-slate-700" dir="ltr">miqass.app/pos</span> على جهاز الصالون ويدخل برمزه.
                    يرى نقطة البيع فقط: حجوزات اليوم والتحصيل والوردية ومصروفات الصندوق، ولا يصل للوحة التحكم.
                    {slug ? <> رابط الصالون الذي يكتبه أول مرة: <span className="font-mono text-slate-700" dir="ltr">{slug}</span></> : null}
                </p>
            </div>

            {notice && <p className={`rounded-lg px-3 py-2 text-sm font-bold ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>}

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
                                        <button type="button" disabled={busy || pinEdit.pin.length < 4} onClick={() => savePin(cashier)} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-black text-white disabled:opacity-40">حفظ</button>
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
                    <span className="mb-1 block text-xs font-black text-slate-500">الرمز (4-8 أرقام)</span>
                    <input value={pin} onChange={(event) => setPin(digitsOnly(event.target.value))} inputMode="numeric" dir="ltr" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-center font-mono text-sm font-bold outline-none focus:border-slate-900" />
                </label>
                <button type="submit" disabled={busy || !name.trim() || pin.length < 4} className="flex h-11 items-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-40">
                    <Plus size={16} /> إضافة
                </button>
            </form>
        </section>
    );
};

export default CashiersSection;
