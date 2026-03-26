import React from 'react';
import { motion } from 'framer-motion';

const ReviewsTab = ({ reviews, isLoading }) => {

    // حساب إحصائيات سريعة
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
        ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1)
        : 0;

    const lowRatings = reviews.filter(r => r.rating <= 3).length;

    if (isLoading) return <div className="p-10 text-center font-bold text-slate-400 animate-pulse">جاري تحميل التقييمات... 📊</div>;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* قسم الإحصائيات العلوية */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-400/10 rounded-full blur-xl -mr-8 -mt-8"></div>
                    <p className="text-xs font-bold text-slate-400 mb-1 relative z-10">متوسط التقييم</p>
                    <h3 className="text-4xl font-black text-slate-800 flex items-center justify-center gap-2 relative z-10">
                        {averageRating} <span className="text-yellow-400 text-3xl drop-shadow-sm">★</span>
                    </h3>
                </div>
                <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-16 h-16 bg-blue-400/10 rounded-full blur-xl -ml-8 -mt-8"></div>
                    <p className="text-xs font-bold text-slate-400 mb-1 relative z-10">إجمالي التقييمات</p>
                    <h3 className="text-4xl font-black text-blue-600 relative z-10">{totalReviews}</h3>
                </div>
                <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm text-center relative overflow-hidden">
                    <div className="absolute bottom-0 right-0 w-16 h-16 bg-red-400/10 rounded-full blur-xl -mr-8 -mb-8"></div>
                    <p className="text-xs font-bold text-slate-400 mb-1 relative z-10">ملاحظات تحتاج اهتمام (3 نجوم فأقل)</p>
                    <h3 className={`text-4xl font-black relative z-10 ${lowRatings > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {lowRatings}
                    </h3>
                </div>
            </div>

            {/* قائمة التقييمات */}
            <div className="bg-white rounded-[35px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 text-lg">أحدث آراء العملاء 💬</h3>
                </div>

                <div className="divide-y divide-slate-50">
                    {reviews.length > 0 ? (
                        reviews.map((review, index) => (
                            <motion.div
                                key={review._id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="p-6 hover:bg-slate-50/50 transition-colors"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-black text-slate-800 text-base">{review.customerName || 'عميل كريم'}</h4>
                                            {/* 💡 عرض اسم الحلاق الذي تم تقييمه */}
                                            {review.barberName && (
                                                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
                                                    ✂️ {review.barberName}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 font-bold" dir="ltr">
                                            {new Date(review.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <div className="flex gap-0.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-100">
                                        {[1, 2, 3, 4, 5].map((s) => (
                                            <span key={s} className={`text-lg drop-shadow-sm ${review.rating >= s ? 'text-yellow-400' : 'text-slate-200'}`}>★</span>
                                        ))}
                                    </div>
                                </div>

                                {review.comment ? (
                                    <div className={`p-4 rounded-2xl text-sm leading-relaxed font-bold border ${review.rating <= 3 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                        "{review.comment}"
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl inline-block">لم يكتب العميل تعليقاً نصياً..</p>
                                )}

                                {/* 💡 عرض رد الإدارة إن وُجد */}
                                {review.reply && (
                                    <div className="mt-3 mr-4 p-3 bg-blue-50/50 border border-blue-100 rounded-2xl rounded-tr-sm relative">
                                        <span className="absolute -top-2 -right-1 text-xl">💬</span>
                                        <p className="text-[10px] font-black text-blue-400 mb-1">رد الإدارة:</p>
                                        <p className="text-xs font-bold text-blue-800">{review.reply}</p>
                                    </div>
                                )}
                            </motion.div>
                        ))
                    ) : (
                        <div className="p-20 text-center flex flex-col items-center">
                            <div className="text-6xl mb-4 grayscale opacity-40">📭</div>
                            <h4 className="text-slate-600 font-black text-lg mb-1">لا توجد تقييمات بعد</h4>
                            <p className="text-slate-400 font-bold text-sm">ستظهر آراء عملائك هنا بمجرد تقييم تجاربهم.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default ReviewsTab;