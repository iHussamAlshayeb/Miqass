import { motion as Motion, AnimatePresence } from 'framer-motion';
import { CalendarPlus, CheckCircle2, Clock3, MapPin, Phone, XCircle } from 'lucide-react';
import { formatTime12Hour, getTimePeriod } from '../../utils/helpers';

const pad = (n) => String(n).padStart(2, '0');
const toUtcStamp = (date) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
const icsEscape = (value) => String(value || '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

// المواعيد مخزنة بتوقيت الرياض
const buildRange = (date, timeSlot, durationMinutes) => {
    const start = new Date(`${date}T${timeSlot}:00+03:00`);
    const end = new Date(start.getTime() + Math.max(15, durationMinutes || 30) * 60000);
    return { start, end };
};

const downloadIcs = ({ title, details, location, date, timeSlot, durationMinutes }) => {
    const { start, end } = buildRange(date, timeSlot, durationMinutes);
    const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Miqass//Booking//AR', 'BEGIN:VEVENT',
        `UID:${start.getTime()}-${Math.random().toString(36).slice(2)}@miqass.app`,
        `DTSTAMP:${toUtcStamp(new Date())}`,
        `DTSTART:${toUtcStamp(start)}`,
        `DTEND:${toUtcStamp(end)}`,
        `SUMMARY:${icsEscape(title)}`,
        `DESCRIPTION:${icsEscape(details)}`,
        location ? `LOCATION:${icsEscape(location)}` : null,
        'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'موعد-الحلاقة.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const googleCalendarUrl = ({ title, details, location, date, timeSlot, durationMinutes }) => {
    const { start, end } = buildRange(date, timeSlot, durationMinutes);
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
        details,
        ...(location ? { location } : {}),
    });
    return `https://calendar.google.com/calendar/render?${params}`;
};

const STATES = {
    confirmed: { icon: CheckCircle2, title: 'تم تأكيد حجزك', tone: null },
    pending: { icon: Clock3, title: 'الدفع قيد المعالجة', tone: '#d97706' },
    cancelled: { icon: XCircle, title: 'لم يكتمل الحجز', tone: '#e11d48' },
};

/**
 * شاشة ما بعد الحجز: ملخص الموعد + إضافة للتقويم + الموقع + إدارة الحجز.
 * info = { state, names?, date, timeSlot, barberName, durationMinutes }
 */
const BookingSuccess = ({ info, salonName, locationUrl, contactPhone, themeColor, onClose, onManage }) => {
    const state = STATES[info?.state] || STATES.confirmed;
    const color = state.tone || themeColor;
    const StateIcon = state.icon;
    const hasSlot = Boolean(info?.date && info?.timeSlot);
    const names = (info?.names || []).filter(Boolean);
    const calendarEvent = hasSlot ? {
        title: `حلاقة${names.length ? ` ${names.join(' و ')}` : ''} - ${salonName}`,
        details: `الحلاق: ${info.barberName || ''}${contactPhone ? `\nللتواصل: ${contactPhone}` : ''}`,
        location: locationUrl || salonName,
        date: info.date,
        timeSlot: info.timeSlot,
        durationMinutes: info.durationMinutes,
    } : null;

    return (
        <AnimatePresence>
            {info && (
                <Motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4"
                    dir="rtl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="booking-success-title"
                >
                    <Motion.div
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl"
                    >
                        <div className="flex flex-col items-center text-center">
                            <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${color}15`, color }}>
                                <StateIcon size={34} />
                            </span>
                            <h2 id="booking-success-title" className="mt-3 text-xl font-black text-slate-900">{state.title}</h2>
                            {info.state === 'pending' && (
                                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                                    إذا أتممت الدفع سيصلك تأكيد الحجز على واتساب خلال دقائق. وإذا لم تدفع، يمكنك الحجز من جديد.
                                </p>
                            )}
                            {info.state === 'cancelled' && (
                                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                                    انتهت مهلة دفع العربون فأُلغي الحجز المؤقت. اختر وقتاً واحجز من جديد.
                                </p>
                            )}
                        </div>

                        {hasSlot && info.state !== 'cancelled' && (
                            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-700 space-y-2">
                                {names.length > 0 && (
                                    <div className="flex justify-between gap-3"><span className="text-slate-400">الاسم</span><span className="text-slate-900">{names.join('، ')}</span></div>
                                )}
                                <div className="flex justify-between gap-3"><span className="text-slate-400">التاريخ</span><span className="text-slate-900" dir="ltr">{info.date}</span></div>
                                <div className="flex justify-between gap-3"><span className="text-slate-400">الوقت</span><span className="text-slate-900">{formatTime12Hour(info.timeSlot)} {getTimePeriod(info.timeSlot)}</span></div>
                                {info.barberName && (
                                    <div className="flex justify-between gap-3"><span className="text-slate-400">الحلاق</span><span className="text-slate-900">{info.barberName}</span></div>
                                )}
                            </div>
                        )}

                        <div className="mt-5 grid gap-2">
                            {calendarEvent && info.state !== 'cancelled' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => downloadIcs(calendarEvent)}
                                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                        <CalendarPlus size={16} /> تقويم الجوال
                                    </button>
                                    <a href={googleCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                        <CalendarPlus size={16} /> تقويم Google
                                    </a>
                                </div>
                            )}
                            {(locationUrl || contactPhone) && (
                                <div className={`grid gap-2 ${locationUrl && contactPhone ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {locationUrl && (
                                        <a href={locationUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                            <MapPin size={16} /> الموقع
                                        </a>
                                    )}
                                    {contactPhone && (
                                        <a href={`tel:${contactPhone}`}
                                            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                            <Phone size={16} /> اتصال بالصالون
                                        </a>
                                    )}
                                </div>
                            )}
                            {info.state !== 'cancelled' && onManage && (
                                <button type="button" onClick={onManage}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                    إدارة حجزي (إلغاء أو تغيير الموعد)
                                </button>
                            )}
                            <button type="button" onClick={onClose}
                                className="rounded-xl px-3 py-3.5 text-sm font-black text-white shadow-md active:scale-[0.98]"
                                style={{ backgroundColor: color }}>
                                {info.state === 'cancelled' ? 'احجز من جديد' : 'تم'}
                            </button>
                        </div>
                    </Motion.div>
                </Motion.div>
            )}
        </AnimatePresence>
    );
};

export default BookingSuccess;
