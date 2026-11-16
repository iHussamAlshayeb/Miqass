import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import API from '../services/api';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { getLocalDate, formatTime12Hour, getTimePeriod, isBarberOnLeaveOnDate } from '../utils/helpers';
import { FaInstagram, FaTiktok, FaSnapchatGhost, FaPhone, FaStar, FaMapMarkerAlt } from "react-icons/fa";
import TimeSlotsSkeleton from '../components/booking/TimeSlotsSkeleton';
import BookingSkeleton from '../components/booking/BookingSkeleton';
import BookingModal from '../components/booking/BookingModal';
import CustomerAppointments from '../components/booking/CustomerAppointments';
import BookingSuccess from '../components/booking/BookingSuccess';
import { CalendarDays, Check, Lock, Scissors, X } from 'lucide-react';
import BarberChairIcon from '../components/BarberChairIcon';
import { getBarberColor, getIconBackground, getSelectedBarberColor } from '../utils/barberTheme';
import { findBarberByName, getBarberServicePrice } from '../utils/servicePricing';

const getNextTimeSlot = (time, durationMinutes) => {
    if (!time) return null;
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1, hours, minutes + durationMinutes);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
};

// شريط تواريخ أفقي سريع — أول 14 يوم
const buildQuickDates = (maxDate, closedDatesList) => {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const closedSet = new Set((closedDatesList || []).map(d => new Date(d).toDateString()));
    const limit = maxDate ? new Date(maxDate) : null;
    for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        if (limit && d > limit) break;
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        out.push({
            iso,
            day: d.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'short', calendar: 'gregory' }),
            num: d.getDate(),
            month: d.toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', calendar: 'gregory' }),
            isClosed: closedSet.has(d.toDateString()),
            isToday: i === 0,
        });
    }
    return out;
};

// ─── هوية الصفحة: حجر فاتح، حبر داكن، ولون الصالون للتمييز ───
const INK = { stone: '#EEF0EC', ink: '#1C1F22', muted: '#6A7068', line: '#DCDFD8' };
const DISPLAY_FONT = "'Noto Kufi Arabic', 'IBM Plex Sans Arabic', sans-serif";
const BODY_FONT = "'IBM Plex Sans Arabic', 'Tajawal', sans-serif";
// خطوط عمود الحلاق المائلة فوق لون الصالون
const POLE_STRIPES = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 14px, transparent 14px 42px), linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.18))';
const CHIP = 'inline-flex h-10 items-center gap-2 rounded-full border border-[#DCDFD8] px-4 text-sm font-semibold text-[#1C1F22] transition-colors hover:border-[#1C1F22]';

const longDayLabel = (iso) => {
    if (!iso) return '';
    const date = new Date(`${iso}T12:00:00`);
    const today = getLocalDate();
    const prefix = iso === today ? 'اليوم، ' : '';
    return prefix + date.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', calendar: 'gregory' });
};

const StepHeader = ({ number, id, title, hint, done, children }) => (
    <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors"
            style={done ? { backgroundColor: 'var(--accent)', color: '#fff' } : { backgroundColor: '#fff', color: INK.ink, boxShadow: `inset 0 0 0 1.5px ${INK.line}` }}
            aria-hidden="true">
            {done ? <Check size={16} strokeWidth={3} /> : number}
        </span>
        <div className="min-w-0 flex-1">
            <h2 id={id} className="text-lg font-bold leading-tight" style={{ fontFamily: DISPLAY_FONT }}>{title}</h2>
            {hint && <p className="truncate text-xs" style={{ color: INK.muted }}>{hint}</p>}
        </div>
        {children}
    </div>
);

const EmptyNote = ({ title, text }) => (
    <div className="rounded-[18px] border border-dashed bg-white/60 px-5 py-7 text-center" style={{ borderColor: INK.line }}>
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-sm" style={{ color: INK.muted }}>{text}</p>
    </div>
);

// زر يفتح التقويم الكامل (react-datepicker يمرر onClick وref)
const CalendarButton = React.forwardRef(({ onClick }, ref) => (
    <button type="button" ref={ref} onClick={onClick} className={`${CHIP} h-9 bg-white px-3`}>
        <CalendarDays size={15} /> التقويم
    </button>
));
CalendarButton.displayName = 'CalendarButton';

/**
 * تذكرة الحجز: تمتلئ مع كل اختيار، بحافة مثقّبة كتذكرة الانتظار في الصالون.
 * على الجوال تظهر مختصرة أسفل الشاشة، وعلى الشاشات الكبيرة كاملة بجانب الخطوات.
 */
