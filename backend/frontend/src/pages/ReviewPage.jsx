import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import API from '../services/api';

const ReviewPage = () => {
    const { appointmentId } = useParams();
    const [loading, setLoading] = useState(true);

    const [attendanceConfirmed, setAttendanceConfirmed] = useState(null);
    const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);

    const [submitted, setSubmitted] = useState(false);
    const [data, setData] = useState(null);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await API.get(`reviews/data/${appointmentId}`);
                setData(res.data);
            } catch (err) {
                console.error("خطأ في جلب البيانات", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [appointmentId]);

    const handleDidNotAttend = async () => {
        setIsUpdatingAttendance(true);
        try {
            await API.post(`reviews/submit/${appointmentId}`, { didNotAttend: true });
            setAttendanceConfirmed(false);
        } catch (err) {
            alert("حدث خطأ، يرجى المحاولة لاحقاً");
        } finally {
            setIsUpdatingAttendance(false);
        }
    };

    const handleSubmit = async () => {
        if (rating === 0) return alert("يرجى اختيار عدد النجوم أولاً");
        try {
            const res = await API.post(`reviews/submit/${appointmentId}`, {
                rating,
                comment
            });
            setSubmitted(true);
            if (res.data.redirectToGoogle) {
                setGoogleUrl(res.data.googleUrl);
            }
        } catch (err) {
            alert(err.response?.data?.message || "حدث خطأ أثناء حفظ التقييم");
        }
    };

    // 💡 السحر هنا: دالة نسخ النص قبل الذهاب لجوجل
    const handleGoogleClick = () => {
        if (comment && comment.trim() !== '') {
            navigator.clipboard.writeText(comment)
                .then(() => {
                    // تنبيه سريع ولطيف للعميل
                    alert("تم نسخ تعليقك بنجاح! 📋\nقم بلصقه مباشرة في صفحة جوجل.");
                })
                .catch(err => {
                    console.error('فشل النسخ التلقائي: ', err);
                });
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">جاري التحميل... ⏳</div>;
    if (!data) return <div className="min-h-screen flex items-center justify-center font-bold text-red-400">عذراً، الرابط غير صالح أو انتهت صلاحيته.</div>;

    return (
        <div className="min-h-screen bg-[#FDFCFB] p-6 flex flex-col items-center justify-center font-tajawal" dir="rtl">
            <div className="max-w-md w-full bg-white rounded-[40px] shadow-xl shadow-slate-100 p-8 border border-slate-50 text-center relative overflow-hidden transition-all duration-500">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-300 via-blue-300 to-purple-300"></div>

                {attendanceConfirmed === null ? (
                    <div className="py-4 animate-in fade-in zoom-in duration-500">
                        <div className="text-6xl mb-4">🤔</div>
                        <h1 className="text-2xl font-black text-slate-800 mb-2">تأكيد الحضور</h1>
                        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                            عزيزي العميل، هل تشرفنا بزيارتكم وتم تقديم الخدمة لـ <span className="text-emerald-600 font-black">{data.childName}</span> بنجاح اليوم؟
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setAttendanceConfirmed(true)}
                                className="bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-600 active:scale-95 transition-all text-lg"
                            >
                                نعم، حضرت للموعد ✅
                            </button>
                            <button
                                onClick={handleDidNotAttend}
                                disabled={isUpdatingAttendance}
                                className="bg-slate-50 text-slate-500 py-4 rounded-2xl font-bold hover:bg-red-50 hover:text-red-500 active:scale-95 transition-all"
                            >
                                {isUpdatingAttendance ? 'جاري التحديث...' : 'لا، لم أتمكن من الحضور ❌'}
                            </button>
                        </div>
                    </div>
                ) : attendanceConfirmed === false ? (
                    <div className="py-6 animate-in fade-in zoom-in duration-500">
                        <div className="text-6xl mb-6">🗓️</div>
                        <h2 className="text-2xl font-black text-slate-800 mb-4">بانتظاركم في وقت آخر!</h2>
                        <p className="text-slate-500 text-sm leading-relaxed mb-8">تم تسجيل عدم الحضور للموعد. نتمنى أن تكونوا بخير، ويسعدنا حجزكم لموعد جديد متى ما ناسبكم.</p>
                        <button onClick={() => window.close()} className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all">
                            إغلاق الصفحة ✖️
                        </button>
                    </div>
                ) : !submitted ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-5xl mb-4 text-emerald-500">✨</div>
                        <h1 className="text-2xl font-black text-slate-800 mb-2">كيف كانت التجربة؟</h1>
                        <p className="text-slate-500 text-sm mb-8">نود معرفة رأيك في الخدمة المقدمة لـ <span className="text-emerald-600 font-bold">{data.childName}</span> لدى <span className="font-bold">{data.salonName}</span></p>

                        <div className="flex flex-row-reverse justify-center gap-2 mb-8" dir="ltr">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => setRating(star)}
                                    className={`text-4xl transition-all transform hover:scale-110 ${rating >= star ? 'scale-110 text-yellow-400 drop-shadow-sm' : 'text-slate-200 scale-100'}`}
                                >
                                    ★
                                </button>
                            ))}
                        </div>

                        <div className={`transition-all duration-500 overflow-hidden ${rating > 0 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <textarea
                                className="w-full bg-slate-50 border border-slate-100 rounded-3xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 mb-6 resize-none"
                                placeholder={rating <= 3 ? "نعتذر منك.. أخبرنا كيف يمكننا التحسن؟" : "يسعدنا أن التجربة أعجبتك! هل لديك أي ملاحظات إضافية؟"}
                                rows="3"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                            ></textarea>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={rating === 0}
                            className={`w-full py-4 rounded-2xl font-black text-white shadow-lg transition-all ${rating > 0 ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 cursor-pointer active:scale-95' : 'bg-slate-200 cursor-not-allowed'}`}
                        >
                            إرسال التقييم ⭐
                        </button>
                    </div>
                ) : (
                    <div className="py-6 animate-in fade-in zoom-in duration-500">
                        <div className="text-6xl mb-6">🌟</div>
                        <h2 className="text-2xl font-black text-slate-800 mb-4 text-emerald-600">شكراً لك من القلب!</h2>
                        <p className="text-slate-500 text-sm leading-relaxed mb-8">رأيك يساعدنا على الاستمرار في تقديم أفضل خدمة لكل عملائنا في <span className="font-bold">{data.salonName}</span>.</p>

                        {googleUrl ? (
                            <div className="space-y-4">
                                <p className="text-xs font-bold text-amber-500 bg-amber-50 py-2 px-4 rounded-full inline-block">دعمك يفرق معنا! ⭐</p>

                                {/* 💡 الخطوة 2: إضافة onClick للزر */}
                                <a
                                    href={googleUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={handleGoogleClick}
                                    className="block w-full bg-white border-2 border-slate-100 text-slate-700 py-4 rounded-2xl font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 48 48">
                                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                                        <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                                        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                                    </svg>
                                    انشر تقييمك على خرائط جوجل
                                </a>
                                <button onClick={() => window.close()} className="text-slate-400 text-xs underline font-bold">إغلاق الصفحة</button>
                            </div>
                        ) : (
                            <button onClick={() => window.close()} className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all">
                                إغلاق ✖️
                            </button>
                        )}
                    </div>
                )}
            </div>
            <p className="mt-8 text-slate-300 text-[10px] font-bold tracking-widest uppercase">نظام مِقَص السحابي</p>
        </div>
    );
};

export default ReviewPage;