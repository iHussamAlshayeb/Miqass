import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalDate, formatTime12Hour, getTimePeriod } from '../utils/helpers';
import { FaPhone } from "react-icons/fa";

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
// 💡 مكون بطاقة الولاء (تم ترقيته بالكامل)
// ==========================================
const LoyaltyCard = ({ visits, primaryColor, requiredVisits }) => {
    const currentCycleVisits = visits % requiredVisits;
    const isEligibleForFree = currentCycleVisits === 0 && visits > 0;
    const steps = Array.from({ length: requiredVisits }, (_, i) => i === requiredVisits - 1 ? "🎁" : i + 1);

    const progressPercentage = isEligibleForFree
        ? 100
        : (Math.max(0, currentCycleVisits - 1) / (requiredVisits - 1)) * 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="my-4 md:my-6 p-5 md:p-6 rounded-3xl border border-slate-100 bg-white relative overflow-hidden shadow-sm"
        >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none transition-colors duration-500" style={{ backgroundColor: primaryColor, opacity: 0.08 }}></div>

            <div className="flex justify-between items-center mb-5 relative z-10">
                <h4 className="font-black text-sm md:text-lg flex items-center gap-1.5 text-slate-800">
                    <span className="text-lg md:text-xl">👑</span> بطاقة الولاء
                </h4>
                <span className="text-[10px] md:text-xs font-black px-3 py-1.5 rounded-xl transition-colors duration-500 shadow-sm" style={{ color: primaryColor, backgroundColor: `${primaryColor}15` }}>
                    {visits} زيارة سابقة
                </span>
            </div>

            {isEligibleForFree ? (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="bg-gradient-to-l from-emerald-500 to-emerald-400 text-white p-4 md:p-5 rounded-2xl text-center shadow-[0_8px_20px_rgba(16,185,129,0.25)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                    <p className="font-black text-lg md:text-xl mb-1 relative z-10 tracking-tight">🎉 مبروك يا بطل!</p>
                    <p className="text-xs md:text-sm font-bold text-emerald-50 relative z-10 leading-relaxed">
                        حلاقتك اليوم علينا (مجاناً) تقديراً لولائك وثقتك بنا!
                    </p>
                </motion.div>
            ) : (
                <div className="relative z-10">
                    <div className="relative flex justify-between items-center my-6" dir="rtl">
                        <div className="absolute top-1/2 right-4 left-4 h-1.5 bg-slate-100 -translate-y-1/2 rounded-full z-0"></div>
                        <motion.div initial={{ width: 0 }} animate={{ width: `calc(${progressPercentage}% - 2rem)` }} transition={{ duration: 1, ease: "easeOut" }}
                            className="absolute top-1/2 right-4 h-1.5 -translate-y-1/2 rounded-full z-0 transition-colors duration-500 shadow-sm"
                            style={{ backgroundColor: primaryColor }}></motion.div>

                        {steps.map((step, index) => {
                            const isCompleted = index < currentCycleVisits;
                            const isCurrent = index === currentCycleVisits;
                            const isGift = step === "🎁";

                            return (
                                <div key={index} className="relative z-10 flex flex-col items-center">
                                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-sm md:text-base border-2 transition-all duration-500
                                            ${isCompleted ? 'text-white border-transparent shadow-md scale-110' : isGift ? 'bg-white border-dashed border-amber-300 text-amber-500 scale-105' : isCurrent ? 'bg-white text-slate-600 shadow-sm scale-110' : 'bg-white text-slate-300 border-slate-100'}`}
                                        style={isCompleted ? { backgroundColor: primaryColor } : isCurrent ? { borderColor: primaryColor } : {}}>
                                        {isCompleted && !isGift ? '✓' : step}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-center text-[11px] md:text-xs font-bold mt-4 transition-colors duration-500" style={{ color: primaryColor }}>
                        باقي لك <span className="font-black">{requiredVisits - currentCycleVisits}</span> زيارات وتحصل على حلاقة مجانية! 🎁
                    </p>
                </div>
            )}
        </motion.div>
    );
};

// ==========================================
// 💡 مكون الـ Kiosk الرئيسي
// ==========================================
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
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-arabic text-xl md:text-2xl animate-pulse">جاري التحضير... ⏳</div>;
    }

    // 💡 الألوان والتلوين الديناميكي (Dynamic Theming)
    const brandPrimary = tenantData?.branding?.primaryColor || '#3b82f6';
    const brandSecondary = tenantData?.branding?.secondaryColor || '#64748b';
    const activeBarberIndex = Math.max(0, tenantData?.barbers?.findIndex(b => (b.name || b) === selectedChair) || 0);
    // نستخدم اللون الديناميكي فقط في الخطوة 2 و 3 بعد تحديد الحلاق
    const activeThemeColor = step >= 2 && selectedChair ? (activeBarberIndex % 2 === 0 ? brandPrimary : brandSecondary) : brandPrimary;

    return (
        <div className="min-h-screen bg-slate-50 font-arabic text-right flex flex-col justify-center items-center p-4 md:p-6 selection:bg-slate-200" dir="rtl">

            {/* زر خفي للرجوع في حالة الطوارئ */}
            <button onDoubleClick={() => navigate(-1)} className="fixed top-4 left-4 w-12 h-12 rounded-full opacity-0 hover:opacity-10 transition-opacity bg-black z-50"></button>

            <AnimatePresence mode="wait">
                {/* ─── الخطوة 0: الترحيب ─── */}
                {step === 0 && (
                    <motion.div key="step0" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -50 }} className="text-center cursor-pointer w-full h-full flex flex-col items-center justify-center min-h-[80vh]" onClick={() => setStep(1)}>
                        <motion.div className="relative mb-8 md:mb-12">
                            <div className="absolute inset-0 blur-3xl opacity-20 rounded-full" style={{ backgroundColor: brandPrimary }}></div>
                            <motion.img animate={{ y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} src={tenantData.branding?.logoUrl || '/default-logo.png'} alt="Logo" className="h-40 w-40 md:h-48 md:w-48 object-cover rounded-[2rem] border-2 border-white shadow-xl relative z-10 bg-white" />
                        </motion.div>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-slate-800 mb-4 md:mb-6 tracking-tight px-4">أهلاً بك في {tenantData.salonName}</h1>
                        <p className="text-lg md:text-2xl lg:text-3xl font-bold text-slate-500 mb-10 md:mb-16 px-4">سجل حضورك الآن لجمع النقاط وحجز دورك</p>
                        <button className="text-xl md:text-3xl lg:text-4xl font-black text-white px-10 py-4 md:px-16 md:py-6 rounded-full md:rounded-[35px] shadow-2xl transition-transform active:scale-95 animate-pulse w-[90%] sm:w-auto" style={{ backgroundColor: brandPrimary, boxShadow: `0 20px 40px ${brandPrimary}50` }}>
                            اضغط هنا للبدء 👈
                        </button>
                    </motion.div>
                )}

                {/* ─── الخطوة 1: البيانات الشخصية والولاء ─── */}
                {step === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-2xl bg-white p-6 md:p-10 lg:p-16 rounded-3xl md:rounded-[40px] shadow-2xl border border-slate-100 mt-8 md:mt-0 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none transition-colors duration-500" style={{ backgroundColor: brandPrimary, opacity: 0.05 }}></div>

                        <div className="flex justify-between items-center mb-6 md:mb-10 relative z-10">
                            <h2 className="text-2xl md:text-3xl font-black text-slate-800">بياناتك الشخصية 📱</h2>
                            <button onClick={resetKiosk} className="text-slate-400 hover:text-red-500 text-base md:text-xl font-bold bg-slate-100 px-4 py-2 rounded-xl transition-colors active:scale-95">إلغاء</button>
                        </div>

                        <div className="space-y-6 relative z-10">
                            <div>
                                <label className="block text-sm md:text-xl font-bold text-slate-500 mb-2 md:mb-4">رقم الجوال (لجمع النقاط والتأكيد)</label>
                                <input type="tel" autoFocus placeholder="05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 md:p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl md:rounded-3xl text-xl md:text-3xl font-black text-center outline-none focus:bg-white transition-all focus:ring-4" style={{ '--tw-ring-color': `${brandPrimary}40`, borderColor: phone.length === 10 ? brandPrimary : undefined }} dir="ltr" />
                            </div>

                            <AnimatePresence>
                                {tenantData?.settings?.isLoyaltyEnabled && isCheckingLoyalty && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-center text-sm md:text-xl text-slate-400 font-bold py-2 md:py-4">
                                        جاري التحقق من الولاء... ⏳
                                    </motion.div>
                                )}
                                {tenantData?.settings?.isLoyaltyEnabled && loyaltyVisits !== null && !isCheckingLoyalty && (
                                    <LoyaltyCard visits={loyaltyVisits} primaryColor={brandPrimary} requiredVisits={tenantData.settings?.loyaltyVisitsRequired || 5} />
                                )}
                            </AnimatePresence>

                            <div className="relative border-t border-slate-100 pt-6">
                                <label className="block text-sm md:text-xl font-bold text-slate-500 mb-2 md:mb-4">الاسم الكريم (أو اسم الطفل)</label>
                                <input type="text" placeholder="مثال: محمد" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 md:p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl md:rounded-3xl text-xl md:text-3xl font-black text-center outline-none focus:bg-white transition-all focus:ring-4" style={{ '--tw-ring-color': `${brandPrimary}40`, borderColor: name.length > 2 ? brandPrimary : undefined }} />

                                <AnimatePresence>
                                    {savedChildren.length > 0 && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="mt-4 md:mt-6 bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                                            <p className="text-xs md:text-sm font-bold text-slate-400 mb-3">اختر من الأسماء المسجلة مسبقاً:</p>
                                            <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
                                                {savedChildren.map((childName, idx) => (
                                                    <button key={idx} onClick={() => setName(childName)}
                                                        className={`px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl text-sm md:text-lg font-black transition-all active:scale-95 shadow-sm border-2 
                                                            ${name === childName ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                                                        style={name === childName ? { backgroundColor: brandPrimary } : {}}>
                                                        {name === childName ? `✓ ${childName}` : childName}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button onClick={() => setStep(2)} disabled={phone.length !== 10 || name.length < 2} className="w-full py-4 md:py-6 text-white rounded-2xl md:rounded-3xl text-xl md:text-2xl font-black transition-all disabled:opacity-50 disabled:scale-100 active:scale-95 mt-4 md:mt-8 shadow-xl flex justify-center items-center gap-2" style={{ backgroundColor: brandPrimary, boxShadow: `0 10px 25px ${brandPrimary}40` }}>
                                المتابعة لاختيار الخدمة ✂️
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ─── الخطوة 2: الخدمات، الحلاقين، الوقت ─── */}
                {step === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full max-w-4xl bg-white p-6 md:p-10 rounded-3xl md:rounded-[40px] shadow-2xl border border-slate-100 max-h-[95vh] overflow-y-auto hide-scrollbar mt-4 md:mt-0 relative">
                        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none transition-colors duration-700" style={{ backgroundColor: activeThemeColor, opacity: 0.05 }}></div>

                        <div className="flex justify-between items-center mb-6 md:mb-10 pb-4 md:pb-6 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-20">
                            <div>
                                <h2 className="text-xl md:text-3xl font-black text-slate-800 mb-1 md:mb-2 transition-colors duration-500">تأكيد الموعد ⏳</h2>
                                <p className="text-xs md:text-sm font-bold text-slate-400">اختر الخدمات، الحلاق المناسب، والوقت</p>
                            </div>
                            <button onClick={() => setStep(1)} className="text-slate-500 bg-slate-100 px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl font-bold text-sm md:text-lg transition-colors hover:bg-slate-200 active:scale-95">رجوع</button>
                        </div>

                        <div className="space-y-8 md:space-y-12 relative z-10">

                            {/* 💡 1. الحلاقين (طاقم العمل) - بالتصميم المطور والتلوين الديناميكي */}
                            {tenantData.barbers && tenantData.barbers.length > 0 && (
                                <section>
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <h3 className="text-lg md:text-2xl font-black text-slate-800">1. اختر الحلاق:</h3>
                                    </div>
                                    <div className={`flex overflow-x-auto hide-scrollbar gap-4 pb-4 px-1 snap-x ${tenantData.barbers.length <= 3 ? 'justify-center' : 'justify-start -mx-1'}`}>
                                        {tenantData.barbers.map((barberObj, index) => {
                                            const bName = typeof barberObj === 'string' ? barberObj : barberObj.name;
                                            const isSelected = selectedChair === bName;
                                            const count = tenantData.barbers.length;
                                            const chairColor = index % 2 === 0 ? brandPrimary : brandSecondary;

                                            let avatarClass = "w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-3xl";
                                            let textClass = "text-sm md:text-base";
                                            let checkSize = "w-6 h-6 md:w-8 md:h-8 text-xs md:text-sm";

                                            if (count === 1) {
                                                avatarClass = "w-32 h-32 md:w-40 md:h-40 rounded-[2rem] md:rounded-[3rem]";
                                                textClass = "text-xl md:text-2xl mt-1";
                                                checkSize = "w-10 h-10 md:w-12 md:h-12 text-lg md:text-xl border-[3px]";
                                            } else if (count === 2) {
                                                avatarClass = "w-28 h-28 md:w-32 md:h-32 rounded-3xl md:rounded-[2.5rem]";
                                                textClass = "text-lg md:text-xl mt-1";
                                                checkSize = "w-8 h-8 md:w-10 md:h-10 text-base md:text-lg border-2";
                                            }

                                            return (
                                                <button key={bName} onClick={() => setSelectedChair(bName)} className="relative flex-shrink-0 flex flex-col items-center gap-2 md:gap-3 group snap-center outline-none">
                                                    <div className={`relative flex items-center justify-center border-2 md:border-[3px] transition-all duration-300
                                                        ${avatarClass}
                                                        ${isSelected ? 'border-transparent shadow-[0_10px_30px_rgba(0,0,0,0.15)] scale-105' : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'}`}
                                                        style={isSelected ? { backgroundColor: chairColor } : {}}>

                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                                                            className={`transition-all duration-300 ${count === 1 ? 'w-16 h-16 md:w-20 md:h-20' : count === 2 ? 'w-12 h-12 md:w-14 md:h-14' : 'w-10 h-10 md:w-12 md:h-12'} 
                                                            ${isSelected ? 'text-white scale-110' : 'opacity-50 scale-100 group-hover:opacity-100 group-hover:scale-105'}`}
                                                            style={!isSelected ? { color: chairColor } : {}}>
                                                            <path d="M8 21h8" /><path d="M12 21v-3" /><path d="M9 18h6v-2H9v2z" />
                                                            <path d="M7 16h10v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v5z" />
                                                            <path d="M4 12h3" /><path d="M17 12h3" /><path d="M12 8V5" />
                                                            <path d="M10 5h4v-1a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1z" />
                                                        </svg>

                                                        {isSelected && (
                                                            <motion.div layoutId="barberCheckKiosk" className={`absolute -bottom-2 -left-2 ${checkSize} rounded-full bg-white shadow-lg flex items-center justify-center font-black border-white`} style={{ color: chairColor }}>✓</motion.div>
                                                        )}
                                                    </div>
                                                    <span className={`font-black transition-colors duration-300 ${textClass} ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>{bName}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {/* 💡 2. الخدمات المطلوبة */}
                            {tenantData?.services && tenantData.services.length > 0 && (
                                <section>
                                    <h3 className="text-lg md:text-2xl font-black text-slate-800 mb-4 px-1">2. اختر الخدمات:</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                                        {tenantData.services.map(srv => {
                                            const srvId = srv._id || srv.id;
                                            const isSelected = selectedServicesIds.includes(srvId);
                                            return (
                                                <button key={srvId} type="button"
                                                    onClick={() => {
                                                        if (isSelected) setSelectedServicesIds(selectedServicesIds.filter(id => id !== srvId));
                                                        else setSelectedServicesIds([...selectedServicesIds, srvId]);
                                                    }}
                                                    className={`w-full flex justify-between items-center p-4 md:p-5 rounded-2xl md:rounded-3xl cursor-pointer transition-all duration-300 border-[3px] md:border-4 ${isSelected ? 'shadow-md scale-[1.02]' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}
                                                    style={isSelected ? { borderColor: activeThemeColor, backgroundColor: `${activeThemeColor}08` } : {}}>
                                                    <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                                                        <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center border-2 text-sm md:text-xl font-black transition-colors duration-300 shrink-0 ${isSelected ? 'text-white' : 'border-slate-300 bg-white'}`} style={isSelected ? { backgroundColor: activeThemeColor, borderColor: activeThemeColor } : {}}>
                                                            {isSelected && '✓'}
                                                        </div>
                                                        <div className="text-right min-w-0">
                                                            <h4 className="font-black text-slate-800 text-sm md:text-xl truncate">{srv.name}</h4>
                                                            <p className="text-[10px] md:text-sm font-bold text-slate-500">⏱️ {srv.duration} دقيقة</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-left bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl border border-slate-100 shrink-0">
                                                        <span className="font-black text-base md:text-xl text-slate-800">{srv.price}</span>
                                                        <span className="text-[10px] md:text-xs font-bold text-slate-400 mr-1">ر.س</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {/* 💡 3. الأوقات المتاحة */}
                            {selectedChair && (
                                <section>
                                    <h3 className="text-lg md:text-2xl font-black text-slate-800 mb-4 px-1">3. اختر الوقت:</h3>
                                    {isFetchingSlots ? (
                                        <div className="py-12 md:py-20 text-center text-lg md:text-2xl font-black text-slate-400 animate-pulse">جاري فحص المواعيد...</div>
                                    ) : availableSlots.length === 0 ? (
                                        <div className="py-10 md:py-16 bg-slate-50 rounded-2xl md:rounded-3xl text-center border border-slate-200 px-4">
                                            <span className="text-5xl md:text-6xl block mb-3 md:mb-4 grayscale opacity-60">😴</span>
                                            <h3 className="text-xl md:text-2xl font-black text-slate-600 mb-1 md:mb-2">المواعيد ممتلئة!</h3>
                                            <p className="text-sm md:text-lg text-slate-400 font-bold">لا توجد أوقات تتسع للخدمات التي اخترتها. جرب تقليل الخدمات أو اختيار حلاق آخر.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 md:gap-4 pr-1 pb-4">
                                            <AnimatePresence>
                                                {availableSlots.map(time => (
                                                    <motion.button key={time} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} whileTap={{ scale: 0.95 }}
                                                        onClick={() => setSelectedTime(time)}
                                                        className={`py-4 md:py-6 rounded-2xl md:rounded-3xl border-2 md:border-4 flex flex-col items-center justify-center gap-1 md:gap-2 transition-all duration-300 ${selectedTime === time ? 'text-white border-transparent shadow-xl scale-105' : 'bg-white text-slate-700 border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                                                        style={selectedTime === time ? { backgroundColor: activeThemeColor, borderColor: activeThemeColor } : {}}>
                                                        <span className="text-xl md:text-2xl font-black" dir="ltr">{formatTime12Hour(time)}</span>
                                                        <span className={`text-[10px] md:text-xs font-bold transition-colors duration-300 ${selectedTime === time ? 'text-white/90' : 'text-slate-400'}`}>{getTimePeriod(time)}</span>
                                                    </motion.button>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* 💡 زر التأكيد النهائي */}
                            {selectedChair && (
                                <div className="pt-4 md:pt-6 border-t border-slate-100">
                                    <button onClick={handleBooking} disabled={!selectedTime || isLoading}
                                        className="w-full py-5 md:py-6 text-white rounded-2xl md:rounded-3xl text-xl md:text-2xl font-black transition-all duration-500 disabled:opacity-50 disabled:scale-100 active:scale-95 shadow-xl flex justify-center items-center gap-2"
                                        style={{ backgroundColor: activeThemeColor, boxShadow: `0 10px 30px ${activeThemeColor}50` }}>
                                        {isLoading ? <span className="animate-pulse">جاري التأكيد...</span> : <>تأكيد الحجز {totals.price > 0 && `(${totals.price} ر.س)`} ✨</>}
                                    </button>
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}

                {/* ─── الخطوة 3: صفحة النجاح ─── */}
                {step === 3 && (
                    <motion.div key="step3" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-white p-10 md:p-16 lg:p-24 rounded-3xl md:rounded-[50px] shadow-2xl border border-slate-100 max-w-2xl w-full mx-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none transition-colors duration-500" style={{ backgroundColor: activeThemeColor, opacity: 0.1 }}></div>

                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10, stiffness: 100 }} className="text-7xl md:text-8xl lg:text-9xl mb-6 md:mb-8 relative z-10">
                            ✅
                        </motion.div>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black mb-3 md:mb-4 relative z-10" style={{ color: activeThemeColor }}>تم حجز دورك بنجاح!</h2>
                        <p className="text-lg md:text-xl lg:text-2xl font-bold text-slate-500 mb-6 md:mb-8 relative z-10">موعدك مع <span className="text-slate-800 font-black">{selectedChair}</span> الساعة <span dir="ltr" className="text-slate-800 font-black">{formatTime12Hour(selectedTime)}</span> {getTimePeriod(selectedTime)}</p>

                        <p className="text-sm md:text-base font-black text-slate-400 bg-slate-50 py-3 md:py-4 px-6 rounded-xl md:rounded-2xl inline-block mt-4 relative z-10 border border-slate-100">ستتم إعادتك للشاشة الرئيسية تلقائياً لخدمة العميل التالي...</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default KioskScreen;