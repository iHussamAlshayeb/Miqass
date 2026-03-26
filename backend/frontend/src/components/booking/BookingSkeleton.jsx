import React from 'react';

const BookingSkeleton = () => {
    return (
        <div className="min-h-screen bg-[#F8FAFC] font-arabic text-right overflow-x-hidden" dir="rtl">
            {/* هيدر الهيكل */}
            <div className="bg-white px-6 py-8 rounded-b-[40px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-b border-gray-100 flex flex-col items-center animate-pulse">
                <div className="h-20 w-20 bg-slate-200 rounded-full mb-4"></div>
                <div className="h-6 w-40 bg-slate-200 rounded-lg mb-3"></div>
                <div className="h-5 w-24 bg-slate-200 rounded-full"></div>
            </div>

            <main className="max-w-md mx-auto px-5 mt-6 pb-32">
                {/* هيكل الطاقم */}
                <div className="mb-8">
                    <div className="h-5 w-24 bg-slate-200 rounded-md mb-3 animate-pulse"></div>
                    <div className="flex gap-2">
                        <div className="h-12 flex-1 bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                        <div className="h-12 flex-1 bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                    </div>
                </div>

                {/* هيكل التاريخ */}
                <div className="mb-8">
                    <div className="h-5 w-28 bg-slate-200 rounded-md mb-3 animate-pulse"></div>
                    <div className="h-14 w-full bg-white border border-slate-100 rounded-3xl animate-pulse"></div>
                </div>

                {/* هيكل الخدمات */}
                <div className="mb-8">
                    <div className="h-5 w-32 bg-slate-200 rounded-md mb-3 animate-pulse"></div>
                    <div className="flex flex-col gap-2">
                        <div className="h-16 w-full bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                        <div className="h-16 w-full bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                    </div>
                </div>

                {/* هيكل الأوقات */}
                <div className="mb-10">
                    <div className="h-5 w-28 bg-slate-200 rounded-md mb-4 animate-pulse"></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="h-20 bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                        <div className="h-20 bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                        <div className="h-20 bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                        <div className="h-20 bg-white border border-slate-100 rounded-2xl animate-pulse"></div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BookingSkeleton;