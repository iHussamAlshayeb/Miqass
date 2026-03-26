import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import API from '../services/api';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalDate, formatTime12Hour, getTimePeriod } from '../utils/helpers';
import { FaInstagram, FaTiktok, FaSnapchatGhost, FaPhone, FaStar } from "react-icons/fa";
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

const BookingScreen = () => {
    const { slug } = useParams();

    const [tenantData, setTenantData] = useState(null);
    const [isTenantLoading, setIsTenantLoading] = useState(true);
    const [tenantError, setTenantError] = useState('');
    // لمعرفة أي تقييم تم الضغط عليه ليتمدد
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

    // ==========================================
    // 💳 💡 حالات نافذة الدفع (Moyasar) باستخدام طريقتك
    // ==========================================
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

                if (activeBarbers && activeBarbers.length > 0) {
                    setSelectedChair(activeBarbers[0].name);
                } else {
                    setSelectedChair('');
                }

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
        let totalP = 0;
        let totalD = 0;
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
                        tenantId: tenantData._id,
                        date: selectedDate,
                        chair: selectedChair,
                        requestedDuration: reqDuration,
                        t: new Date().getTime()
                    }
                });

                setAvailableSlots(response.data.availableSlots);
                if (response.data.isClosed) setIsClosed(true);
            } catch (error) {
                console.error('Error fetching slots:', error);
            } finally {
                setIsFetchingSlots(false);
            }
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
                    setLoyaltyVisits(null);
                    setSavedChildren([]);
                } finally {
                    setIsCheckingLoyalty(false);
                }
            } else {
                setLoyaltyVisits(null);
                setSavedChildren([]);
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
                tenantId: tenantData._id,
                date: selectedDate,
                timeSlot: selectedTime,
                customerPhone: phone,
                childrenNames: validNames,
                chair: selectedChair,
                selectedServices: fullSelectedServices
            });

            // 💳 مفترق الطرق: هل الموعد يتطلب دفع عربون؟
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
        } finally {
            setIsLoading(false);
        }
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

    // ==========================================
    // 💳 💡 حقن نموذج ميسر (نفس طريقتك في صفحة الاشتراكات)
    // ==========================================
    useEffect(() => {
        if (showPaymentForm && paymentDetails && window.Moyasar) {
            // تفريغ الحاوية أولاً
            const formContainer = document.querySelector('.mysr-form-booking');
            if (formContainer) formContainer.innerHTML = '';

            window.Moyasar.init({
                element: '.mysr-form-booking',
                amount: paymentDetails.amount * 100, // ميسر يطلب المبلغ بالهللات
                currency: 'SAR',
                description: `عربون حجز موعد - ${tenantData?.salonName}`,
                publishable_api_key: paymentDetails.publishableKey,
                callback_url: window.location.href,
                methods: ['creditcard', 'stcpay'],
                metadata: {
                    appointmentId: paymentDetails.appointmentId,
                    tenantId: paymentDetails.tenantId
                },
                on_completed: function (payment) {
                    return new Promise((resolve, reject) => {
                        if (payment.status === 'initiated') { resolve(); return; }
                        if (payment.status !== 'paid') {
                            alert('تم رفض العملية: ' + (payment.source?.message || 'تأكد من بيانات البطاقة'));
                            reject();
                            return;
                        }

                        // 💡 إظهار أنيميشن "التحقق" بينما يعمل الـ Webhook في الخلفية
                        setIsVerifyingPayment(true);

                        // نعطي الـ Webhook ثواني قليلة لمعالجة الدفع قبل إظهار رسالة النجاح للعميل
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


    if (isTenantLoading) return <BookingSkeleton />;

    if (tenantError) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center font-arabic text-red-500 font-black p-6 text-center">
                <p className="text-6xl mb-4 grayscale opacity-60">✂️</p>
                <p className="text-2xl">{tenantError}</p>
                <p className="text-gray-400 mt-2 text-sm">تأكد من صحة الرابط وحاول مرة أخرى.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-arabic text-right selection:bg-pink-200 overflow-x-hidden relative" dir="rtl">
            <motion.header
                initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
                className="bg-white px-6 pt-8 pb-12 rounded-b-[40px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-b border-gray-100 flex flex-col items-center relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-10 -mt-10" style={{ backgroundColor: tenantData.branding?.secondaryColor || '#cbd5e1', opacity: 0.2 }}></div>
                <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-2xl -ml-10 -mt-10" style={{ backgroundColor: tenantData.branding?.primaryColor || '#3b82f6', opacity: 0.2 }}></div>

                {tenantData.branding?.logoUrl ? (
                    <img src={tenantData.branding.logoUrl} alt="Logo" className="h-20 w-20 object-contain drop-shadow-md relative z-10 mb-3" />
                ) : (
                    <div className="h-20 w-20 bg-slate-800 rounded-3xl flex items-center justify-center text-4xl mb-3 relative z-10">✂️</div>
                )}

                <h1 className="text-2xl font-black text-gray-800 relative z-10 tracking-tight">{tenantData.salonName}</h1>
                <p className="font-bold text-sm mt-1 relative z-10 px-4 py-1 rounded-full text-white" style={{ backgroundColor: tenantData.branding?.secondaryColor || '#1e293b' }}>
                    بإدارة: {tenantData.ownerName} ✨
                </p>
            </motion.header>

            {/* ─── الهوية الرقمية ─── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white mx-6 -mt-8 relative z-20 rounded-[30px] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)] border border-slate-100 text-center"
            >
                <p className="text-slate-500 text-sm font-bold mb-5 leading-relaxed px-2">
                    {tenantData.bio || 'أهلاً بكم في صالوننا! نسعى لتقديم أفضل تجربة حلاقة وعناية بلمسة احترافية. ✂️✨'}
                </p>

                <div className="flex justify-center items-center gap-4 mb-5">
                    {tenantData.socialLinks?.instagram && (
                        <a href={tenantData.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-pink-50 text-pink-500 flex items-center justify-center text-xl hover:scale-110 hover:bg-pink-100 transition-all shadow-sm"><FaInstagram /></a>
                    )}
                    {tenantData.socialLinks?.tiktok && (
                        <a href={tenantData.socialLinks.tiktok} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center text-xl hover:scale-110 hover:bg-black transition-all shadow-sm"><FaTiktok /></a>
                    )}
                    {tenantData.socialLinks?.snapchat && (
                        <a href={tenantData.socialLinks.snapchat} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-yellow-50 text-yellow-500 flex items-center justify-center text-xl hover:scale-110 hover:bg-yellow-100 transition-all shadow-sm"><FaSnapchatGhost /></a>
                    )}
                    {tenantData.phone && (
                        <a href={`tel:${tenantData.phone}`} className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl hover:scale-110 hover:bg-emerald-100 transition-all shadow-sm"><FaPhone /></a>
                    )}
                </div>

                {tenantData.settings?.locationUrl && (
                    <a href={tenantData.settings.locationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-black rounded-2xl transition-colors border border-slate-200 active:scale-95">
                        <span className="text-xl">📍</span> موقع الصالون على الخريطة
                    </a>
                )}
            </motion.div>

            <main className="max-w-md mx-auto px-5 mt-6 pb-32">
                {/* 💡 ─── قسم آراء العملاء ─── */}
                {topReviews.length > 0 && (
                    <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="mb-8 overflow-hidden">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h2 className="text-gray-800 font-black text-lg">آراء عملائنا:</h2>
                            <div className="flex items-center gap-1 text-yellow-500 text-sm font-bold">
                                <FaStar /> <span className="pt-1">تجارب مميزة</span>
                            </div>
                        </div>
                        <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2 pt-1 px-1 -mx-1 snap-x items-start">
                            {topReviews.map((review, idx) => {
                                const isExpanded = expandedReviewIdx === idx;
                                const isLongText = review.comment?.length > 80; // نتحقق إذا كان النص طويلاً

                                return (
                                    <div
                                        key={idx}
                                        className="min-w-[240px] max-w-[240px] bg-white p-4 rounded-3xl shadow-sm border border-gray-100 snap-center flex flex-col justify-between transition-all duration-300 h-max"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-bold text-slate-800 text-sm truncate pr-2">
                                                    {review.customerName || 'عميل سعيد'}
                                                </span>
                                                <div className="flex text-yellow-400 text-xs shrink-0">
                                                    {[...Array(review.rating)].map((_, i) => <FaStar key={i} />)}
                                                </div>
                                            </div>

                                            {/* 💡 هنا السحر: نلغي line-clamp إذا كان الكرت مفتوحاً */}
                                            <p className={`text-slate-500 text-xs leading-relaxed transition-all duration-300 ${!isExpanded ? 'line-clamp-3' : ''}`}>
                                                "{review.comment}"
                                            </p>

                                            {/* 💡 زر قراءة المزيد يظهر فقط للتقييمات الطويلة */}
                                            {isLongText && (
                                                <button
                                                    onClick={() => setExpandedReviewIdx(isExpanded ? null : idx)}
                                                    className="text-[10px] text-blue-500 font-black mt-2 w-full text-right hover:text-blue-700 transition-colors"
                                                >
                                                    {isExpanded ? 'عرض أقل' : 'قراءة المزيد...'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.section>
                )}

                {/* 💡 حالة الطاقم والوقت */}
                {tenantData.barbers && tenantData.barbers.length === 0 ? (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-red-50 text-red-500 p-8 rounded-[30px] text-center border border-red-100 mb-8 shadow-sm">
                        <span className="text-5xl mb-3 block grayscale opacity-80">🏖️</span>
                        <h3 className="font-black text-xl mb-1">الطاقم في إجازة</h3>
                        <p className="text-sm font-bold opacity-80">نعتذر منك، لا يوجد حلاقين متاحين للحجز في الوقت الحالي. يرجى المحاولة لاحقاً.</p>
                    </motion.div>
                ) : (
                    <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.2 }} className="mb-8">
                        <h2 className="text-gray-800 font-black text-lg mb-3 px-1">الطاقم / الكرسي:</h2>
                        <div className="flex overflow-x-auto hide-scrollbar gap-2 bg-white p-2 rounded-3xl shadow-sm border border-gray-100 relative">
                            {tenantData.barbers.map((barberObj) => {
                                const bName = barberObj.name;
                                return (
                                    <button
                                        key={barberObj._id || bName}
                                        onClick={() => setSelectedChair(bName)}
                                        className={`relative flex-1 py-3 px-4 min-w-[100px] rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 z-10 whitespace-nowrap ${selectedChair === bName ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                    >
                                        {selectedChair === bName && (
                                            <motion.div layoutId="activeChairBackground" className="absolute inset-0 rounded-2xl shadow-md" style={{ backgroundColor: tenantData.branding?.primaryColor || '#3b82f6', zIndex: -1 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} />
                                        )}
                                        <span className="text-xl">✂️</span>
                                        <span>{bName}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.section>
                )}

                <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.25 }} className="mb-8">
                    <div className="flex justify-between items-end mb-3 px-1">
                        <h2 className="text-gray-800 font-black text-lg">تاريخ الزيارة:</h2>
                    </div>
                    <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-100 relative">
                        <div className="absolute left-6 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none z-10 text-xl">📅</div>
                        <div className="custom-datepicker-wrapper">
                            <DatePicker
                                selected={new Date(selectedDate)}
                                onChange={(date) => {
                                    const offset = date.getTimezoneOffset() * 60000;
                                    const formattedDate = new Date(date.getTime() - offset).toISOString().split('T')[0];
                                    setSelectedDate(formattedDate);
                                }}
                                minDate={new Date()} maxDate={maxDate} excludeDates={closedDatesList} dateFormat="yyyy-MM-dd"
                                className="w-full py-4 pr-6 pl-12 bg-transparent text-gray-800 font-black text-lg outline-none cursor-pointer text-right appearance-none"
                                placeholderText="اختر اليوم"
                            />
                        </div>
                    </div>
                </motion.section>

                {tenantData?.services && tenantData.services.length > 0 && (
                    <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="mb-8">
                        <div className="flex justify-between items-end mb-3 px-1">
                            <h2 className="text-gray-800 font-black text-lg">الخدمات المطلوبة:</h2>
                        </div>
                        <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-2">
                            {tenantData.services.map(srv => {
                                const srvId = srv._id || srv.id;
                                const isSelected = selectedServicesIds.includes(srvId);
                                return (
                                    <div
                                        key={srvId}
                                        onClick={() => {
                                            if (isSelected) setSelectedServicesIds(selectedServicesIds.filter(id => id !== srvId));
                                            else setSelectedServicesIds([...selectedServicesIds, srvId]);
                                        }}
                                        className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border-2 ${isSelected ? 'bg-blue-50 border-blue-400' : 'bg-transparent border-transparent hover:bg-gray-50'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'border-blue-500 text-white' : 'border-gray-300 bg-white'}`}
                                                style={isSelected ? { backgroundColor: tenantData.branding?.primaryColor || '#3b82f6', borderColor: tenantData.branding?.primaryColor || '#3b82f6' } : {}}
                                            >
                                                {isSelected && '✓'}
                                            </div>
                                            <div>
                                                <h3 className="font-black text-slate-800 text-sm">{srv.name}</h3>
                                                <p className="text-xs font-bold text-slate-400">⏱️ {srv.duration} دقيقة</p>
                                            </div>
                                        </div>
                                        <div className="text-left bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                            <span className="font-black text-slate-800">{srv.price}</span>
                                            <span className="text-[10px] font-bold text-slate-400 mr-1">ر.س</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </motion.section>
                )}

                <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }} className="mb-10">
                    <h2 className="text-gray-800 font-black text-lg mb-4 px-1">الوقت المناسب:</h2>
                    {isFetchingSlots ? (
                        <TimeSlotsSkeleton />
                    ) : isClosed ? (
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-8 rounded-3xl text-center border flex flex-col items-center" style={{ backgroundColor: `${tenantData.branding?.primaryColor || '#3b82f6'}10`, borderColor: `${tenantData.branding?.primaryColor || '#3b82f6'}30` }}>
                            <span className="text-5xl mb-4">🏖️</span>
                            <h3 className="font-black text-lg mb-1" style={{ color: tenantData.branding?.primaryColor || '#3b82f6' }}>الصالون في إجازة</h3>
                            <p className="font-bold text-sm leading-relaxed" style={{ color: tenantData.branding?.primaryColor || '#3b82f6', opacity: 0.8 }}>نراكم في يوم آخر!</p>
                        </motion.div>
                    ) : availableSlots.length === 0 ? (
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gray-50 p-8 rounded-3xl text-center border border-gray-100 flex flex-col items-center">
                            <span className="text-5xl mb-4 grayscale opacity-60">😴</span>
                            <h3 className="text-gray-600 font-black text-lg mb-1">لا توجد أوقات تتسع لخدماتك</h3>
                            <p className="text-gray-400 font-bold text-sm leading-relaxed">الرجاء اختيار يوم آخر، حلاق آخر، أو تقليل الخدمات.</p>
                        </motion.div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <AnimatePresence>
                                {availableSlots.map((time, index) => (
                                    <motion.button
                                        key={time} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2, delay: index * 0.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => { setSelectedTime(time); setIsModalOpen(true); }}
                                        className="py-4 px-3 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-colors flex flex-col items-center justify-center gap-1 group hover:border-gray-300"
                                    >
                                        <span className="font-black text-2xl text-gray-800 transition-colors" dir="ltr">{formatTime12Hour(time)}</span>
                                        <span className="text-xs font-bold text-gray-400 transition-colors">{getTimePeriod(time)}</span>
                                    </motion.button>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </motion.section>

                <footer className="text-center opacity-60">
                    <p className="text-gray-400 font-bold text-xs" dir="ltr">برمجة وتطوير <span className="font-black" style={{ color: tenantData.branding?.primaryColor || '#3b82f6' }}>حسام احمد</span> © {new Date().getFullYear()}</p>
                </footer>
            </main>

            <BookingModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                tenantData={tenantData}
                selectedTime={selectedTime}
                selectedChair={selectedChair}
                phone={phone}
                setPhone={setPhone}
                childrenNames={childrenNames}
                setChildrenNames={setChildrenNames}
                maxConsecutiveSlots={maxConsecutiveSlots}
                selectedServicesIds={selectedServicesIds}
                totals={totals}
                isCheckingLoyalty={isCheckingLoyalty}
                loyaltyVisits={loyaltyVisits}
                savedChildren={savedChildren}
                handleBookingSubmit={handleBookingSubmit}
                isLoading={isLoading}
            />

            {/* ========================================== */}
            {/* 💳 💡 نافذة الدفع الإلكتروني (Moyasar - Vanilla JS) */}
            {/* ========================================== */}
            <AnimatePresence>
                {showPaymentForm && paymentDetails && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 50 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 50 }}
                            className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                        >
                            <button
                                onClick={() => {
                                    setShowPaymentForm(false);
                                    alert("تم إلغاء عملية الدفع. سيتم مسح الموعد المعلق تلقائياً.");
                                    window.location.reload();
                                }}
                                className="absolute top-4 left-4 bg-slate-100 text-slate-500 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center font-bold z-10"
                            >
                                ✕
                            </button>

                            <div className="text-center mb-6 mt-4">
                                <h3 className="text-2xl font-black text-slate-800 mb-2">تأكيد الحجز (عربون)</h3>
                                <p className="text-slate-500 font-bold text-sm">
                                    المبلغ المطلوب: <span className="text-indigo-600 font-black text-lg">{paymentDetails.amount} ر.س</span>
                                </p>
                            </div>

                            {/* الأنيميشن أثناء معالجة الدفع والتحقق */}
                            <AnimatePresence mode="wait">
                                <motion.div key="online" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                                    <div className={isVerifyingPayment ? 'hidden' : 'block'}>
                                        {/* 💡 حاوية ميسر التي سيتم حقن الفورم بداخلها */}
                                        <div className="mysr-form-booking" dir="ltr"></div>
                                    </div>
                                    {isVerifyingPayment && (
                                        <div className="text-center py-10">
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="text-4xl mb-4 inline-block">⏳</motion.div>
                                            <h3 className="font-black text-slate-800 text-lg">جاري التحقق من الدفع وتأكيد الموعد...</h3>
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

            <a href="/" target="_blank" rel="noopener noreferrer" className="fixed bottom-0 left-0 w-full bg-slate-900/95 backdrop-blur-md text-white text-center py-3 text-xs md:text-sm font-bold hover:bg-blue-600 transition-colors z-30 flex items-center justify-center gap-2 border-t border-slate-700 shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
                <span>نظام مِقَص السحابي - أنشئ نظام حجز لصالونك مجاناً</span>
            </a>
        </div>
    );
};

export default BookingScreen;