import React from 'react';
import { motion } from 'framer-motion';

const TimeSlotsSkeleton = () => {
    // ننشئ مصفوفة وهمية من 6 عناصر لتمثيل الأوقات
    const skeletonSlots = [1, 2, 3, 4, 5, 6];

    return (
        <div className="grid grid-cols-2 gap-3">
            {skeletonSlots.map((item, index) => (
                <motion.div
                    key={item}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="py-4 px-3 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.01)] flex flex-col items-center justify-center gap-2 h-[84px]"
                >
                    {/* مكان وقت الساعة (نبض غامق قليلاً) */}
                    <div className="h-6 w-16 bg-slate-200 rounded-md animate-pulse"></div>
                    {/* مكان كلمة (صباحاً/مساءً) (نبض فاتح) */}
                    <div className="h-3 w-10 bg-slate-100 rounded-md animate-pulse"></div>
                </motion.div>
            ))}
        </div>
    );
};

export default TimeSlotsSkeleton;