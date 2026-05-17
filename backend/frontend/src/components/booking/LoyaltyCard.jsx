import React from 'react';
import { motion } from 'framer-motion';

const LoyaltyCard = ({ visits, primaryColor, requiredVisits }) => {
    const currentCycleVisits = visits % requiredVisits;
    const isEligibleForFree = currentCycleVisits === 0 && visits > 0;
    const steps = Array.from({ length: requiredVisits }, (_, i) => i === requiredVisits - 1 ? "🎁" : i + 1);

    // حساب نسبة امتلاء شريط التقدم الخلفي
    const progressPercentage = isEligibleForFree
        ? 100
        : (Math.max(0, currentCycleVisits - 1) / (requiredVisits - 1)) * 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mb-4 p-5 rounded-3xl border border-slate-100 bg-white relative overflow-hidden shadow-sm"
        >
            {/* 💡 تأثير توهج لوني خفيف في الخلفية متوافق مع الثيم */}
            <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none transition-colors duration-500"
                style={{ backgroundColor: primaryColor, opacity: 0.08 }}
            ></div>

            {/* الهيدر */}
            <div className="flex justify-between items-center mb-5 relative z-10">
                <h4 className="font-black text-sm flex items-center gap-1.5 text-slate-800">
                    <span className="text-lg">👑</span> بطاقة الولاء
                </h4>
                <span
                    className="text-[10px] font-black px-2.5 py-1.5 rounded-xl transition-colors duration-500 shadow-sm"
                    style={{ color: primaryColor, backgroundColor: `${primaryColor}15` }}
                >
                    {visits} زيارة سابقة
                </span>
            </div>

            {isEligibleForFree ? (
                /* 💡 حالة الفوز بالهدية (تصميم احترافي وجذاب) */
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-gradient-to-l from-emerald-500 to-emerald-400 text-white p-4 rounded-2xl text-center shadow-[0_8px_20px_rgba(16,185,129,0.25)] relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-20 h-20 bg-white opacity-10 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none"></div>

                    <p className="font-black text-lg mb-1 relative z-10 tracking-tight">🎉 مبروك يا بطل!</p>
                    <p className="text-xs font-bold text-emerald-50 relative z-10 leading-relaxed">
                        حلاقتك اليوم علينا (مجاناً) تقديراً لولائك وثقتك بنا!
                    </p>
                </motion.div>
            ) : (
                /* 💡 حالة التقدم العادية */
                <div className="relative z-10">
                    <div className="relative flex justify-between items-center my-6" dir="rtl">

                        {/* 1. مسار التقدم الرمادي (الخلفية) */}
                        <div className="absolute top-1/2 right-4 left-4 h-1.5 bg-slate-100 -translate-y-1/2 rounded-full z-0"></div>

                        {/* 2. مسار التقدم الملون (الذي يمتلئ) */}
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `calc(${progressPercentage}% - 2rem)` }} // خصم مساحة الأطراف لضبط المحاذاة
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="absolute top-1/2 right-4 h-1.5 -translate-y-1/2 rounded-full z-0 transition-colors duration-500 shadow-sm"
                            style={{ backgroundColor: primaryColor }}
                        ></motion.div>

                        {/* 3. خطوات الولاء (الدوائر) */}
                        {steps.map((step, index) => {
                            const isCompleted = index < currentCycleVisits;
                            const isCurrent = index === currentCycleVisits;
                            const isGift = step === "🎁";

                            return (
                                <div key={index} className="relative z-10 flex flex-col items-center">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border-2 transition-all duration-500
                                            ${isCompleted
                                                ? 'text-white border-transparent shadow-md scale-110'
                                                : isGift
                                                    ? 'bg-white border-dashed border-amber-300 text-amber-500 scale-105'
                                                    : isCurrent
                                                        ? 'bg-white text-slate-600 shadow-sm scale-110'
                                                        : 'bg-white text-slate-300 border-slate-100'
                                            }`}
                                        style={
                                            isCompleted
                                                ? { backgroundColor: primaryColor }
                                                : isCurrent
                                                    ? { borderColor: primaryColor }
                                                    : {}
                                        }
                                    >
                                        {isCompleted && !isGift ? '✓' : step}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-center text-[11px] font-bold mt-4 transition-colors duration-500" style={{ color: primaryColor }}>
                        باقي لك <span className="font-black">{requiredVisits - currentCycleVisits}</span> زيارات وتحصل على حلاقة مجانية! 🎁
                    </p>
                </div>
            )}
        </motion.div>
    );
};

export default LoyaltyCard;