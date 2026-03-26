import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalDate, formatTime12Hour, getTimePeriod } from '../utils/helpers';

// 💡 دالة مساعدة لحساب الوقت المتتالي
const getNextTimeSlot = (time, durationMinutes) => {
    if (!time) return null;
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1, hours, minutes + durationMinutes);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
};

// ==========================================
// 💡 مكون بطاقة الولاء (تم تحسينه للشاشات الصغيرة)
// ==========================================
const LoyaltyCard = ({ visits, primaryColor, requiredVisits }) => {
    const currentCycleVisits = visits % requiredVisits;
    const isEligibleForFree = currentCycleVisits === 0 && visits > 0;
    const steps = Array.from({ length: requiredVisits }, (_, i) => i === requiredVisits - 1 ? "🎁" : i + 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="my-4 md:my-6 p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 overflow-hidden shadow-sm"
            style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}20` }}
        >
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4 md:mb-5">
                <h4 className="font-black text-lg md:text-xl flex items-center gap-2" style={{ color: primaryColor }}>
                    <span>👑</span> نظام الولاء
                </h4>
                <span className="text-sm md:text-lg font-bold bg-white px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-sm w-full sm:w-auto text-center" style={{ color: primaryColor }}>
                    {visits} زيارة سابقة
                </span>
            </div>

            {isEligibleForFree ? (
                <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-center border border-emerald-200 shadow-sm">
                    <p className="font-black text-xl md:text-2xl mb-1">🎉 مبروك!</p>
                    <p className="text-base md:text-lg font-bold">حلاقتك اليوم علينا (مجاناً) تقديراً لولائك!</p>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2 md:gap-3 mb-4 overflow-x-auto hide-scrollbar pb-2 pt-1 px-1">
                        {steps.map((step, index) => {
                            const isCompleted = index < currentCycleVisits;
                            return (
                                <div key={index} className="relative shrink-0 flex-1 flex justify-center min-w-[40px]">
                                    <div
                                        className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-lg md:text-xl transition-all duration-500 shadow-sm z-10 relative ${isCompleted
                                            ? 'text-white scale-110'
                                            : step === "🎁" ? 'bg-amber-50 text-amber-500 border-2 border-amber-200' : 'bg-white text-slate-300 border-2 border-slate-200'
                                            }`}
                                        style={isCompleted ? { backgroundColor: primaryColor } : {}}
                                    >
                                        {isCompleted ? '✓' : step}
                                    </div>
                                    {index < requiredVisits - 1 && (
                                        <div
                                            className={`absolute top-1/2 -left-5 md:-left-6 w-full h-1 -translate-y-1/2 transition-colors duration-500 ${isCompleted ? 'bg-current' : 'bg-slate-200'}`}
                                            style={isCompleted ? { backgroundColor: primaryColor, opacity: 0.5 } : {}}
                                        ></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-center text-xs md:text-sm font-bold mt-2" style={{ color: primaryColor, opacity: 0.8 }}>
                        باقي لك {requiredVisits - currentCycleVisits} زيارات وتحصل على حلاقة مجانية!
                    </p>
                </>
            )}
        </motion.div>
    );
};

