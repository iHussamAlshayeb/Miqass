import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import API from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

// 💡 استيراد الدوال المساعدة للوقت لتوحيد النظام
import { formatTime12Hour, getTimePeriod } from '../utils/helpers';

const LiveQueueScreen = () => {
    const { slug } = useParams();
    const [data, setData] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    // 1. تحديث الساعة كل ثانية
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. تحديث البيانات من السيرفر كل 15 ثانية
    useEffect(() => {
        const fetchQueue = async () => {
            try {
                const res = await API.get(`/appointments/live-queue/${slug}`);
                setData(res.data);
            } catch (error) {
                console.error("Error fetching live queue");
            }
        };

        fetchQueue();
        const interval = setInterval(fetchQueue, 15000);
        return () => clearInterval(interval);
    }, [slug]);

    if (!data) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-arabic text-white p-4 text-center">
                <span className="text-5xl md:text-6xl animate-bounce mb-4">⏳</span>
                <h1 className="text-xl md:text-2xl font-black">جاري تجهيز شاشة الانتظار...</h1>
            </div>
        );
    }

    const { salonName, branding, barbers, appointments } = data;

    // 💡 الألوان الديناميكية
    const brandPrimary = branding?.primaryColor || '#3b82f6';
    const brandSecondary = branding?.secondaryColor || '#64748b';

    // تحويل كائن الوقت (Date) الحالي إلى صيغة نصية (HH:mm)
    const currentHourStr = String(currentTime.getHours()).padStart(2, '0');
    const currentMinStr = String(currentTime.getMinutes()).padStart(2, '0');
    const currentTimeString = `${currentHourStr}:${currentMinStr}`;

    return (
        <div className="min-h-screen bg-slate-950 text-white font-arabic p-4 md:p-8 lg:p-10 flex flex-col selection:bg-none overflow-hidden relative" dir="rtl">

            {/* تأثيرات إضاءة خلفية عامة للشاشة */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] pointer-events-none opacity-20" style={{ backgroundColor: brandPrimary }}></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] pointer-events-none opacity-10" style={{ backgroundColor: brandSecondary }}></div>

            {/* ─── الهيدر (الشعار + اسم الصالون + الساعة) ─── */}
            <header className="flex flex-col xl:flex-row justify-between items-center gap-6 mb-8 md:mb-12 bg-slate-900/60 p-6 lg:p-8 rounded-[30px] md:rounded-[35px] border border-slate-800/80 backdrop-blur-xl shadow-2xl relative z-10">
                <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 text-center sm:text-right">
                    {branding?.logoUrl ? (
                        <div className="bg-white p-2 rounded-3xl shadow-lg shadow-white/5">
                            <img src={branding.logoUrl} alt="Logo" className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-xl rounded-2xl" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-800 rounded-3xl flex items-center justify-center text-3xl md:text-4xl shadow-inner border border-slate-700">✂️</div>
                    )}
                    <div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight">{salonName}</h1>
                        <p className="text-slate-400 font-bold text-sm md:text-lg mt-2 flex items-center justify-center sm:justify-start gap-2">
                            <span className="w-2.5 h-2.5 md:w-3 md:h-3 bg-emerald-500 rounded-full animate-pulse block shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span>
                            شاشة الانتظار المباشرة
                        </p>
                    </div>
                </div>

                {/* الساعة الحية */}
                <div className="text-center sm:text-left bg-slate-950/80 px-6 py-4 md:px-8 md:py-5 rounded-3xl border border-slate-800/50 w-full xl:w-auto shadow-inner">
                    <p className="text-slate-400 font-bold text-xs md:text-sm mb-1 tracking-widest text-center xl:text-right" dir="rtl">
                        تاريخ اليوم: {currentTime.toLocaleDateString('ar-EG')}
                    </p>
                    <div className="flex items-baseline gap-2 justify-center xl:justify-end" dir="ltr">
                        <span className="text-4xl md:text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                            {formatTime12Hour(currentTimeString)}
                        </span>
                        <span className="text-lg md:text-xl font-black text-slate-400">
                            {getTimePeriod(currentTimeString)}
                        </span>
                    </div>
                </div>
            </header>

            {/* ─── شبكة طوابير الحلاقين ─── */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 md:gap-8 relative z-10">
                {barbers.map((barber, index) => {
                    const barberQueue = appointments.filter(app => app.chair === barber);

                    // 💡 التلوين الديناميكي (Primary للزوجي، Secondary للفردي)
                    const chairColor = index % 2 === 0 ? brandPrimary : brandSecondary;

                    return (
                        <motion.div
                            key={barber}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-slate-900/80 rounded-[30px] md:rounded-[40px] border border-slate-800/80 flex flex-col overflow-hidden relative shadow-2xl shadow-black/50 backdrop-blur-sm"
                        >
                            {/* تأثير إضاءة علوي متوهج بلون الكرسي المخصص */}
                            <div className="absolute top-0 left-0 w-full h-1.5 opacity-80" style={{ backgroundImage: `linear-gradient(to right, transparent, ${chairColor}, transparent)` }}></div>

                            {/* توهج خلفي خفيف خلف اسم الحلاق */}
                            <div className="absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 pointer-events-none" style={{ backgroundColor: chairColor }}></div>

                            <div className="bg-slate-900/50 p-5 md:p-6 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between items-center gap-3 text-center sm:text-right relative z-10">
                                <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white flex items-center gap-3">
                                    {/* 💡 أيقونة الكرسي الاحترافية ملونة بلون الثيم */}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                                        className="w-8 h-8 md:w-10 md:h-10 drop-shadow-md" style={{ color: chairColor }}>
                                        <path d="M8 21h8" /><path d="M12 21v-3" /><path d="M9 18h6v-2H9v2z" />
                                        <path d="M7 16h10v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v5z" />
                                        <path d="M4 12h3" /><path d="M17 12h3" /><path d="M12 8V5" />
                                        <path d="M10 5h4v-1a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1z" />
                                    </svg>
                                    {barber}
                                </h2>
                                <span className="font-black px-4 py-2 rounded-xl text-sm md:text-base border shadow-sm"
                                    style={{ backgroundColor: `${chairColor}15`, color: chairColor, borderColor: `${chairColor}30` }}>
                                    {barberQueue.length} بالانتظار
                                </span>
                            </div>

                            <div className="p-4 md:p-6 flex-1 flex flex-col gap-3 md:gap-4 overflow-y-auto max-h-[50vh] md:max-h-[65vh] custom-scrollbar relative z-10">
                                <AnimatePresence mode="popLayout">
                                    {barberQueue.length === 0 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-slate-600 mt-6 md:mt-10">
                                            <span className="text-5xl md:text-7xl mb-4 opacity-50 drop-shadow-md">☕</span>
                                            <p className="text-lg md:text-2xl font-black text-slate-500">الكرسي متاح الآن</p>
                                        </motion.div>
                                    ) : (
                                        barberQueue.map((app, i) => {
                                            const isNext = i === 0;

                                            return (
                                                <motion.div
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, x: -50 }}
                                                    key={app._id}
                                                    className={`flex items-center justify-between p-4 md:p-5 rounded-2xl md:rounded-3xl border-2 transition-all duration-500 ${isNext
                                                            ? 'shadow-[0_10px_30px_rgba(0,0,0,0.3)] transform md:scale-[1.02] z-10'
                                                            : 'bg-slate-950/60 border-slate-800/60 hover:bg-slate-800'
                                                        }`}
                                                    // 💡 البطاقة الأولى تضيء بشكل نيون بلون الكرسي المخصص
                                                    style={isNext ? { backgroundColor: chairColor, borderColor: chairColor } : {}}
                                                >
                                                    <div className="flex items-center gap-4 md:gap-5 w-full">
                                                        <div className={`flex flex-col items-center justify-center w-[65px] h-[65px] md:w-[80px] md:h-[80px] shrink-0 rounded-2xl md:rounded-3xl font-black shadow-inner border
                                                            ${isNext ? 'bg-white border-white/20' : 'bg-slate-900 border-slate-700 text-slate-300'}`}
                                                            style={isNext ? { color: chairColor } : {}}>
                                                            <span className="text-xl md:text-2xl" dir="ltr">{formatTime12Hour(app.timeSlot)}</span>
                                                            <span className="text-[10px] md:text-xs font-bold mt-0.5">{getTimePeriod(app.timeSlot)}</span>
                                                        </div>
                                                        <div className="flex-1 overflow-hidden">
                                                            <p className={`text-xl md:text-3xl font-black truncate drop-shadow-sm ${isNext ? 'text-white' : 'text-slate-200'}`}>
                                                                {app.childName}
                                                            </p>
                                                            {isNext && (
                                                                <motion.div
                                                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ repeat: Infinity, duration: 1.5, direction: "reverse" }}
                                                                    className="text-white/90 font-black text-xs md:text-base mt-1 md:mt-1.5 flex items-center gap-1.5">
                                                                    <span className="w-2 h-2 bg-white rounded-full"></span>
                                                                    تفضل بالجلوس
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )
                                        })
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                @media (min-width: 768px) { .custom-scrollbar::-webkit-scrollbar { width: 6px; } }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default LiveQueueScreen;