const BookingTicket = ({ ticket, accent, ready, hasDeposit, onContinue }) => (
    <div className="mx-auto max-w-lg overflow-hidden rounded-[20px] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.16)] lg:max-w-none lg:shadow-none lg:ring-1 lg:ring-[#DCDFD8]">
        <div className="hidden px-5 pb-4 pt-5 lg:block">
            <p className="text-sm font-bold" style={{ fontFamily: DISPLAY_FONT }}>تذكرة حجزك</p>
            <dl className="mt-3 space-y-2.5 text-sm">
                {[['الخدمة', ticket.services], ['الحلاق', ticket.barber], ['اليوم', ticket.day], ['الوقت', ticket.time || 'لم تختر الوقت بعد']].map(([label, value]) => (
                    <div key={label} className="flex gap-3">
                        <dt className="w-14 shrink-0" style={{ color: INK.muted }}>{label}</dt>
                        <dd className="min-w-0 font-semibold">{value}</dd>
                    </div>
                ))}
            </dl>
        </div>
        {/* الحافة المثقّبة */}
        <div className="relative hidden h-4 lg:block" aria-hidden="true">
            <span className="absolute -right-2 top-0 h-4 w-4 rounded-full" style={{ backgroundColor: INK.stone }} />
            <span className="absolute -left-2 top-0 h-4 w-4 rounded-full" style={{ backgroundColor: INK.stone }} />
            <span className="absolute inset-x-4 top-1/2 border-t-2 border-dashed" style={{ borderColor: INK.line }} />
        </div>
        <div className="flex items-center gap-3 p-3 lg:flex-col lg:items-stretch lg:px-5 lg:pb-5 lg:pt-2">
            <div className="min-w-0 flex-1 lg:flex lg:items-baseline lg:justify-between">
                <p className="truncate text-xs lg:hidden" style={{ color: INK.muted }}>
                    {ready ? `${ticket.barber}، ${ticket.time}` : `${ticket.barber}، ${ticket.day}`}
                </p>
                <p className="hidden text-sm lg:block" style={{ color: INK.muted }}>{ticket.price ? `الإجمالي، ${ticket.duration} دقيقة` : 'الإجمالي'}</p>
                <p className="text-xl font-bold leading-tight" style={{ fontFamily: DISPLAY_FONT }}>
                    {ticket.price ? <>{ticket.price} <span className="text-xs font-semibold" style={{ color: INK.muted }}>ر.س</span></> : <span className="text-base">{ticket.emptyPrice}</span>}
                </p>
            </div>
            <button type="button" onClick={onContinue}
                className="h-12 shrink-0 rounded-[14px] px-5 text-base font-bold text-white transition-opacity lg:h-[52px] lg:w-full"
                style={{ backgroundColor: ready ? accent : INK.ink, opacity: ready ? 1 : 0.9 }}>
                {ready ? (hasDeposit ? 'متابعة لدفع العربون' : 'متابعة الحجز') : 'اختر الوقت'}
            </button>
        </div>
    </div>
);

