import React from 'react';
import { motion } from 'framer-motion';

const LoyaltyCard = ({ visits, primaryColor, requiredVisits }) => {
    const currentCycleVisits = visits % requiredVisits;
    const isEligibleForFree = currentCycleVisits === 0 && visits > 0;
    const steps = Array.from({ length: requiredVisits }, (_, i) => i === requiredVisits - 1 ? "🎁" : i + 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="mb-4 p-4 rounded-2xl border overflow-hidden"
            style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}20` }}
        >
            <div className="flex justify-between items-center mb-3">
                <h4 className="font-black text-sm flex items-center gap-1.5" style={{ color: primaryColor }}>
                    <span>👑</span> بطاقة الولاء
                </h4>
                <span className="text-xs font-bold bg-white px-2.5 py-1 rounded-lg shadow-sm" style={{ color: primaryColor }}>
                    {visits} زيارة سابقة
                </span>
            </div>

            {isEligibleForFree ? (
                <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-center border border-emerald-100 shadow-sm">
                    <p className="font-black text-sm mb-0.5">🎉 مبروك!</p>
                    <p className="text-xs font-bold">حلاقتك اليوم علينا (مجاناً) تقديراً لولائك!</p>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-3 mb-2 overflow-x-auto hide-scrollbar pb-2 pt-1 px-1">
                        {steps.map((step, index) => {
                            const isCompleted = index < currentCycleVisits;
                            return (
                                <div key={index} className="relative shrink-0 flex-1 flex justify-center">
                                    <div
                                        className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-all duration-500 shadow-sm z-10 relative ${isCompleted
                                            ? 'text-white scale-110'
                                            : step === "🎁" ? 'bg-amber-50 text-amber-500 border border-amber-200' : 'bg-white text-gray-300 border border-gray-200'
                                            }`}
                                        style={isCompleted ? { backgroundColor: primaryColor } : {}}
                                    >
                                        {isCompleted ? '✓' : step}
                                    </div>
                                    {index < requiredVisits - 1 && (
                                        <div
                                            className={`absolute top-1/2 -left-4 w-full h-0.5 -translate-y-1/2 transition-colors duration-500 ${isCompleted ? 'bg-current' : 'bg-gray-200'}`}
                                            style={isCompleted ? { backgroundColor: primaryColor, opacity: 0.5 } : {}}
                                        ></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-center text-[10px] font-bold mt-2" style={{ color: primaryColor, opacity: 0.8 }}>
                        باقي لك {requiredVisits - currentCycleVisits} زيارات وتحصل على حلاقة مجانية!
                    </p>
                </>
            )}
        </motion.div>
    );
};

export default LoyaltyCard;