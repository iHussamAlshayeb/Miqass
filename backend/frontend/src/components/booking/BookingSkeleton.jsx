import React from 'react';

// هيكل التحميل بنفس تخطيط صفحة الحجز حتى لا تقفز العناصر عند ظهورها
const Bar = ({ className }) => <div className={`rounded-md bg-[#DCDFD8] ${className}`} />;

const BookingSkeleton = () => (
    <div className="min-h-screen overflow-hidden bg-[#EEF0EC]" dir="rtl" aria-busy="true" aria-label="جاري تحميل صفحة الحجز">
        <div className="h-28 bg-[#DCDFD8] sm:h-36" />
        <div className="mx-auto max-w-5xl animate-pulse px-4">
            <div className="-mt-12 flex items-end gap-4">
                <div className="h-24 w-24 rounded-[22px] bg-white ring-4 ring-white" />
                <div className="flex-1 space-y-2 pb-2">
                    <Bar className="h-7 w-48" />
                    <Bar className="h-4 w-32" />
                </div>
            </div>
            <div className="mt-4 flex gap-2">
                <Bar className="h-10 w-24 rounded-full" />
                <Bar className="h-10 w-20 rounded-full" />
            </div>
            <div className="mt-8 space-y-10 lg:max-w-[calc(100%-380px)]">
                {[4, 1, 1].map((rows, section) => (
                    <div key={section}>
                        <div className="mb-3 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white" />
                            <Bar className="h-5 w-28" />
                        </div>
                        <div className="overflow-hidden rounded-[18px] bg-white">
                            {Array.from({ length: rows }).map((_, index) => (
                                <div key={index} className="flex items-center gap-3 border-b border-[#EEF0EC] p-4 last:border-0">
                                    <Bar className="h-5 w-5" />
                                    <Bar className="h-4 flex-1" />
                                    <Bar className="h-4 w-12" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export default BookingSkeleton;
