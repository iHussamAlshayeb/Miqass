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

    // تحويل كائن الوقت (Date) الحالي إلى صيغة نصية (HH:mm)
    const currentHourStr = String(currentTime.getHours()).padStart(2, '0');
    const currentMinStr = String(currentTime.getMinutes()).padStart(2, '0');
    const currentTimeString = `${currentHourStr}:${currentMinStr}`;

    return (
        <div className="min-h-screen bg-slate-950 text-white font-arabic p-4 md:p-8 lg:p-10 flex flex-col selection:bg-none" dir="rtl">

            {/* الهيدر (الشعار + اسم الصالون + الساعة) */}
            <header className="flex flex-col xl:flex-row justify-between items-center gap-6 mb-8 md:mb-12 bg-slate-900/50 p-6 lg:p-8 rounded-[30px] md:rounded-[35px] border border-slate-800/50 backdrop-blur-md shadow-2xl">
                <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 text-center sm:text-right">
                    {branding?.logoUrl ? (
                        <img src={branding.logoUrl} alt="Logo" className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-xl" />
                    ) : (
                        <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-800 rounded-3xl flex items-center justify-center text-3xl md:text-4xl">✂️</div>
                    )}
                    <div>
                        <h1 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight">{salonName}</h1>
                        <p className="text-slate-400 font-bold text-sm md:text-lg mt-2 flex items-center justify-center sm:justify-start gap-2">
                            <span className="w-2.5 h-2.5 md:w-3 md:h-3 bg-emerald-500 rounded-full animate-pulse block"></span>
                            شاشة الانتظار المباشرة
                        </p>
                    </div>
                </div>

                {/* الساعة الحية */}
                <div className="text-center sm:text-left bg-slate-950/50 px-6 py-4 md:px-8 md:py-4 rounded-3xl border border-slate-800 w-full xl:w-auto">
                    <p className="text-slate-400 font-bold text-xs md:text-sm mb-1 tracking-widest text-center xl:text-right" dir="rtl">
                        تاريخ اليوم: {currentTime.toLocaleDateString('ar-EG')}
                    </p>
                    <div className="flex items-baseline gap-2 justify-center xl:justify-end" dir="ltr">
                        <span className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-l from-white to-slate-400">
                            {formatTime12Hour(currentTimeString)}
                        </span>
                        <span className="text-lg md:text-xl font-black text-slate-400">
                            {getTimePeriod(currentTimeString)}
                        </span>
                    </div>
                </div>
            </header>

            {/* شبكة طوابير الحلاقين */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 md:gap-8">
                {barbers.map((barber, index) => {
                    const barberQueue = appointments.filter(app => app.chair === barber);

                    return (
                        <motion.div
                            key={barber}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-slate-900 rounded-[30px] md:rounded-[40px] border border-slate-800 flex flex-col overflow-hidden relative shadow-2xl shadow-black/50"
                        >
                            {/* تأثير إضاءة علوي */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>

                            <div className="bg-slate-800/50 p-5 md:p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-center sm:text-right">
                                <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white flex items-center gap-3">
                                    👨‍💈 {barber}
                                </h2>
                                <span className="bg-slate-950 text-slate-300 font-bold px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm border border-slate-800">
                                    {barberQueue.length} بالانتظار
                                </span>
                            </div>

                            <div className="p-4 md:p-6 flex-1 flex flex-col gap-3 md:gap-4 overflow-y-auto max-h-[50vh] md:max-h-[65vh] custom-scrollbar">
                                <AnimatePresence mode="popLayout">
                                    {barberQueue.length === 0 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-60 mt-6 md:mt-10">
                                            <span className="text-5xl md:text-6xl mb-3 md:mb-4 grayscale">☕</span>
                                            <p className="text-lg md:text-xl font-black">الكرسي متاح الآن</p>
                                        </motion.div>
                                    ) : (
                                        barberQueue.map((app, i) => (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, x: -50 }}
                                                key={app._id}
                                                className={`flex items-center justify-between p-4 md:p-5 rounded-2xl md:rounded-3xl border transition-all ${i === 0
                                                    ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-900/50 transform md:scale-[1.02] z-10'
                                                    : 'bg-slate-950/50 border-slate-800'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 md:gap-5 w-full">
                                                    <div className={`flex flex-col items-center justify-center w-[60px] h-[60px] md:w-[75px] md:h-[75px] shrink-0 rounded-xl md:rounded-2xl font-black ${i === 0 ? 'bg-white text-blue-700' : 'bg-slate-800 text-slate-300'}`}>
                                                        <span className="text-lg md:text-2xl" dir="ltr">{formatTime12Hour(app.timeSlot)}</span>
                                                        <span className="text-[9px] md:text-[10px] font-bold mt-0.5">{getTimePeriod(app.timeSlot)}</span>
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className={`text-lg md:text-2xl font-black truncate ${i === 0 ? 'text-white' : 'text-slate-200'}`}>
                                                            {app.childName}
                                                        </p>
                                                        {i === 0 && <p className="text-blue-200 font-bold text-xs md:text-sm mt-0.5 md:mt-1">الدور القادم ⏳</p>}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))
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