import { useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, LoaderCircle, RefreshCw, Scissors, X } from 'lucide-react';
import API from '../../services/api';
import { formatTime12Hour, getLocalDate, getTimePeriod } from '../../utils/helpers';

const statusLabels = {
    Booked: 'مؤكد',
    Pending_Payment: 'بانتظار الدفع',
    Completed: 'مكتمل',
    Cancelled: 'ملغي',
};

const CustomerAppointments = ({ tenant, onClose, initialPhone = '', onVerified }) => {
    const [phone, setPhone] = useState(initialPhone);
    const [code, setCode] = useState('');
    const [stage, setStage] = useState('phone');
    const [token, setToken] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [newDate, setNewDate] = useState(getLocalDate());
    const [newTime, setNewTime] = useState('');
    const [slots, setSlots] = useState([]);
    const [slotsBusy, setSlotsBusy] = useState(false);

    const accessHeaders = { 'X-Booking-Access': token };

    const loadAppointments = async (accessToken = token) => {
        const response = await API.get('/appointments/customer/appointments', {
            headers: { 'X-Booking-Access': accessToken },
        });
        setAppointments(response.data.appointments || []);
    };

    useEffect(() => {
        if (!editingId || !token) return;
        const appointment = appointments.find((item) => item._id === editingId);
        if (!appointment) return;
        let active = true;
        const fetchSlots = async () => {
            setSlotsBusy(true);
            setSlots([]);
            setNewTime('');
            try {
                const response = await API.get('/appointments/available', {
                    params: {
                        tenantId: tenant._id,
                        date: newDate,
                        chair: appointment.barberName,
                        requestedDuration: appointment.totalDuration || tenant.settings?.slotDuration || 30,
                        t: Date.now(),
                    },
                });
                if (active) setSlots(response.data.availableSlots || []);
            } catch {
                if (active) setError('تعذر تحميل الأوقات المتاحة. حاول مرة أخرى.');
            } finally {
                if (active) setSlotsBusy(false);
            }
        };
        fetchSlots();
        return () => { active = false; };
    }, [editingId, newDate, tenant, token, appointments]);

    const sendCode = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        if (!/^05\d{8}$/.test(phone)) {
            setError('أدخل رقم جوال صحيحاً يبدأ بـ 05.');
            return;
        }
        setBusy(true);
        try {
            const response = await API.post('/appointments/customer/send-code', { tenantId: tenant._id, phone });
            setNotice(response.data.message);
            setStage('code');
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'تعذر إرسال الرمز. حاول لاحقاً.');
        } finally { setBusy(false); }
    };

    const verifyCode = async (event) => {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
            const response = await API.post('/appointments/customer/verify-code', {
                tenantId: tenant._id, phone, code,
            });
            await loadAppointments(response.data.token);
            setToken(response.data.token);
            onVerified?.({ token: response.data.token, phone });
            setStage('appointments');
            setCode('');
            setNotice('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'تعذر التحقق من الرمز.');
        } finally { setBusy(false); }
    };

    const runAction = async (appointment, type) => {
        if (type === 'cancel' && !window.confirm(`هل تريد إلغاء موعد ${appointment.childName} يوم ${appointment.date}؟`)) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const url = `/appointments/customer/appointments/${appointment._id}/${type === 'cancel' ? 'cancel' : 'reschedule'}`;
            const response = await API.post(url, type === 'cancel' ? {} : { date: newDate, timeSlot: newTime }, { headers: accessHeaders });
            await loadAppointments();
            setNotice(response.data.message);
            setEditingId(null);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'تعذر تنفيذ العملية. حاول مرة أخرى.');
            if (requestError.response?.status === 401) {
                setToken('');
                setAppointments([]);
                setStage('phone');
            }
        } finally { setBusy(false); }
    };

    const startEditing = (appointment) => {
        setError('');
        setNotice('');
        setNewDate(appointment.date >= getLocalDate() ? appointment.date : getLocalDate());
        setEditingId(appointment._id);
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" dir="rtl" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-lg bg-white shadow-2xl sm:rounded-lg" role="dialog" aria-modal="true" aria-label="مواعيدي">
                <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div className="flex items-center gap-2 text-slate-900"><CalendarDays size={20} /><h2 className="text-lg font-black">مواعيدي</h2></div>
                    <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" title="إغلاق"><X size={19} /></button>
                </header>

                <div className="min-h-0 overflow-y-auto px-5 py-5">
                    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
                    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p>}

                    {stage === 'phone' && (
                        <form onSubmit={sendCode} className="space-y-4">
                            <p className="text-sm leading-6 text-slate-600">أدخل رقم الجوال المستخدم في الحجز، وسنرسل لك رمز تحقق عبر واتساب.</p>
                            <label className="block text-sm font-bold text-slate-800">رقم الجوال
                                <input type="tel" inputMode="numeric" autoComplete="tel" dir="ltr" maxLength={10} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} placeholder="05xxxxxxxx" className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-left outline-none focus:border-slate-900" />
                            </label>
                            <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 font-black text-white disabled:opacity-50">{busy && <LoaderCircle size={17} className="animate-spin" />} إرسال الرمز</button>
                        </form>
                    )}

                    {stage === 'code' && (
                        <form onSubmit={verifyCode} className="space-y-4">
                            <p className="text-sm text-slate-600">أدخل الرمز المرسل إلى <span dir="ltr" className="font-bold text-slate-900">{phone}</span>.</p>
                            <label className="block text-sm font-bold text-slate-800">رمز التحقق
                                <input type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-center text-xl tracking-widest outline-none focus:border-slate-900" />
                            </label>
                            <button type="submit" disabled={busy || code.length !== 6} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 font-black text-white disabled:opacity-50">{busy && <LoaderCircle size={17} className="animate-spin" />} عرض المواعيد</button>
                            <div className="flex items-center justify-between text-sm font-bold">
                                <button type="button" onClick={() => { setStage('phone'); setCode(''); setError(''); }} className="text-slate-600 underline">تغيير الرقم</button>
                                <button type="button" onClick={sendCode} disabled={busy} className="text-slate-900 underline disabled:opacity-50">إعادة إرسال الرمز</button>
                            </div>
                        </form>
                    )}

                    {stage === 'appointments' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
                                <span>المواعيد المرتبطة بالرقم <span dir="ltr">{phone}</span></span>
                                <button type="button" onClick={() => { setToken(''); setAppointments([]); setStage('phone'); setEditingId(null); }} className="shrink-0 text-slate-800 underline">تغيير الرقم</button>
                            </div>
                            {appointments.length === 0 && <div className="py-12 text-center text-sm font-bold text-slate-500">لا توجد مواعيد لهذا الرقم.</div>}
                            {appointments.map((appointment) => {
                                const isUpcoming = appointment.date >= getLocalDate();
                                const canEdit = appointment.status === 'Booked' && !appointment.saleId && isUpcoming;
                                const canCancel = canEdit && appointment.payment?.status !== 'Paid';
                                const isEditing = editingId === appointment._id;
                                return (
                                    <article key={appointment._id} className="rounded-lg border border-slate-200 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div><h3 className="font-black text-slate-900">{appointment.childName}</h3><p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500"><Scissors size={13} />{appointment.barberName}</p></div>
                                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${appointment.status === 'Booked' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabels[appointment.status] || appointment.status}</span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-700">
                                            <span className="flex items-center gap-1"><CalendarDays size={15} /><span dir="ltr">{appointment.date}</span></span>
                                            <span className="flex items-center gap-1"><Clock3 size={15} />{formatTime12Hour(appointment.timeSlot)} {getTimePeriod(appointment.timeSlot)}</span>
                                        </div>
                                        {appointment.selectedServices?.length > 0 && <p className="mt-2 text-xs text-slate-500">{appointment.selectedServices.map((service) => service.name).join('، ')}</p>}
                                        {canEdit && !isEditing && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                            <button type="button" onClick={() => startEditing(appointment)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-800 hover:bg-slate-50"><RefreshCw size={14} />تعديل الموعد</button>
                                            {canCancel && <button type="button" disabled={busy} onClick={() => runAction(appointment, 'cancel')} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"><X size={14} />إلغاء الموعد</button>}
                                        </div>}
                                        {canEdit && !canCancel && <p className="mt-3 text-xs font-bold text-amber-700">إلغاء الحجز المدفوع بعربون يتم عبر الصالون.</p>}
                                        {isEditing && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                                            <label className="block text-xs font-bold text-slate-700">التاريخ الجديد
                                                <input type="date" min={getLocalDate()} max={tenant.settings?.maxBookingDate?.slice(0, 10) || undefined} value={newDate} onChange={(event) => setNewDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2" />
                                            </label>
                                            <label className="block text-xs font-bold text-slate-700">الوقت الجديد
                                                <select value={newTime} disabled={slotsBusy || slots.length === 0} onChange={(event) => setNewTime(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 disabled:bg-slate-50">
                                                    <option value="">{slotsBusy ? 'جار تحميل الأوقات...' : slots.length ? 'اختر الوقت' : 'لا توجد أوقات متاحة'}</option>
                                                    {slots.map((slot) => <option key={slot} value={slot}>{formatTime12Hour(slot)} {getTimePeriod(slot)}</option>)}
                                                </select>
                                            </label>
                                            <div className="flex gap-2">
                                                <button type="button" disabled={busy || !newTime} onClick={() => runAction(appointment, 'reschedule')} className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 text-xs font-black text-white disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} تأكيد التعديل</button>
                                                <button type="button" onClick={() => setEditingId(null)} className="h-10 rounded-lg border border-slate-300 px-4 text-xs font-black">رجوع</button>
                                            </div>
                                        </div>}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerAppointments;
