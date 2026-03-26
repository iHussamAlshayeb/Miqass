import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const ResetPasswordScreen = () => {
    const { token } = useParams();
    const navigate = useNavigate();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState(''); // 💡 حقل جديد لضمان عدم وجود أخطاء إملائية
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        // التحقق من طول الكلمة وتطابقها قبل إرسالها للسيرفر
        if (newPassword.length < 6) {
            return setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
        }
        if (newPassword !== confirmPassword) {
            return setError('كلمتا المرور غير متطابقتين. الرجاء التأكد.');
        }

        setIsLoading(true);
        setError('');

        try {
            await API.post(`/auth/reset-password/${token}`, { newPassword });
            alert('تم تغيير كلمة المرور بنجاح! 🎉 يمكنك الآن الدخول.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.message || 'الرابط غير صالح أو انتهت صلاحيته.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right relative overflow-hidden" dir="rtl">

            {/* 💡 خلفية جمالية متناسقة مع شاشة النسيان */}
            <div className="absolute top-[-10%] left-[-5%] w-64 h-64 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
            <div className="absolute bottom-[-10%] right-[-5%] w-64 h-64 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white w-full max-w-md p-8 sm:p-10 rounded-[40px] shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-100 relative z-10"
            >
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-inner border border-emerald-100">
                        🔑
                    </div>
                    <h2 className="text-2xl font-black text-slate-800">كلمة مرور جديدة</h2>
                    <p className="text-slate-400 font-bold text-sm mt-3 leading-relaxed">
                        قم بإعداد كلمة مرور قوية وجديدة لصالونك لضمان أمان حسابك.
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-bold text-center border border-red-100"
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-black text-slate-500 mb-2 px-1">كلمة المرور الجديدة</label>
                        <input
                            type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all font-bold text-slate-700 text-left tracking-widest"
                            placeholder="••••••••" dir="ltr"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 mb-2 px-1">تأكيد كلمة المرور</label>
                        <input
                            type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all font-bold text-slate-700 text-left tracking-widest"
                            placeholder="••••••••" dir="ltr"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 transition-all disabled:opacity-70 shadow-[0_8px_20px_rgba(5,150,105,0.2)] active:scale-95 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <><span className="animate-spin text-xl">⏳</span> جاري الحفظ...</>
                        ) : (
                            <>حفظ والدخول 🚀</>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <Link to="/login" className="text-sm font-bold text-slate-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-1 group">
                        <span>إلغاء والعودة للدخول</span>
                        <span dir="ltr" className="group-hover:-translate-x-1 transition-transform">→</span>
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};

export default ResetPasswordScreen;