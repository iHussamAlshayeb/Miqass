import React from 'react';

// نفس شبكة أزرار الأوقات أثناء جلبها
const TimeSlotsSkeleton = () => (
    <div className="grid animate-pulse grid-cols-3 gap-2 sm:grid-cols-4" aria-busy="true" aria-label="جاري جلب الأوقات المتاحة">
        {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex h-14 flex-col items-center justify-center gap-1.5 rounded-[14px] border border-[#DCDFD8] bg-white">
                <div className="h-4 w-12 rounded bg-[#DCDFD8]" />
                <div className="h-2 w-8 rounded bg-[#EEF0EC]" />
            </div>
        ))}
    </div>
);

export default TimeSlotsSkeleton;
