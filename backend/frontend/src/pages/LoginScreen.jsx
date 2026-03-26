import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { motion } from 'framer-motion';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const response = await API.post('/auth/login', { email, password });

            // حفظ التوكن في المتصفح
            localStorage.setItem('token', response.data.token);

            // توجيه المستخدم للوحة التحكم فوراً
            navigate('/dashboard');
        } catch (err) {
            // 💡 عرض رسالة الخطأ الواردة من الباك إند (مثل: كلمة المرور خطأ)
            setError(err.response?.data?.message || 'حدث خطأ أثناء تسجيل الدخول');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right selection:bg-blue-200" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white w-full max-w-md p-8 rounded-[40px] shadow-xl border border-slate-100 relative"
            >
                {/* 💡 زر العودة للرئيسية */}
                <div className="absolute top-6 left-6">
                    <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-colors text-sm font-bold bg-slate-50 hover:bg-blue-50 px-4 py-2 rounded-xl">
                        <span>الرئيسية</span>
                        <span className="text-lg leading-none">🏠</span>
                    </Link>
                </div>

                <div className="text-center mb-8 mt-4">
                    <h2 className="text-2xl font-black text-slate-800">بوابة الدخول</h2>
                    <p className="text-slate-400 font-bold text-sm mt-1">أدخل بيانات صالونك للمتابعة</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-bold text-center border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-sm font-black text-slate-500 mb-2">البريد الإلكتروني</label>
                        <input
                            type="email" required
                            value={email} onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                            placeholder="admin@salon.com" dir="ltr"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-black text-slate-500 mb-2">كلمة المرور</label>
                        <input
                            type="password" required
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                            placeholder="••••••••" dir="ltr"
                        />
                    </div>

                    {/* 💡 تم ترتيب زر (نسيت كلمة المرور) */}
                    <div className="flex justify-start">
                        <Link to="/forgot-password" className="text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors">
                            نسيت كلمة المرور؟
                        </Link>
                    </div>

                    <button
                        type="submit" disabled={isLoading}
                        className="w-full bg-slate-800 text-white font-black py-4 rounded-2xl hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-70 mt-4 shadow-xl shadow-slate-200"
                    >
                        {isLoading ? 'جاري التحقق...' : 'دخول للوحة التحكم'}
                    </button>
                </form>

                <p className="text-center mt-6 text-sm font-bold text-slate-500">
                    ليس لديك حساب صالون؟ <Link to="/register" className="text-blue-600 hover:text-blue-800 underline underline-offset-4">سجل مجاناً الآن</Link>
                </p>

            </motion.div>
        </div>
    );
};

export default LoginScreen;