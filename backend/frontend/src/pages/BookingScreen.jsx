import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import API from '../services/api';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalDate, formatTime12Hour, getTimePeriod } from '../utils/helpers';
import { FaInstagram, FaTiktok, FaSnapchatGhost, FaPhone, FaStar, FaMapMarkerAlt } from "react-icons/fa";
import TimeSlotsSkeleton from '../components/booking/TimeSlotsSkeleton';
import BookingSkeleton from '../components/booking/BookingSkeleton';
import BookingModal from '../components/booking/BookingModal';

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
            day: d.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'short' }),
            num: d.getDate(),
            isClosed: closedSet.has(d.toDateString()),
            isToday: i === 0,
        });
    }
    return out;
};

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
    const [isLoading, setIsLoading] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [childrenNames, setChildrenNames] = useState(['']);
    const [phone, setPhone] = useState('');
    const [selectedChair, setSelectedChair] = useState('');
    const [selectedServicesIds, setSelectedServicesIds] = useState([]);

    const [loyaltyVisits, setLoyaltyVisits] = useState(null);
    const [isCheckingLoyalty, setIsCheckingLoyalty] = useState(false);
    const [savedChildren, setSavedChildren] = useState([]);

    const [topReviews, setTopReviews] = useState([]);

    const [isClosed, setIsClosed] = useState(false);
    const [closedDatesList, setClosedDatesList] = useState([]);
    const [maxDate, setMaxDate] = useState(null);

    const [paymentDetails, setPaymentDetails] = useState(null);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

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
                    const filteredReviews = reviews
                        .filter(r => r.rating >= 4 && r.comment && r.comment.trim() !== '')
                        .slice(0, 5);
                    setTopReviews(filteredReviews);
                }
                if (tenant.settings.maxBookingDate) setMaxDate(new Date(tenant.settings.maxBookingDate));
                if (tenant.settings.closedDates) setClosedDatesList(tenant.settings.closedDates.map(dateStr => new Date(dateStr)));
            } catch (error) {
                setTenantError('عذراً، هذا الصالون غير موجود أو الرابط غير صحيح.');
            } finally {
                setIsTenantLoading(false);
            }
        };
        if (slug) fetchTenant();
    }, [slug]);

    const calculateTotals = () => {
        if (!tenantData?.services || tenantData.services.length === 0) return { price: 0, duration: tenantData?.settings?.slotDuration || 30 };
        let totalP = 0; let totalD = 0;
        selectedServicesIds.forEach(id => {
            const srv = tenantData.services.find(s => s._id === id || s.id === id);
            if (srv) { totalP += srv.price; totalD += srv.duration; }
        });
        if (selectedServicesIds.length === 0) return { price: 0, duration: tenantData?.settings?.slotDuration || 30 };
        return { price: totalP, duration: totalD };
    };
    const totals = calculateTotals();

    useEffect(() => {
        const fetchAvailableSlots = async () => {
            if (!tenantData || !selectedChair) return;
            setIsFetchingSlots(true);
            setIsClosed(false);
            try {
                const reqDuration = totals.duration * childrenNames.filter(n => n.trim() !== '').length || totals.duration;
                const response = await API.get('/appointments/available', {
                    params: {
                        tenantId: tenantData._id, date: selectedDate, chair: selectedChair,
                        requestedDuration: reqDuration, t: new Date().getTime()
                    }
                });
                setAvailableSlots(response.data.availableSlots);
                if (response.data.isClosed) setIsClosed(true);
            } catch (error) { console.error('Error fetching slots:', error); }
            finally { setIsFetchingSlots(false); }
        };
        fetchAvailableSlots();
    }, [selectedDate, selectedChair, tenantData, selectedServicesIds, childrenNames.length]);

    useEffect(() => {
        const checkLoyaltyAndFetchData = async () => {
            if (phone.length === 10 && phone.startsWith('05') && tenantData) {
                setIsCheckingLoyalty(true);
                try {
                    const res = await API.get(`/appointments/loyalty/${tenantData._id}/${phone}`);
                    setLoyaltyVisits(res.data.visits);
                    setSavedChildren(res.data.children || []);
                } catch (error) {
                    setLoyaltyVisits(null); setSavedChildren([]);
                } finally { setIsCheckingLoyalty(false); }
            } else {
                setLoyaltyVisits(null); setSavedChildren([]);
            }
        };
        const timeoutId = setTimeout(() => { checkLoyaltyAndFetchData(); }, 500);
        return () => clearTimeout(timeoutId);
    }, [phone, tenantData]);

    const handleBookingSubmit = async (e) => {
        e.preventDefault();
        const validNames = childrenNames.filter(name => name.trim() !== '');
        if (validNames.length === 0) return alert("الرجاء كتابة اسم واحد على الأقل.");
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
                alert(`تم حجز ${validNames.length} موعد بنجاح! 🎉`);
                handleCloseModal();
                window.location.reload();
            }
        } catch (error) {
            alert(error.response?.data?.message || 'حدث خطأ أثناء الحجز');
        } finally { setIsLoading(false); }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setChildrenNames(['']);
        setSelectedServicesIds([]);
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

    useEffect(() => {
        if (showPaymentForm && paymentDetails && window.Moyasar) {
            const formContainer = document.querySelector('.mysr-form-booking');
            if (formContainer) formContainer.innerHTML = '';
            window.Moyasar.init({
                element: '.mysr-form-booking',
                amount: paymentDetails.amount * 100,
                currency: 'SAR',
                description: `عربون حجز موعد - ${tenantData?.salonName}`,
                publishable_api_key: paymentDetails.publishableKey,
                callback_url: window.location.href,
                methods: ['creditcard', 'stcpay'],
                metadata: { appointmentId: paymentDetails.appointmentId, tenantId: paymentDetails.tenantId },
                on_completed: function (payment) {
                    return new Promise((resolve, reject) => {
                        if (payment.status === 'initiated') { resolve(); return; }
                        if (payment.status !== 'paid') {
                            alert('تم رفض العملية: ' + (payment.source?.message || 'تأكد من بيانات البطاقة'));
                            reject(); return;
                        }
                        setIsVerifyingPayment(true);
                        setTimeout(() => {
                            alert("تم استلام العربون وتأكيد موعدك بنجاح! ستصلك رسالة واتساب قريباً. 🎉");
                            setShowPaymentForm(false);
                            window.location.reload();
                            resolve();
                        }, 3000);
                    });
                }
            });
        }
    }, [showPaymentForm, paymentDetails, tenantData]);

    const groupedSlots = useMemo(() => {
        const groups = { 'صباحاً': [], 'ظهراً': [], 'مساءً': [] };
        availableSlots.forEach(t => {
            const [h] = t.split(':').map(Number);
            if (h < 12) groups['صباحاً'].push(t);
            else if (h < 17) groups['ظهراً'].push(t);
            else groups['مساءً'].push(t);
        });
        return groups;
    }, [availableSlots]);

    const quickDates = useMemo(() => buildQuickDates(maxDate, closedDatesList), [maxDate, closedDatesList]);

    // 💡 الألوان الأساسية والثانوية
    const brandPrimary = tenantData?.branding?.primaryColor || '#3b82f6';
    const brandSecondary = tenantData?.branding?.secondaryColor || '#64748b';

    // 💡 منطق التلوين الديناميكي (Dynamic Theming)
    const activeBarberIndex = Math.max(0, tenantData?.barbers?.findIndex(b => b.name === selectedChair) || 0);
    const activeThemeColor = activeBarberIndex % 2 === 0 ? brandPrimary : brandSecondary;

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

    return (
        <div className="min-h-screen bg-slate-50 font-arabic text-right selection:bg-pink-200 overflow-x-hidden relative pb-32" dir="rtl">

            {/* ─── الهيدر المضغوط ─── */}
            <motion.header
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="bg-white border-b border-slate-100 sticky top-0 z-20 backdrop-blur-md bg-white/90"
            >
                <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
                    {tenantData.branding?.logoUrl ? (
                        <img src={tenantData.branding.logoUrl} alt="Logo" className="h-12 w-12 rounded-2xl object-cover border border-slate-100" />
                    ) : (
                        <div className="h-12 w-12 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl">✂️</div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-black text-slate-900 truncate">{tenantData.salonName}</h1>
                        <p className="text-[11px] font-bold text-slate-400 truncate">بإدارة: {tenantData.ownerName}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {tenantData.settings?.locationUrl && (
                            <a href={tenantData.settings.locationUrl} target="_blank" rel="noopener noreferrer"
                                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition">
                                <FaMapMarkerAlt className="text-sm" />
                            </a>
                        )}
                        {tenantData.phone && (
                            <a href={`tel:${tenantData.phone}`}
                                className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 active:scale-95 transition">
                                <FaPhone className="text-sm" />
                            </a>
                        )}
                    </div>
                </div>
            </motion.header>

            <main className="max-w-md mx-auto px-4 pt-5">

                {/* ─── بطاقة النبذة + روابط التواصل ─── */}
                <motion.section
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm mb-6"
                >
                    <p className="text-slate-600 text-sm font-medium leading-relaxed text-center mb-4">
                        {tenantData.bio || 'أهلاً بكم في صالوننا! نسعى لتقديم أفضل تجربة حلاقة وعناية بلمسة احترافية.'}
                    </p>
                    {(tenantData.socialLinks?.instagram || tenantData.socialLinks?.tiktok || tenantData.socialLinks?.snapchat) && (
                        <div className="flex justify-center gap-2 pt-3 border-t border-slate-100">
                            {tenantData.socialLinks?.instagram && (
                                <a href={tenantData.socialLinks.instagram} target="_blank" rel="noopener noreferrer"
                                    className="w-10 h-10 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center hover:bg-pink-100 active:scale-95 transition"><FaInstagram /></a>
                            )}
                            {tenantData.socialLinks?.tiktok && (
                                <a href={tenantData.socialLinks.tiktok} target="_blank" rel="noopener noreferrer"
                                    className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition"><FaTiktok /></a>
                            )}
                            {tenantData.socialLinks?.snapchat && (
                                <a href={tenantData.socialLinks.snapchat} target="_blank" rel="noopener noreferrer"
                                    className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-500 flex items-center justify-center hover:bg-yellow-100 active:scale-95 transition"><FaSnapchatGhost /></a>
                            )}
                        </div>
                    )}
                </motion.section>

                {/* ─── التقييمات ─── */}
                {topReviews.length > 0 && (
                    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
                        <div className="flex items-center justify-between mb-2.5 px-1">
                            <h2 className="text-slate-900 font-black text-base">تجارب العملاء</h2>
                            <span className="text-xs font-bold text-slate-400">⭐️ {topReviews.length}+</span>
                        </div>
                        <div className="flex overflow-x-auto hide-scrollbar gap-2.5 pb-1 -mx-1 px-1 snap-x snap-mandatory items-stretch">
                            {topReviews.map((review, idx) => {
                                const isExpanded = expandedReviewIdx === idx;
                                const isLongText = review.comment?.length > 70;
                                return (
                                    <div key={idx} className="min-w-[230px] max-w-[230px] bg-white p-4 rounded-2xl border border-slate-100 snap-center flex flex-col">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-slate-800 text-sm truncate pr-1">{review.customerName || 'عميل سعيد'}</span>
                                            <div className="flex text-amber-400 text-[10px] shrink-0 gap-0.5">
                                                {[...Array(review.rating)].map((_, i) => <FaStar key={i} />)}
                                            </div>
                                        </div>
                                        <p className={`text-slate-500 text-xs leading-relaxed ${!isExpanded ? 'line-clamp-3' : ''}`}>"{review.comment}"</p>
                                        {isLongText && (
                                            <button onClick={() => setExpandedReviewIdx(isExpanded ? null : idx)}
                                                className="text-[11px] text-blue-500 font-bold mt-2 self-start active:scale-95 transition">
                                                {isExpanded ? 'عرض أقل' : 'المزيد'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </motion.section>
                )}

                {/* ─── الحلاقين (طاقم العمل) ─── */}
                {tenantData.barbers && tenantData.barbers.length === 0 ? (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-red-50 text-red-500 p-6 rounded-3xl text-center border border-red-100 mb-6">
                        <span className="text-4xl mb-2 block">🏖️</span>
                        <h3 className="font-black text-lg mb-1">الطاقم في إجازة</h3>
                        <p className="text-xs font-bold opacity-80">نعتذر منك، لا يوجد حلاقين متاحين حالياً.</p>
                    </motion.div>
                ) : (
                    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <h2 className="text-slate-900 font-black text-base">اختر الحلاق</h2>
                            <span className="text-xs font-bold text-slate-400">{tenantData.barbers.length} متاحين</span>
                        </div>
                        <div className={`flex overflow-x-auto hide-scrollbar gap-4 pb-2 px-1 snap-x ${tenantData.barbers.length <= 3 ? 'justify-center' : 'justify-start -mx-1'}`}>
                            {tenantData.barbers.map((barberObj, index) => {
                                const bName = barberObj.name;
                                const isSelected = selectedChair === bName;
                                const count = tenantData.barbers.length;

                                const chairColor = index % 2 === 0 ? brandPrimary : brandSecondary;

                                let avatarClass = "w-16 h-16 text-2xl rounded-2xl";
                                let textClass = "text-xs";
                                let checkSize = "w-5 h-5 text-[10px]";

                                if (count === 1) {
                                    avatarClass = "w-28 h-28 text-6xl rounded-[2rem]";
                                    textClass = "text-lg mt-1";
                                    checkSize = "w-8 h-8 text-sm border-2";
                                } else if (count === 2) {
                                    avatarClass = "w-24 h-24 text-5xl rounded-3xl";
                                    textClass = "text-base mt-1";
                                    checkSize = "w-7 h-7 text-xs border-2";
                                } else if (count === 3) {
                                    avatarClass = "w-20 h-20 text-4xl rounded-[1.5rem]";
                                    textClass = "text-sm";
                                    checkSize = "w-6 h-6 text-[10px]";
                                }

                                return (
                                    <button key={barberObj._id || bName} onClick={() => setSelectedChair(bName)}
                                        className="relative flex-shrink-0 flex flex-col items-center gap-2 group snap-center outline-none">

                                        <div className={`relative flex items-center justify-center border-2 transition-all duration-300
                                            ${avatarClass}
                                            ${isSelected ? 'border-transparent shadow-[0_8px_20px_rgba(0,0,0,0.12)] scale-105' : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'}`}
                                            style={isSelected ? { backgroundColor: chairColor } : {}}>

                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                                                className={`transition-all duration-300 ${isSelected ? 'text-white scale-110' : 'opacity-80 scale-100 group-hover:opacity-100 group-hover:scale-105'}`}
                                                style={!isSelected ? { color: chairColor } : {}}
                                                width="1em" height="1em">
                                                <path d="M8 21h8" />
                                                <path d="M12 21v-3" />
                                                <path d="M9 18h6v-2H9v2z" />
                                                <path d="M7 16h10v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v5z" />
                                                <path d="M4 12h3" />
                                                <path d="M17 12h3" />
                                                <path d="M12 8V5" />
                                                <path d="M10 5h4v-1a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1z" />
                                            </svg>

                                            {isSelected && (
                                                <motion.div layoutId="barberCheck"
                                                    className={`absolute -bottom-1 -left-1 ${checkSize} rounded-full bg-white shadow-md flex items-center justify-center font-black border-white`}
                                                    style={{ color: chairColor }}>✓</motion.div>
                                            )}
                                        </div>

                                        <span className={`font-black transition-colors duration-300 ${textClass} ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>{bName}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.section>
                )}

                {/* ─── التاريخ ─── */}
                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-6">
                    <div className="flex justify-between items-center mb-3 px-1">
                        <h2 className="text-slate-900 font-black text-base">تاريخ الزيارة</h2>
                        <div className="custom-datepicker-inline">
                            <DatePicker
                                selected={new Date(selectedDate)}
                                onChange={(date) => {
                                    const offset = date.getTimezoneOffset() * 60000;
                                    const formattedDate = new Date(date.getTime() - offset).toISOString().split('T')[0];
                                    setSelectedDate(formattedDate);
                                }}
                                minDate={new Date()}
                                maxDate={maxDate}
                                excludeDates={closedDatesList}
                                dateFormat="yyyy-MM-dd"
                                withPortal // 💡 هذا السطر يجعل التقويم يفتح كـ Modal في منتصف الشاشة
                                className="text-xs font-black transition-colors duration-300 bg-slate-100 px-3 py-1.5 rounded-lg cursor-pointer text-center w-28 outline-none"
                                style={{ color: activeThemeColor, backgroundColor: `${activeThemeColor}15` }}
                                placeholderText="📅 تقويم"
                            />
                        </div>
                    </div>
                    <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1 -mx-1 px-1 snap-x">
                        {quickDates.map(d => {
                            const isSelected = selectedDate === d.iso;
                            const disabled = d.isClosed;
                            return (
                                <button key={d.iso} onClick={() => !disabled && setSelectedDate(d.iso)} disabled={disabled}
                                    className={`relative flex-shrink-0 w-14 py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all duration-300 snap-start
                                        ${disabled ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed' :
                                            isSelected ? 'border-transparent text-white shadow-md scale-105' :
                                                'bg-white border-slate-100 text-slate-600 active:scale-95'}`}
                                    style={isSelected && !disabled ? { backgroundColor: activeThemeColor } : {}}>
                                    <span className={`text-[10px] font-bold transition-colors duration-300 ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>{d.day}</span>
                                    <span className="text-lg font-black leading-none">{d.num}</span>
                                    {d.isToday && !isSelected && <span className="absolute bottom-1 w-1 h-1 rounded-full transition-colors duration-300" style={{ backgroundColor: activeThemeColor }}></span>}
                                </button>
                            );
                        })}
                    </div>
                </motion.section>

                {/* ─── الخدمات ─── */}
                {tenantData?.services && tenantData.services.length > 0 && (
                    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-6">
                        <div className="flex justify-between items-center mb-3 px-1">
                            <h2 className="text-slate-900 font-black text-base">الخدمات المطلوبة</h2>
                            {servicesCount > 0 && (
                                <span className="text-xs font-black px-2.5 py-1 rounded-lg transition-colors duration-300"
                                    style={{ backgroundColor: `${activeThemeColor}15`, color: activeThemeColor }}>
                                    {servicesCount} مختارة
                                </span>
                            )}
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
                            {tenantData.services.map(srv => {
                                const srvId = srv._id || srv.id;
                                const isSelected = selectedServicesIds.includes(srvId);
                                return (
                                    <button key={srvId} type="button"
                                        onClick={() => {
                                            if (isSelected) setSelectedServicesIds(selectedServicesIds.filter(id => id !== srvId));
                                            else setSelectedServicesIds([...selectedServicesIds, srvId]);
                                        }}
                                        className={`w-full flex justify-between items-center p-4 transition-all duration-300 text-right ${isSelected ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}>
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all duration-300 shrink-0 ${isSelected ? 'text-white' : 'border-slate-200 bg-white'}`}
                                                style={isSelected ? { backgroundColor: activeThemeColor, borderColor: activeThemeColor } : {}}>
                                                {isSelected && <span className="text-xs">✓</span>}
                                            </div>
                                            <div className="text-right min-w-0">
                                                <h3 className="font-black text-slate-900 text-sm truncate">{srv.name}</h3>
                                                <p className="text-[11px] font-bold text-slate-400">⏱️ {srv.duration} دقيقة</p>
                                            </div>
                                        </div>
                                        <div className="text-left bg-slate-50 px-3 py-1.5 rounded-xl shrink-0">
                                            <span className="font-black text-slate-900 text-sm">{srv.price}</span>
                                            <span className="text-[10px] font-bold text-slate-400 mr-1">ر.س</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.section>
                )}

                {/* ─── الأوقات المتاحة ─── */}
                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-8">
                    <h2 className="text-slate-900 font-black text-base mb-3 px-1">الوقت المناسب</h2>
                    {isFetchingSlots ? (
                        <TimeSlotsSkeleton />
                    ) : isClosed ? (
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="p-8 rounded-3xl text-center border flex flex-col items-center transition-colors duration-300"
                            style={{ backgroundColor: `${activeThemeColor}10`, borderColor: `${activeThemeColor}30` }}>
                            <span className="text-5xl mb-3">🏖️</span>
                            <h3 className="font-black text-lg mb-1 transition-colors duration-300" style={{ color: activeThemeColor }}>الصالون في إجازة</h3>
                            <p className="font-bold text-sm transition-colors duration-300" style={{ color: activeThemeColor, opacity: 0.8 }}>نراكم في يوم آخر!</p>
                        </motion.div>
                    ) : availableSlots.length === 0 ? (
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="bg-white p-8 rounded-3xl text-center border border-slate-100 flex flex-col items-center">
                            <span className="text-5xl mb-3 grayscale opacity-60">😴</span>
                            <h3 className="text-slate-700 font-black text-base mb-1">لا توجد أوقات متاحة</h3>
                            <p className="text-slate-400 font-bold text-xs leading-relaxed">جرب يوم آخر، حلاق آخر، أو قلل الخدمات.</p>
                        </motion.div>
                    ) : (
                        <div className="space-y-5">
                            {Object.entries(groupedSlots).map(([period, slots]) => (
                                slots.length > 0 && (
                                    <div key={period}>
                                        <h3 className="text-xs font-black text-slate-400 mb-2 px-1 flex items-center gap-2">
                                            <span className="h-px flex-1 bg-slate-200"></span>
                                            <span>{period}</span>
                                            <span className="h-px flex-1 bg-slate-200"></span>
                                        </h3>
                                        <div className="grid grid-cols-3 gap-2">
                                            <AnimatePresence>
                                                {slots.map((time, index) => (
                                                    <motion.button key={time}
                                                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                                                        transition={{ duration: 0.18, delay: index * 0.03 }} whileTap={{ scale: 0.94 }}
                                                        onClick={() => { setSelectedTime(time); setIsModalOpen(true); }}
                                                        className="py-3 bg-white rounded-2xl border border-slate-100 active:border-slate-300 transition-colors flex flex-col items-center justify-center gap-0.5 hover:border-slate-200">
                                                        <span className="font-black text-base text-slate-900 leading-tight" dir="ltr">{formatTime12Hour(time)}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{getTimePeriod(time)}</span>
                                                    </motion.button>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )
                            ))}
                        </div>
                    )}
                </motion.section>

                <footer className="text-center opacity-60 pb-4">
                    <p className="text-slate-400 font-bold text-xs transition-colors duration-300" dir="ltr">
                        برمجة وتطوير <span className="font-black" style={{ color: activeThemeColor }}>حسام احمد</span> © {new Date().getFullYear()}
                    </p>
                </footer>
            </main>

            {/* ─── شريط ملخص ثابت أسفل الشاشة ─── */}
            <AnimatePresence>
                {servicesCount > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                        className="fixed bottom-10 left-0 right-0 z-30 px-4 pointer-events-none">
                        <div className="max-w-md mx-auto pointer-events-auto">
                            <div className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-100 p-3 flex items-center justify-between gap-3 transition-colors duration-300">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-slate-400">{servicesCount} خدمة · {totals.duration} د</p>
                                    <p className="text-base font-black text-slate-900">
                                        {totals.price} <span className="text-xs font-bold text-slate-400">ر.س</span>
                                    </p>
                                </div>
                                <div className="text-[11px] font-black transition-colors duration-300" style={{ color: activeThemeColor }}>
                                    ↓ اختر وقتك من الأسفل
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <BookingModal
                isOpen={isModalOpen} onClose={handleCloseModal} tenantData={tenantData}
                selectedTime={selectedTime} selectedChair={selectedChair} phone={phone} setPhone={setPhone}
                childrenNames={childrenNames} setChildrenNames={setChildrenNames}
                maxConsecutiveSlots={maxConsecutiveSlots} selectedServicesIds={selectedServicesIds}
                totals={totals} isCheckingLoyalty={isCheckingLoyalty} loyaltyVisits={loyaltyVisits}
                savedChildren={savedChildren} handleBookingSubmit={handleBookingSubmit} isLoading={isLoading}
            />

            {/* ─── نافذة الدفع ─── */}
            <AnimatePresence>
                {showPaymentForm && paymentDetails && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center sm:p-4">
                        <motion.div
                            initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                            className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                            <button onClick={() => {
                                setShowPaymentForm(false);
                                alert("تم إلغاء عملية الدفع. سيتم مسح الموعد المعلق تلقائياً.");
                                window.location.reload();
                            }}
                                className="absolute top-4 left-4 bg-slate-100 text-slate-500 hover:bg-slate-200 w-9 h-9 rounded-full flex items-center justify-center font-bold z-10">✕</button>
                            <div className="text-center mb-6 mt-2">
                                <h3 className="text-2xl font-black text-slate-900 mb-2">تأكيد الحجز (عربون)</h3>
                                <p className="text-slate-500 font-bold text-sm">
                                    المبلغ المطلوب: <span className="font-black text-lg transition-colors duration-300" style={{ color: activeThemeColor }}>{paymentDetails.amount} ر.س</span>
                                </p>
                            </div>
                            <AnimatePresence mode="wait">
                                <motion.div key="online" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                                    <div className={isVerifyingPayment ? 'hidden' : 'block'}>
                                        <div className="mysr-form-booking" dir="ltr"></div>
                                    </div>
                                    {isVerifyingPayment && (
                                        <div className="text-center py-10">
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="text-4xl mb-4 inline-block">⏳</motion.div>
                                            <h3 className="font-black text-slate-900 text-lg">جاري التحقق من الدفع وتأكيد الموعد...</h3>
                                            <p className="text-slate-400 text-xs font-bold mt-2">الرجاء عدم إغلاق هذه الصفحة.</p>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                            <p className="text-center text-[10px] text-slate-400 font-bold mt-4 flex items-center justify-center gap-1">
                                🔒 مدفوعات آمنة ومحمية بالكامل عبر بوابات البنك المركزي
                            </p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <a href="/" target="_blank" rel="noopener noreferrer"
                className="fixed bottom-0 left-0 w-full bg-slate-900/95 backdrop-blur-md text-white text-center py-2.5 text-xs font-bold hover:bg-blue-600 transition-colors z-40 flex items-center justify-center gap-2 border-t border-slate-700">
                <span>نظام مِقَص السحابي - أنشئ نظام حجز لصالونك مجاناً</span>
            </a>
        </div>
    );
};

export default BookingScreen;