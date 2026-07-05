import React from 'react';
import { AlertTriangle, MessageSquareText, Scissors, Star } from 'lucide-react';

const ReviewsTab = ({ reviews = [], isLoading }) => {
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
        ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1)
        : '0.0';
    const lowRatings = reviews.filter((review) => review.rating <= 3).length;

    if (isLoading) {
        return <div className="p-10 text-center font-bold text-slate-400 animate-pulse">جاري تحميل التقييمات...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">متوسط التقييم</p>
                        <Star size={18} className="text-amber-500" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mt-3">{averageRating}</h3>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">إجمالي التقييمات</p>
                        <MessageSquareText size={18} className="text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-black text-blue-700 mt-3">{totalReviews}</h3>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400">تحتاج اهتمام</p>
                        <AlertTriangle size={18} className={lowRatings > 0 ? 'text-red-600' : 'text-emerald-600'} />
                    </div>
                    <h3 className={`text-2xl font-black mt-3 ${lowRatings > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {lowRatings}
                    </h3>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquareText size={18} className="text-slate-500" />
                    <h3 className="font-black text-slate-800 text-base">أحدث آراء العملاء</h3>
                </div>

                <div className="divide-y divide-slate-100">
                    {reviews.length > 0 ? (
                        reviews.map((review) => (
                            <div key={review._id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
                                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h4 className="font-black text-slate-800 text-base">{review.customerName || 'عميل كريم'}</h4>
                                            {review.barberName && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
                                                    <Scissors size={11} />
                                                    {review.barberName}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 font-bold" dir="ltr">
                                            {new Date(review.createdAt).toLocaleDateString('ar-EG', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </p>
                                    </div>
                                    <div className="flex gap-0.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 w-fit">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                size={17}
                                                className={review.rating >= star ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {review.comment ? (
                                    <div className={`p-4 rounded-lg text-sm leading-relaxed font-bold border ${review.rating <= 3 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                        {review.comment}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg inline-block">لم يكتب العميل تعليقاً نصياً.</p>
                                )}

                                {review.reply && (
                                    <div className="mt-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                                        <p className="text-[10px] font-black text-blue-500 mb-1">رد الإدارة:</p>
                                        <p className="text-xs font-bold text-blue-800">{review.reply}</p>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="p-16 text-center flex flex-col items-center">
                            <MessageSquareText size={42} className="text-slate-300 mb-4" />
                            <h4 className="text-slate-600 font-black text-lg mb-1">لا توجد تقييمات بعد</h4>
                            <p className="text-slate-400 font-bold text-sm">ستظهر آراء العملاء هنا بمجرد تقييم تجاربهم.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewsTab;
