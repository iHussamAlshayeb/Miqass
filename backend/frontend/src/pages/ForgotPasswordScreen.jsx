import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const ForgotPasswordScreen = () => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');
        setError('');

        try {
            const res = await API.post('/auth/forgot-password', { email });
            setMessage(res.data.message);
        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ، يرجى المحاولة لاحقاً.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right relative overflow-hidden" dir="rtl">

            {/* 💡 خلفية جمالية (طابع مِقَص السحابي) */}
            <div className="absolute top-[-10%] right-[-5%] w-64 h-64 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
            <div className="absolute bottom-[-10%] left-[-5%] w-64 h-64 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white w-full max-w-md p-8 sm:p-10 rounded-[40px] shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-100 relative z-10"
            >
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-inner border border-blue-100">
                        🔐
                    </div>
                    <h2 className="text-2xl font-black text-slate-800">نسيت كلمة المرور؟</h2>
                    <p className="text-slate-400 font-bold text-sm mt-3 leading-relaxed">
                        لا تقلق! أدخل بريدك الإلكتروني المرتبط بحسابك وسنرسل لك رابطاً آمناً لاستعادة كلمة المرور.
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {message && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-emerald-50 text-emerald-600 p-6 rounded-3xl mb-6 text-sm font-bold text-center border border-emerald-100 flex flex-col items-center gap-3"
                        >
                            <span className="text-4xl mb-1">📧</span>
                            <span className="text-base">{message}</span>
                            <Link to="/login" className="mt-4 inline-block w-full bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
                                العودة لتسجيل الدخول
                            </Link>
                        </motion.div>
                    )}

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-bold text-center border border-red-100"
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                {!message && (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-2 px-1">البريد الإلكتروني</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all font-bold text-slate-700 text-left"
                                placeholder="admin@salon.com"
                                dir="ltr"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all disabled:opacity-70 shadow-[0_8px_20px_rgba(37,99,235,0.2)] active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <><span className="animate-spin text-xl">⏳</span> جاري الإرسال...</>
                            ) : (
                                <>إرسال الرابط 🚀</>
                            )}
                        </button>
                    </form>
                )}

                {!message && (
                    <div className="mt-8 text-center">
                        <Link to="/login" className="text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1 group">
                            <span>العودة لصفحة الدخول</span>
                            <span dir="ltr" className="group-hover:-translate-x-1 transition-transform">→</span>
                        </Link>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default ForgotPasswordScreen;