const KioskScreen = () => {
    const { slug } = useParams();
    const navigate = useNavigate();

    const [tenantData, setTenantData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const [step, setStep] = useState(0);
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [selectedChair, setSelectedChair] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [availableSlots, setAvailableSlots] = useState([]);
    const [isFetchingSlots, setIsFetchingSlots] = useState(false);

    const [selectedServicesIds, setSelectedServicesIds] = useState([]);

    const [loyaltyVisits, setLoyaltyVisits] = useState(null);
    const [isCheckingLoyalty, setIsCheckingLoyalty] = useState(false);
    const [savedChildren, setSavedChildren] = useState([]);

    useEffect(() => {
        const fetchTenant = async () => {
            try {
                const res = await API.get(`/tenants/${slug}`);
                // 💡 التعديل هنا: جلب البيانات وتفكيكها بشكل سليم وفلترة الحلاقين
                const { tenant, barbers, services } = res.data;

                const activeBarbers = barbers ? barbers.filter(b => b.isActive !== false) : [];
                const fullTenantData = { ...tenant, barbers: activeBarbers, services };

                setTenantData(fullTenantData);

                if (activeBarbers.length > 0) {
                    setSelectedChair(activeBarbers[0].name);
                } else {
                    setSelectedChair('');
                }
            } catch (error) {
                console.error('Error fetching tenant:', error);
            } finally {
                setIsLoading(false);
            }
        };
        if (slug) fetchTenant();
    }, [slug]);

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

    const calculateTotals = () => {
        if (!tenantData?.services || tenantData.services.length === 0) return { price: 0, duration: tenantData?.settings?.slotDuration || 30 };

        let totalP = 0;
        let totalD = 0;
        selectedServicesIds.forEach(id => {
            const srv = tenantData.services.find(s => (s._id || s.id) === id);
            if (srv) {
                totalP += srv.price;
                totalD += srv.duration;
            }
        });

        if (selectedServicesIds.length === 0) return { price: 0, duration: tenantData?.settings?.slotDuration || 30 };
        return { price: totalP, duration: totalD };
    };

    const totals = calculateTotals();

    useEffect(() => {
        const fetchSlots = async () => {
            if (step !== 2 || !tenantData || !selectedChair) return;
            setIsFetchingSlots(true);
            try {
                const today = getLocalDate();
                const reqDuration = totals.duration;
                // إضافة متغير t لمنع الكاش (Cache-Busting)
                const res = await API.get(`/appointments/available?tenantId=${tenantData._id}&date=${today}&chair=${selectedChair}&requestedDuration=${reqDuration}&t=${new Date().getTime()}`);
                setAvailableSlots(res.data.availableSlots);
            } catch (error) {
                console.error(error);
            } finally {
                setIsFetchingSlots(false);
            }
        };
        fetchSlots();
    }, [step, selectedChair, tenantData, selectedServicesIds, totals.duration]);

    useEffect(() => {
        let timeout;
        if (step > 0 && step < 3) {
            timeout = setTimeout(() => {
                resetKiosk();
            }, 90000);
        }
        return () => clearTimeout(timeout);
    }, [step, phone, name, selectedChair, selectedServicesIds]);

    const resetKiosk = () => {
        setStep(0);
        setPhone('');
        setName('');
        setSelectedTime('');
        setSelectedServicesIds([]);
        setLoyaltyVisits(null);
        setSavedChildren([]);
    };

    const handleBooking = async () => {
        setIsLoading(true);
        try {
            const fullSelectedServices = selectedServicesIds.map(id => tenantData.services.find(s => (s._id || s.id) === id)).filter(Boolean);

            await API.post('/appointments/book', {
                tenantId: tenantData._id,
                date: getLocalDate(),
                timeSlot: selectedTime,
                customerPhone: phone,
                childrenNames: [name],
                chair: selectedChair,
                selectedServices: fullSelectedServices
            });
            setStep(3);
            setTimeout(() => {
                resetKiosk();
            }, 5000);
        } catch (error) {
            alert(error.response?.data?.message || 'حدث خطأ، يرجى المحاولة.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && !tenantData) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-arabic text-xl md:text-2xl">جاري التحضير... ⏳</div>;
    }

    const primaryColor = tenantData?.branding?.primaryColor || '#2563eb';

    return (
        <div className="min-h-screen bg-slate-50 font-arabic text-right flex flex-col justify-center items-center p-4 md:p-6 selection:bg-slate-200" dir="rtl">

            <button onDoubleClick={() => navigate(-1)} className="fixed top-4 left-4 w-12 h-12 rounded-full opacity-0 hover:opacity-10 transition-opacity bg-black z-50"></button>

            <AnimatePresence mode="wait">
                {step === 0 && (
                    <motion.div key="step0" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -50 }} className="text-center cursor-pointer w-full h-full flex flex-col items-center justify-center min-h-[80vh]" onClick={() => setStep(1)}>
                        <motion.img animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} src={tenantData.branding?.logoUrl || '/default-logo.png'} alt="Logo" className="h-32 w-32 md:h-40 md:w-40 object-contain drop-shadow-2xl mb-8 md:mb-12" />
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-slate-800 mb-4 md:mb-6 tracking-tight px-4">أهلاً بك في {tenantData.salonName}</h1>
                        <p className="text-lg md:text-2xl lg:text-3xl font-bold text-slate-500 mb-10 md:mb-16 px-4">سجل حضورك الآن لجمع النقاط وحجز دورك</p>
                        <button className="text-xl md:text-3xl lg:text-4xl font-black text-white px-10 py-4 md:px-16 md:py-6 rounded-full md:rounded-[35px] shadow-2xl transition-transform active:scale-95 animate-pulse w-[90%] sm:w-auto" style={{ backgroundColor: primaryColor, boxShadow: `0 20px 40px ${primaryColor}50` }}>
                            اضغط هنا للبدء 👈
                        </button>
                    </motion.div>
                )}

                {step === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-2xl bg-white p-6 md:p-10 lg:p-16 rounded-3xl md:rounded-[40px] shadow-2xl border border-slate-100 mt-8 md:mt-0">
                        <div className="flex justify-between items-center mb-6 md:mb-10">
                            <h2 className="text-2xl md:text-3xl font-black text-slate-800">بياناتك للولاء 🎁</h2>
                            <button onClick={resetKiosk} className="text-slate-400 hover:text-red-500 text-base md:text-xl font-bold bg-slate-100 px-3 md:px-4 py-1.5 md:py-2 rounded-xl md:rounded-2xl transition-colors">إلغاء</button>
                        </div>

                        <div className="space-y-4 md:space-y-6">
                            <div>
                                <label className="block text-sm md:text-xl font-bold text-slate-500 mb-2 md:mb-4">رقم الجوال (لجمع النقاط)</label>
                                <input type="tel" autoFocus placeholder="05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 md:p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl md:rounded-3xl text-xl md:text-3xl font-black text-center outline-none focus:bg-white transition-all focus:ring-4" style={{ '--tw-ring-color': `${primaryColor}40`, borderColor: phone.length === 10 ? primaryColor : undefined }} dir="ltr" />
                            </div>

                            <AnimatePresence>
                                {tenantData?.settings?.isLoyaltyEnabled && isCheckingLoyalty && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-center text-sm md:text-xl text-slate-400 font-bold py-2 md:py-4">
                                        جاري التحقق من الولاء... ⏳
                                    </motion.div>
                                )}
                                {tenantData?.settings?.isLoyaltyEnabled && loyaltyVisits !== null && !isCheckingLoyalty && (
                                    <LoyaltyCard visits={loyaltyVisits} primaryColor={primaryColor} requiredVisits={tenantData.settings?.loyaltyVisitsRequired || 5} />
                                )}
                            </AnimatePresence>

                            <div className="relative">
                                <label className="block text-sm md:text-xl font-bold text-slate-500 mb-2 md:mb-4">الاسم الكريم (أو اسم الطفل)</label>
                                <input type="text" placeholder="مثال: محمد" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 md:p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl md:rounded-3xl text-xl md:text-3xl font-black text-center outline-none focus:bg-white transition-all focus:ring-4" style={{ '--tw-ring-color': `${primaryColor}40`, borderColor: name.length > 2 ? primaryColor : undefined }} />

                                <AnimatePresence>
                                    {savedChildren.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mt-4 md:mt-5 bg-slate-50 p-4 rounded-2xl border border-slate-100"
                                        >
                                            <p className="text-xs md:text-sm font-bold text-slate-400 mb-3">أو اختر من الأسماء المسجلة مسبقاً:</p>
                                            <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
                                                {savedChildren.map((childName, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setName(childName)}
                                                        className={`px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-sm md:text-lg font-black transition-all active:scale-95 shadow-sm border-2 
                                                            ${name === childName ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100'}`}
                                                        style={name === childName ? { backgroundColor: primaryColor } : {}}
                                                    >
                                                        {childName}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button onClick={() => setStep(2)} disabled={phone.length !== 10 || name.length < 2} className="w-full py-4 md:py-6 text-white rounded-2xl md:rounded-3xl text-xl md:text-3xl font-black transition-all disabled:opacity-50 disabled:scale-100 active:scale-95 mt-4 md:mt-6 shadow-md" style={{ backgroundColor: primaryColor }}>
                                المتابعة لاختيار الوقت ⏰
                            </button>
                        </div>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full max-w-4xl bg-white p-6 md:p-10 rounded-3xl md:rounded-[40px] shadow-2xl border border-slate-100 max-h-[95vh] md:max-h-[90vh] overflow-y-auto hide-scrollbar mt-4 md:mt-0">
                        <div className="flex justify-between items-center mb-6 md:mb-8 pb-4 md:pb-6 border-b border-slate-100 sticky top-0 bg-white z-10">
                            <div>
                                <h2 className="text-xl md:text-3xl font-black text-slate-800 mb-1 md:mb-2">تأكيد الموعد ⏳</h2>
                                <p className="text-xs md:text-lg font-bold text-slate-400">اختر الخدمات والحلاق المناسب</p>
                            </div>
                            <button onClick={() => setStep(1)} className="text-slate-500 bg-slate-100 px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl font-bold text-sm md:text-xl transition-colors hover:bg-slate-200">رجوع</button>
                        </div>

                        {tenantData?.services && tenantData.services.length > 0 && (
                            <div className="mb-6 md:mb-10">
                                <h3 className="text-lg md:text-2xl font-black text-slate-800 mb-3 md:mb-4">اختر الخدمات:</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                                    {tenantData.services.map(srv => {
                                        const srvId = srv._id || srv.id; // التوافق مع MongoDB
                                        const isSelected = selectedServicesIds.includes(srvId);
                                        return (
                                            <div
                                                key={srvId}
                                                onClick={() => {
                                                    if (isSelected) setSelectedServicesIds(selectedServicesIds.filter(id => id !== srvId));
                                                    else setSelectedServicesIds([...selectedServicesIds, srvId]);
                                                }}
                                                className={`flex justify-between items-center p-3 md:p-5 rounded-2xl md:rounded-3xl cursor-pointer transition-all border-[3px] md:border-4 ${isSelected ? 'shadow-md scale-[1.02]' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}
                                                style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` } : {}}
                                            >
                                                <div className="flex items-center gap-3 md:gap-4">
                                                    <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center border-2 text-sm md:text-xl font-black transition-colors shrink-0 ${isSelected ? 'text-white' : 'border-slate-300 bg-white'}`} style={isSelected ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}>
                                                        {isSelected && '✓'}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-800 text-sm md:text-xl">{srv.name}</h4>
                                                        <p className="text-[10px] md:text-sm font-bold text-slate-500">⏱️ {srv.duration} دقيقة</p>
                                                    </div>
                                                </div>
                                                <div className="text-left bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl border border-slate-100 shrink-0">
                                                    <span className="font-black text-base md:text-xl text-slate-800">{srv.price}</span>
                                                    <span className="text-[10px] md:text-xs font-bold text-slate-400 mr-1">ر.س</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 💡 التعديل هنا: حماية وعرض أنيق في حال كان الحلاقون في إجازة */}
                        {tenantData?.barbers && tenantData.barbers.length === 0 ? (
                            <div className="bg-red-50 text-red-500 p-8 rounded-[30px] text-center border border-red-100 mb-8 shadow-sm">
                                <span className="text-5xl mb-3 block grayscale opacity-80">🏖️</span>
                                <h3 className="font-black text-xl mb-1">الطاقم في إجازة</h3>
                                <p className="text-sm font-bold opacity-80">نعتذر منك، لا يوجد حلاقين متاحين للحجز في الوقت الحالي.</p>
                            </div>
                        ) : (
                            <div className="flex overflow-x-auto gap-3 md:gap-4 mb-6 md:mb-10 pb-2 md:pb-4 hide-scrollbar">
                                {tenantData?.barbers.map(barberObj => {
                                    const bName = typeof barberObj === 'string' ? barberObj : barberObj.name;
                                    return (
                                        <button key={bName} onClick={() => setSelectedChair(bName)} className={`shrink-0 flex-1 min-w-[120px] md:min-w-[150px] py-4 md:py-6 rounded-2xl md:rounded-3xl font-black text-lg md:text-2xl transition-all border-2 ${selectedChair === bName ? 'text-white border-transparent shadow-lg' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`} style={selectedChair === bName ? { backgroundColor: primaryColor } : {}}>
                                            ✂️ {bName}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {selectedChair && (
                            <>
                                {isFetchingSlots ? (
                                    <div className="py-12 md:py-20 text-center text-lg md:text-2xl font-black text-slate-400 animate-pulse">جاري فحص المواعيد...</div>
                                ) : availableSlots.length === 0 ? (
                                    <div className="py-10 md:py-20 bg-red-50 rounded-2xl md:rounded-3xl text-center border border-red-100 px-4">
                                        <span className="text-5xl md:text-6xl block mb-3 md:mb-4">😴</span>
                                        <h3 className="text-xl md:text-2xl font-black text-red-600 mb-1 md:mb-2">المواعيد ممتلئة!</h3>
                                        <p className="text-sm md:text-lg text-red-400 font-bold">لا توجد أوقات تتسع للخدمات التي اخترتها. جرب تقليل الخدمات أو اختيار حلاق آخر.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 max-h-[35vh] md:max-h-[40vh] overflow-y-auto pr-2 pb-4 hide-scrollbar">
                                        {availableSlots.map(time => (
                                            <button key={time} onClick={() => setSelectedTime(time)} className={`py-4 md:py-6 rounded-2xl md:rounded-3xl border-2 md:border-4 flex flex-col items-center justify-center gap-1 md:gap-2 transition-all active:scale-95 ${selectedTime === time ? 'text-white border-transparent shadow-xl scale-105' : 'bg-white text-slate-700 border-slate-100 hover:border-slate-300'}`} style={selectedTime === time ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}>
                                                <span className="text-2xl md:text-3xl font-black" dir="ltr">{formatTime12Hour(time)}</span>
                                                <span className={`text-xs md:text-sm font-bold ${selectedTime === time ? 'text-white/80' : 'text-slate-400'}`}>{getTimePeriod(time)}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <button onClick={handleBooking} disabled={!selectedTime || isLoading} className="w-full mt-6 md:mt-10 py-4 md:py-6 text-white rounded-2xl md:rounded-3xl text-xl md:text-3xl font-black transition-all disabled:opacity-50 disabled:scale-100 active:scale-95 shadow-xl" style={{ backgroundColor: primaryColor }}>
                                    {isLoading ? 'جاري التأكيد...' : 'تأكيد الحجز ✨'}
                                </button>
                            </>
                        )}
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div key="step3" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-white p-10 md:p-16 lg:p-24 rounded-3xl md:rounded-[50px] shadow-2xl border border-slate-100 max-w-2xl w-full mx-4">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10, stiffness: 100 }} className="text-7xl md:text-8xl lg:text-9xl mb-6 md:mb-8">
                            ✅
                        </motion.div>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-emerald-600 mb-3 md:mb-4">تم حجز دورك بنجاح!</h2>
                        <p className="text-lg md:text-xl lg:text-2xl font-bold text-slate-500 mb-4">موعدك الساعة <span dir="ltr" className="text-slate-800 font-black">{formatTime12Hour(selectedTime)}</span> {getTimePeriod(selectedTime)}</p>
                        {selectedServicesIds.length > 0 && (
                            <p className="text-base md:text-xl font-bold text-slate-500 mb-6 md:mb-8 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl inline-block">
                                الإجمالي المتوقع: <span className="font-black text-slate-800">{totals.price} ر.س</span>
                            </p>
                        )}
                        <br />
                        <p className="text-sm md:text-lg font-black text-slate-400 bg-slate-50 py-3 md:py-4 px-4 md:px-6 rounded-xl md:rounded-2xl inline-block mt-2 md:mt-4">ستتم إعادتك للشاشة الرئيسية تلقائياً...</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default KioskScreen;