const BookingScreen = () => {
    const { slug } = useParams();

    const [tenantData, setTenantData] = useState(null);
    const [isTenantLoading, setIsTenantLoading] = useState(true);
    const [tenantError, setTenantError] = useState('');
    const [expandedReviewIdx, setExpandedReviewIdx] = useState(null);
    const [selectedDate, setSelectedDate] = useState(getLocalDate());
    const [availableSlots, setAvailableSlots] = useState([]);
    const [selectedTime, setSelectedTime] = useState(null);
    const [isFetchingSlots, setIsFetchingSlots] = useState(false);
    const [availabilityError, setAvailabilityError] = useState('');
    const [availabilityRetry, setAvailabilityRetry] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [bookingError, setBookingError] = useState('');
    const [bookingErrorField, setBookingErrorField] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showMyAppointments, setShowMyAppointments] = useState(false);
    const [myAppointmentsPhone, setMyAppointmentsPhone] = useState('');
    const [myAppointmentsMode, setMyAppointmentsMode] = useState('appointments');
    // توكن التحقق برمز الجوال (صالح 20 دقيقة) — يسمح بعرض أسماء الأطفال المحفوظة
    const [customerAccess, setCustomerAccess] = useState(null);
    const [childrenNames, setChildrenNames] = useState(['']);
    const [phone, setPhone] = useState('');
    const [selectedChair, setSelectedChair] = useState('');
    const [selectedServicesIds, setSelectedServicesIds] = useState([]);

    const [loyaltyVisits, setLoyaltyVisits] = useState(null);
    const [isCheckingLoyalty, setIsCheckingLoyalty] = useState(false);
    const [savedChildren, setSavedChildren] = useState([]);

    const [topReviews, setTopReviews] = useState([]);
    const [reviewsCount, setReviewsCount] = useState(0);
    const [serviceCategory, setServiceCategory] = useState('');

    const [isClosed, setIsClosed] = useState(false);
    const [closedDatesList, setClosedDatesList] = useState([]);
    const [maxDate, setMaxDate] = useState(null);

    const [paymentDetails, setPaymentDetails] = useState(null);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
    // شاشة ما بعد الحجز (أو بعد الرجوع من بوابة الدفع)
    const [successInfo, setSuccessInfo] = useState(null);

    const availableBarbers = useMemo(
        () => (tenantData?.barbers || []).filter((barber) => !isBarberOnLeaveOnDate(barber, selectedDate)),
        [tenantData?.barbers, selectedDate],
    );

    useEffect(() => {
        const fetchTenant = async () => {
            try {
                const res = await API.get(`/tenants/${slug}`);
                const { tenant, barbers, services, reviews } = res.data;
                const activeBarbers = barbers ? barbers.filter(b => b.isActive !== false) : [];
                const fullTenantData = { ...tenant, barbers: activeBarbers, services };
                setTenantData(fullTenantData);
                if (activeBarbers && activeBarbers.length > 0) setSelectedChair(activeBarbers[0].name);
                else setSelectedChair('');
                if (reviews && reviews.length > 0) {
                    setReviewsCount(reviews.length);
                    const filteredReviews = reviews
                        .filter(r => r.rating >= 4 && r.comment && r.comment.trim() !== '')
                        .slice(0, 5);
                    setTopReviews(filteredReviews);
                }
                if (tenant.settings.maxBookingDate) setMaxDate(new Date(tenant.settings.maxBookingDate));
                if (tenant.settings.closedDates) setClosedDatesList(tenant.settings.closedDates.map(dateStr => new Date(dateStr)));
            } catch {
                setTenantError('عذراً، هذا الصالون غير موجود أو الرابط غير صحيح.');
            } finally {
                setIsTenantLoading(false);
            }
        };
        if (slug) fetchTenant();
    }, [slug]);

    // الرجوع من بوابة الدفع (?payment=return&appointmentId=...): نعرض حالة الحجز،
    // ونعيد التحقق بضع مرات لأن إشعار الدفع من البوابة قد يتأخر ثوانٍ
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const appointmentId = params.get('appointmentId');
        if (params.get('payment') !== 'return' || !appointmentId || !slug) return undefined;
        window.history.replaceState(null, '', window.location.pathname);

        let stopped = false;
        let timer;
        const check = async (attempt) => {
            try {
                const res = await API.get(`/appointments/payment-status/${appointmentId}`, { params: { slug } });
                if (stopped) return;
                setSuccessInfo((current) => ({ ...(current || {}), ...res.data }));
                if (res.data.state === 'pending' && attempt < 10) {
                    timer = setTimeout(() => check(attempt + 1), 3000);
                }
            } catch {
                // رابط غير صالح أو موعد غير موجود: لا نعرض شيئاً
            }
        };
        check(0);
        return () => { stopped = true; clearTimeout(timer); };
    }, [slug]);

    // السعر يتبع الحلاق المختار: سعره الخاص إن حدده الصالون، وإلا السعر الأساسي
    const selectedBarber = findBarberByName(tenantData?.barbers, selectedChair);
    const hasBarberPricing = (tenantData?.barbers || []).some((barber) => barber?.servicePrices?.length > 0);
    const calculateTotals = () => {
        if (!tenantData?.services || tenantData.services.length === 0) return { price: 0, duration: tenantData?.settings?.slotDuration || 30 };
        let totalP = 0; let totalD = 0;
        selectedServicesIds.forEach(id => {
            const srv = tenantData.services.find(s => s._id === id || s.id === id);
            if (srv) { totalP += getBarberServicePrice(srv, selectedBarber); totalD += srv.duration; }
        });
        if (selectedServicesIds.length === 0) return { price: 0, duration: tenantData?.settings?.slotDuration || 30 };
        return { price: totalP, duration: totalD };
    };
    const totals = calculateTotals();
    const filledChildrenCount = useMemo(
        () => childrenNames.filter(name => name.trim() !== '').length,
        [childrenNames],
    );

    useEffect(() => {
        let cancelled = false;
        const fetchAvailableSlots = async () => {
            if (!tenantData || !selectedChair) {
                setIsFetchingSlots(false);
                setAvailableSlots([]);
                setAvailabilityError('');
                return;
            }
            setIsFetchingSlots(true);
            setIsClosed(false);
            setAvailabilityError('');
            try {
                const reqDuration = totals.duration * filledChildrenCount || totals.duration;
                const response = await API.get('/appointments/available', {
                    params: {
                        tenantId: tenantData._id, date: selectedDate, chair: selectedChair,
                        requestedDuration: reqDuration, t: new Date().getTime()
                    }
                });
                if (!cancelled) {
                    setAvailableSlots(response.data.availableSlots || []);
                    setIsClosed(Boolean(response.data.isClosed));
                }
            } catch (error) {
                console.error('Error fetching slots:', error);
                if (!cancelled) {
                    setAvailableSlots([]);
                    setAvailabilityError('تعذر جلب المواعيد المتاحة. حاول مرة أخرى.');
                }
            } finally { if (!cancelled) setIsFetchingSlots(false); }
        };
        fetchAvailableSlots();
        return () => { cancelled = true; };
    }, [selectedDate, selectedChair, tenantData, selectedServicesIds, filledChildrenCount, totals.duration, availabilityRetry]);

    // الوقت المختار لم يعد متاحاً (تغيّرت الخدمات أو حُجز)؛ نلغيه بدل حجز وقت غير موجود
    useEffect(() => {
        if (selectedTime && !isFetchingSlots && !availableSlots.includes(selectedTime)) setSelectedTime(null);
    }, [availableSlots, isFetchingSlots, selectedTime]);

    useEffect(() => {
        if (availableBarbers.some((barber) => barber.name === selectedChair)) return;
        setSelectedChair(availableBarbers[0]?.name || '');
        setSelectedTime(null);
        setAvailableSlots([]);
    }, [availableBarbers, selectedChair]);

    useEffect(() => {
        const checkLoyaltyAndFetchData = async () => {
            if (phone.length === 10 && phone.startsWith('05') && tenantData) {
                setIsCheckingLoyalty(true);
                try {
                    const res = await API.get(`/appointments/loyalty/${tenantData._id}/${phone}`);
                    setLoyaltyVisits(res.data.visits);
                    setSavedChildren([]);

                    if (customerAccess?.phone === phone) {
                        try {
                            const profile = await API.get('/appointments/customer/profile', {
                                headers: { 'X-Booking-Access': customerAccess.token },
                            });
                            setSavedChildren(profile.data.children || []);
                        } catch (profileError) {
                            if (profileError.response?.status === 401) setCustomerAccess(null);
                        }
                    }
                } catch {
                    setLoyaltyVisits(null); setSavedChildren([]);
                } finally { setIsCheckingLoyalty(false); }
            } else {
                setLoyaltyVisits(null); setSavedChildren([]);
            }
        };
        const timeoutId = setTimeout(() => { checkLoyaltyAndFetchData(); }, 500);
        return () => clearTimeout(timeoutId);
    }, [phone, tenantData, customerAccess]);

    const handleBookingSubmit = async (e) => {
        e.preventDefault();
        setBookingError('');
        setBookingErrorField('');
        if (!/^05\d{8}$/.test(phone)) {
            setBookingError('أدخل رقم جوال صحيحًا يبدأ بـ 05 ويتكون من 10 أرقام.');
            setBookingErrorField('phone');
            return;
        }
        const validNames = childrenNames.filter(name => name.trim() !== '');
        if (validNames.length !== childrenNames.length) {
            setBookingError('اكتب اسمًا لكل شخص أضفته إلى الحجز.');
            setBookingErrorField('names');
            return;
        }
        setIsLoading(true);
        try {
            const fullSelectedServices = selectedServicesIds.map(id => tenantData.services.find(s => s._id === id || s.id === id)).filter(Boolean);
            const response = await API.post('/appointments/book', {
                tenantId: tenantData._id, date: selectedDate, timeSlot: selectedTime,
                customerPhone: phone, childrenNames: validNames, chair: selectedChair,
                selectedServices: fullSelectedServices
            });
            if (response.data.requiresPayment) {
                setIsModalOpen(false);
                setPaymentDetails(response.data.paymentDetails);
                setShowPaymentForm(true);
            } else {
                handleCloseModal();
                setSuccessInfo({
                    state: 'confirmed',
                    names: validNames,
                    date: selectedDate,
                    timeSlot: selectedTime,
                    barberName: selectedChair,
                    durationMinutes: (totals.duration || tenantData.settings?.slotDuration || 30) * validNames.length,
                });
                // تجهيز الصفحة لحجز جديد وتحديث الأوقات المتاحة
                setSelectedTime(null);
                setChildrenNames(['']);
                setAvailabilityRetry((value) => value + 1);
            }
        } catch (error) {
            setBookingError(error.response?.data?.message || 'تعذر إكمال الحجز الآن. حاول مرة أخرى.');
        } finally { setIsLoading(false); }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setBookingError('');
        setBookingErrorField('');
    };

    let maxConsecutiveSlots = 1;
    if (isModalOpen && selectedTime && tenantData) {
        const slotStep = tenantData.settings?.slotDuration || 30;
        let checkSlot = selectedTime;
        for (let i = 1; i < 4; i++) {
            checkSlot = getNextTimeSlot(checkSlot, slotStep);
            if (availableSlots.includes(checkSlot)) maxConsecutiveSlots++;
            else break;
        }
    }

    const handleGoToPayment = () => {
        if (!paymentDetails?.paymentUrl) {
            alert('تعذر تجهيز رابط الدفع. يرجى التواصل مع الصالون.');
            return;
        }
        setIsVerifyingPayment(true);
        window.location.href = paymentDetails.paymentUrl;
    };

    const groupedSlots = useMemo(() => {
        const groups = { 'الصباح': [], 'الظهر والعصر': [], 'المساء': [] };
        availableSlots.forEach(t => {
            const [h] = t.split(':').map(Number);
            if (h < 12) groups['الصباح'].push(t);
            else if (h < 17) groups['الظهر والعصر'].push(t);
            else groups['المساء'].push(t);
        });
        return groups;
    }, [availableSlots]);

    const quickDates = useMemo(() => buildQuickDates(maxDate, closedDatesList), [maxDate, closedDatesList]);

    // 💡 الألوان الأساسية والثانوية
    const brandPrimary = tenantData?.branding?.primaryColor || '#3b82f6';
    const brandSecondary = tenantData?.branding?.secondaryColor || '#64748b';

    // 💡 منطق التلوين الديناميكي (Dynamic Theming)
    // الصفحة تأخذ لون الحلاق المختار (لونه المخصص من الإعدادات إن وُجد)
    const activeThemeColor = getSelectedBarberColor(availableBarbers, selectedChair, brandPrimary, brandSecondary);

    if (isTenantLoading) return <BookingSkeleton />;

    if (tenantError) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-arabic text-red-500 font-black p-6 text-center">
                <p className="text-6xl mb-4 grayscale opacity-60">✂️</p>
                <p className="text-2xl">{tenantError}</p>
                <p className="text-slate-400 mt-2 text-sm">تأكد من صحة الرابط وحاول مرة أخرى.</p>
            </div>
        );
    }

    const servicesCount = selectedServicesIds.length;
    const selectedServices = selectedServicesIds
        .map((id) => tenantData.services?.find((srv) => (srv._id || srv.id) === id))
        .filter(Boolean);
    const services = tenantData.services || [];
    const serviceCategories = [...new Set(services.map((srv) => srv.category || 'عام'))];
    const visibleServices = serviceCategory ? services.filter((srv) => (srv.category || 'عام') === serviceCategory) : services;
    const hasDeposit = tenantData?.paymentSettings?.isOnlinePaymentEnabled && tenantData?.paymentSettings?.depositAmount > 0;
    const toggleService = (srvId) => setSelectedServicesIds((current) => (
        current.includes(srvId) ? current.filter((id) => id !== srvId) : [...current, srvId]
    ));
    const openDetails = () => {
        if (!selectedTime) {
            document.getElementById('step-time')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        setBookingError('');
        setBookingErrorField('');
        setIsModalOpen(true);
    };
    const socials = [
        ['instagram', 'إنستغرام', FaInstagram],
        ['tiktok', 'تيك توك', FaTiktok],
        ['snapchat', 'سناب شات', FaSnapchatGhost],
    ].filter(([key]) => tenantData.socialLinks?.[key]);
    const ticket = {
        services: selectedServices.length ? selectedServices.map((srv) => srv.name).join('، ') : (services.length ? 'لم تختر خدمة بعد' : 'حجز مقعد'),
        barber: selectedChair || '—',
        day: longDayLabel(selectedDate),
        time: selectedTime ? `${formatTime12Hour(selectedTime)} ${getTimePeriod(selectedTime)}` : '',
        price: totals.price,
        duration: totals.duration,
        // بلا خدمات في الصالون: الحجز لمقعد والسعر يُحدد هناك
        emptyPrice: services.length ? 'اختر خدمة' : 'السعر في الصالون',
    };

    return (
        <div className="min-h-screen overflow-x-clip pb-40 text-right lg:pb-12" dir="rtl" style={{ backgroundColor: INK.stone, color: INK.ink, fontFamily: BODY_FONT, '--accent': activeThemeColor }}>

            {/* ─── رأس الصالون: شريط بلون الهوية بخطوط عمود الحلاق ─── */}
            <header className="relative">
                <div className="h-28 sm:h-36" style={{ backgroundColor: brandPrimary, backgroundImage: POLE_STRIPES }} aria-hidden="true" />
                <div className="mx-auto max-w-5xl px-4">
                    <div className="-mt-12 flex flex-col gap-3 sm:-mt-10 sm:flex-row sm:items-end sm:gap-5">
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-white shadow-[0_6px_24px_rgba(28,31,34,0.18)] ring-4 ring-white sm:h-28 sm:w-28">
                            {tenantData.branding?.logoUrl
                                ? <img src={tenantData.branding.logoUrl} alt={`شعار ${tenantData.salonName}`} className="h-full w-full object-contain p-1.5" />
                                : <BarberChairIcon width="3rem" height="3rem" style={{ color: brandPrimary }} />}
                        </div>
                        <div className="min-w-0 flex-1 sm:pb-1">
                            <h1 className="truncate text-[26px] font-extrabold leading-tight sm:text-[32px]" style={{ fontFamily: DISPLAY_FONT }}>{tenantData.salonName}</h1>
                            <p className="mt-0.5 text-sm" style={{ color: INK.muted }}>
                                {topReviews.length > 0 ? <><FaStar className="-mt-0.5 ml-1 inline text-amber-500" />{reviewsCount} تقييم من العملاء</> : 'احجز موعدك في أقل من دقيقة'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setShowMyAppointments(true)} className={`${CHIP} bg-white`}>
                            <CalendarDays size={16} /> مواعيدي
                        </button>
                        {tenantData.settings?.locationUrl && (
                            <a href={tenantData.settings.locationUrl} target="_blank" rel="noopener noreferrer" className={`${CHIP} bg-white`}>
                                <FaMapMarkerAlt /> الموقع
                            </a>
                        )}
                        {tenantData.contactPhone && (
                            <a href={`tel:${tenantData.contactPhone}`} className={`${CHIP} bg-white`}>
                                <FaPhone className="scale-x-[-1]" /> اتصال
                            </a>
                        )}
                        {socials.map(([key, label, Icon]) => (
                            <a key={key} href={tenantData.socialLinks[key]} target="_blank" rel="noopener noreferrer" aria-label={label} className={`${CHIP} w-10 shrink-0 justify-center bg-white !px-0`}>
                                {React.createElement(Icon, { size: 17 })}
                            </a>
                        ))}
                    </div>
                </div>
            </header>

            <div className="mx-auto mt-8 grid max-w-5xl gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <main className="min-w-0 space-y-10">

                    {/* ─── 1. الخدمة: كقائمة أسعار الصالون ─── */}
                    {services.length > 0 && (
                        <section aria-labelledby="step-services-title">
                            <StepHeader number={1} id="step-services-title" title="اختر الخدمة" hint={hasBarberPricing && selectedChair ? `الأسعار لدى ${selectedChair}` : 'يمكنك اختيار أكثر من خدمة'} done={servicesCount > 0} />
                            {serviceCategories.length > 1 && (
                                <div className="hide-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
                                    {[['', 'الكل'], ...serviceCategories.map((name) => [name, name])].map(([value, label]) => (
                                        <button key={label} type="button" onClick={() => setServiceCategory(value)} aria-pressed={serviceCategory === value}
                                            className="h-9 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors"
                                            style={serviceCategory === value ? { backgroundColor: INK.ink, borderColor: INK.ink, color: '#fff' } : { borderColor: INK.line, color: INK.muted, backgroundColor: '#fff' }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <ul className="overflow-hidden rounded-[18px] border bg-white" style={{ borderColor: INK.line }}>
                                {visibleServices.map((srv) => {
                                    const srvId = srv._id || srv.id;
                                    const isSelected = selectedServicesIds.includes(srvId);
                                    return (
                                        <li key={srvId} className="border-b last:border-b-0" style={{ borderColor: INK.line }}>
                                            <button type="button" onClick={() => toggleService(srvId)} aria-pressed={isSelected}
                                                className="flex w-full items-center gap-3 px-4 py-3.5 text-right transition-colors"
                                                style={isSelected ? { backgroundColor: `${activeThemeColor}0F` } : undefined}>
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
                                                    style={isSelected ? { backgroundColor: activeThemeColor, borderColor: activeThemeColor } : { borderColor: INK.line }}>
                                                    {isSelected && <Check size={15} strokeWidth={3} className="text-white" />}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block font-semibold">{srv.name}</span>
                                                    <span className="block text-xs" style={{ color: INK.muted }}>{srv.duration} دقيقة{srv.description ? `، ${srv.description}` : ''}</span>
                                                </span>
                                                {/* نقاط قائمة الأسعار بين الاسم والسعر */}
                                                <span className="mx-1 h-px min-w-[24px] flex-1 self-center border-b-2 border-dotted" style={{ borderColor: INK.line }} aria-hidden="true" />
                                                <span className="shrink-0 text-base font-bold" style={{ fontFamily: DISPLAY_FONT }}>
                                                    {getBarberServicePrice(srv, selectedBarber)} <span className="text-xs font-semibold" style={{ color: INK.muted }}>ر.س</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* ─── 2. الحلاق ─── */}
                    <section aria-labelledby="step-barber-title">
                        <StepHeader number={services.length ? 2 : 1} id="step-barber-title" title="اختر الحلاق" hint={availableBarbers.length > 1 ? `${availableBarbers.length} حلاقين متاحين في هذا اليوم` : ''} done={Boolean(selectedChair)} />
                        {availableBarbers.length === 0 ? (
                            <EmptyNote title="لا يوجد حلاق متاح في هذا اليوم" text="الطاقم في إجازة. اختر يوماً آخر من الأسفل." />
                        ) : (
                            <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                                {availableBarbers.map((barberObj, index) => {
                                    const isSelected = selectedChair === barberObj.name;
                                    const chairColor = getBarberColor(barberObj, index, brandPrimary, brandSecondary);
                                    return (
                                        <button key={barberObj._id || barberObj.name} type="button" aria-pressed={isSelected}
                                            onClick={() => { setSelectedChair(barberObj.name); setSelectedTime(null); }}
                                            className="flex min-w-[112px] shrink-0 flex-col items-center gap-2 rounded-[18px] border-2 bg-white px-3 pb-3 pt-4 transition-colors"
                                            style={{ borderColor: isSelected ? chairColor : INK.line }}>
                                            <span className="relative flex h-16 w-16 items-center justify-center rounded-full text-[2.1rem]" style={{ backgroundColor: getIconBackground(chairColor), boxShadow: `inset 0 0 0 2px ${chairColor}33` }}>
                                                <BarberChairIcon width="1em" height="1em" style={{ color: chairColor }} />
                                                {isSelected && (
                                                    <span className="absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-white" style={{ backgroundColor: chairColor }}>
                                                        <Check size={14} strokeWidth={3} />
                                                    </span>
                                                )}
                                            </span>
                                            <span className="max-w-[96px] truncate text-sm font-bold">{barberObj.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* ─── 3. اليوم ─── */}
                    <section aria-labelledby="step-day-title">
                        <StepHeader number={services.length ? 3 : 2} id="step-day-title" title="اختر اليوم" hint={longDayLabel(selectedDate)} done>
                            <div className="shrink-0">
                            <DatePicker
                                selected={new Date(`${selectedDate}T12:00:00`)}
                                onChange={(date) => {
                                    const offset = date.getTimezoneOffset() * 60000;
                                    setSelectedDate(new Date(date.getTime() - offset).toISOString().split('T')[0]);
                                    setSelectedTime(null);
                                }}
                                minDate={new Date()}
                                maxDate={maxDate}
                                excludeDates={closedDatesList}
                                withPortal
                                customInput={<CalendarButton />}
                            />
                            </div>
                        </StepHeader>
                        <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                            {quickDates.map((d) => {
                                const isSelected = selectedDate === d.iso;
                                return (
                                    <button key={d.iso} type="button" disabled={d.isClosed} aria-pressed={isSelected}
                                        onClick={() => { setSelectedDate(d.iso); setSelectedTime(null); }}
                                        className="flex w-[58px] shrink-0 flex-col items-center gap-1 rounded-[14px] border py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                                        style={isSelected ? { backgroundColor: INK.ink, borderColor: INK.ink, color: '#fff' } : { backgroundColor: '#fff', borderColor: INK.line }}>
                                        <span className="text-[11px] font-semibold" style={{ color: isSelected ? 'rgba(255,255,255,0.75)' : INK.muted }}>{d.isToday ? 'اليوم' : d.day}</span>
                                        <span className="text-xl font-bold leading-none" style={{ fontFamily: DISPLAY_FONT }}>{d.num}</span>
                                        <span className="text-[10px]" style={{ color: isSelected ? 'rgba(255,255,255,0.6)' : INK.muted }}>{d.isClosed ? 'مغلق' : d.month}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* ─── 4. الوقت ─── */}
                    <section id="step-time" aria-labelledby="step-time-title" className="scroll-mt-6">
                        <StepHeader number={services.length ? 4 : 3} id="step-time-title" title="اختر الوقت" hint={servicesCount ? `مدة الخدمة ${totals.duration} دقيقة` : ''} done={Boolean(selectedTime)} />
                        {isFetchingSlots ? (
                            <TimeSlotsSkeleton />
                        ) : isClosed ? (
                            <EmptyNote title="الصالون مغلق في هذا اليوم" text="اختر يوماً آخر من شريط الأيام." />
                        ) : availabilityError ? (
                            <div className="rounded-[18px] border bg-white p-5 text-center" style={{ borderColor: '#F3C4C4' }} role="alert">
                                <p className="text-sm font-semibold text-rose-700">{availabilityError}</p>
                                <button type="button" onClick={() => setAvailabilityRetry((value) => value + 1)} className="mt-2 text-sm font-bold underline underline-offset-4">إعادة المحاولة</button>
                            </div>
                        ) : availableSlots.length === 0 ? (
                            <EmptyNote title="لا توجد أوقات متاحة" text={availableBarbers.length > 1 ? 'جرّب يوماً آخر أو حلاقاً آخر.' : 'جرّب يوماً آخر.'} />
                        ) : (
                            <div className="space-y-5">
                                {Object.entries(groupedSlots).map(([period, slots]) => slots.length > 0 && (
                                    <div key={period}>
                                        <p className="mb-2 text-sm font-semibold" style={{ color: INK.muted }}>{period}</p>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                            {slots.map((time) => {
                                                const isSelected = selectedTime === time;
                                                return (
                                                    <button key={time} type="button" aria-pressed={isSelected}
                                                        onClick={() => { setSelectedTime(time); setBookingError(''); setBookingErrorField(''); }}
                                                        className="flex h-14 flex-col items-center justify-center rounded-[14px] border transition-colors"
                                                        style={isSelected ? { backgroundColor: activeThemeColor, borderColor: activeThemeColor, color: '#fff' } : { backgroundColor: '#fff', borderColor: INK.line }}>
                                                        <span className="text-[17px] font-bold leading-tight" dir="ltr" style={{ fontFamily: DISPLAY_FONT }}>{formatTime12Hour(time)}</span>
                                                        <span className="text-[10px]" style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : INK.muted }}>{getTimePeriod(time)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ─── عن الصالون والتقييمات ─── */}
                    <section className="border-t pt-8" style={{ borderColor: INK.line }}>
                        <h2 className="text-lg font-bold" style={{ fontFamily: DISPLAY_FONT }}>عن {tenantData.salonName}</h2>
                        <p className="mt-2 max-w-[65ch] leading-7" style={{ color: INK.muted }}>
                            {tenantData.bio || 'أهلاً بكم. احجز موعدك واختر الحلاق والوقت المناسب لك.'}
                        </p>
                    </section>

                    {topReviews.length > 0 && (
                        <section>
                            <h2 className="mb-3 text-lg font-bold" style={{ fontFamily: DISPLAY_FONT }}>قالوا عن الصالون</h2>
                            <div className="hide-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                                {topReviews.map((review, idx) => {
                                    const isExpanded = expandedReviewIdx === idx;
                                    return (
                                        <figure key={idx} className="flex w-[260px] shrink-0 snap-start flex-col rounded-[18px] border bg-white p-4" style={{ borderColor: INK.line }}>
                                            <div className="flex gap-0.5 text-[11px] text-amber-500" aria-label={`${review.rating} من 5`}>
                                                {[...Array(review.rating)].map((_, i) => <FaStar key={i} />)}
                                            </div>
                                            <blockquote className={`mt-2 flex-1 text-sm leading-6 ${isExpanded ? '' : 'line-clamp-3'}`}>{review.comment}</blockquote>
                                            <figcaption className="mt-3 flex items-center justify-between text-xs" style={{ color: INK.muted }}>
                                                <span className="font-semibold">{review.customerName || 'عميل'}</span>
                                                {review.comment?.length > 90 && (
                                                    <button type="button" onClick={() => setExpandedReviewIdx(isExpanded ? null : idx)} className="font-bold underline underline-offset-4" style={{ color: INK.ink }}>
                                                        {isExpanded ? 'عرض أقل' : 'اقرأ المزيد'}
                                                    </button>
                                                )}
                                            </figcaption>
                                        </figure>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    <footer className="space-y-2 border-t pt-6 text-center text-xs" style={{ borderColor: INK.line, color: INK.muted }}>
                        <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-semibold" style={{ color: INK.ink }}>
                            <Scissors size={14} /> نظام حجز مِقَص: أنشئ صفحة حجز لصالونك مجاناً
                        </a>
                        <p dir="ltr">برمجة وتطوير حسام احمد © {new Date().getFullYear()}</p>
                    </footer>
                </main>

                {/* ─── تذكرة الحجز: تثبت أسفل الجوال وبجانب المحتوى على الشاشات الكبيرة ─── */}
                <aside className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-6 lg:z-auto lg:px-0 lg:pb-0">
                    <BookingTicket ticket={ticket} accent={activeThemeColor} ready={Boolean(selectedTime)} hasDeposit={hasDeposit} onContinue={openDetails} />
                </aside>
            </div>

            <BookingModal
                isOpen={isModalOpen} onClose={handleCloseModal} tenantData={tenantData}
                selectedTime={selectedTime} selectedChair={selectedChair} selectedDateLabel={longDayLabel(selectedDate)} selectedServices={selectedServices}
                phone={phone} setPhone={setPhone}
                childrenNames={childrenNames} setChildrenNames={setChildrenNames}
                maxConsecutiveSlots={maxConsecutiveSlots} selectedServicesIds={selectedServicesIds}
                totals={totals} isCheckingLoyalty={isCheckingLoyalty} loyaltyVisits={loyaltyVisits}
                savedChildren={savedChildren}
                onRequestSavedNames={
                    loyaltyVisits > 0 && savedChildren.length === 0 && tenantData?.whatsappSettings?.isEnabled
                        ? () => { setMyAppointmentsPhone(phone); setMyAppointmentsMode('names'); setShowMyAppointments(true); }
                        : null
                }
                handleBookingSubmit={handleBookingSubmit} isLoading={isLoading}
                bookingError={bookingError} bookingErrorField={bookingErrorField}
                clearBookingError={() => { setBookingError(''); setBookingErrorField(''); }}
            />

            <BookingSuccess
                info={successInfo}
                salonName={tenantData.salonName}
                locationUrl={tenantData.settings?.locationUrl}
                contactPhone={tenantData.contactPhone}
                themeColor={activeThemeColor}
                onClose={() => setSuccessInfo(null)}
                onManage={() => { setSuccessInfo(null); setShowMyAppointments(true); }}
            />

            {showMyAppointments && (
                <CustomerAppointments
                    tenant={tenantData}
                    initialPhone={myAppointmentsPhone}
                    mode={myAppointmentsMode}
                    onVerified={setCustomerAccess}
                    onClose={() => { setShowMyAppointments(false); setMyAppointmentsPhone(''); setMyAppointmentsMode('appointments'); }}
                />
            )}

            {/* ─── نافذة دفع العربون ─── */}
            <AnimatePresence>
                {showPaymentForm && paymentDetails && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(28,31,34,0.55)] sm:items-center sm:p-4">
                        <Motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                            className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-white p-6 sm:rounded-[24px]">
                            <button type="button" aria-label="إلغاء الدفع" onClick={() => {
                                setShowPaymentForm(false);
                                setIsVerifyingPayment(false);
                                alert('تم إلغاء الدفع، وسيُلغى الموعد المعلّق تلقائياً.');
                                window.location.reload();
                            }} className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: INK.stone }}><X size={18} /></button>
                            <h3 className="text-xl font-bold" style={{ fontFamily: DISPLAY_FONT }}>دفع العربون لتأكيد الموعد</h3>
                            <p className="mt-1 text-sm" style={{ color: INK.muted }}>يُحجز الموعد لك بعد إتمام الدفع، ويُخصم العربون من الحساب في الصالون.</p>
                            <div className="mt-5 flex items-center justify-between rounded-[14px] p-4" style={{ backgroundColor: INK.stone }}>
                                <span className="text-sm font-semibold">المبلغ</span>
                                <span className="text-2xl font-bold" style={{ fontFamily: DISPLAY_FONT }}>{paymentDetails.amount} <span className="text-sm">ر.س</span></span>
                            </div>
                            {isVerifyingPayment ? (
                                <div className="py-8 text-center">
                                    <Motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="mx-auto mb-3 h-9 w-9 rounded-full border-4 border-slate-200" style={{ borderTopColor: activeThemeColor }} />
                                    <p className="font-bold">جاري تحويلك لبوابة الدفع</p>
                                </div>
                            ) : (
                                <button type="button" onClick={handleGoToPayment} className="mt-5 h-14 w-full rounded-[14px] text-lg font-bold text-white" style={{ backgroundColor: activeThemeColor }}>
                                    الانتقال للدفع عبر {paymentDetails.provider === 'moyasar' ? 'ميسر' : 'بوابة الدفع'}
                                </button>
                            )}
                            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs" style={{ color: INK.muted }}><Lock size={13} /> دفع آمن عبر بوابة مرخصة</p>
                        </Motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BookingScreen;
