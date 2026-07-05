import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, LogIn, Mail } from 'lucide-react';
import API from '../services/api';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await API.post('/auth/login', { email, password });
            localStorage.setItem('token', response.data.token);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ أثناء تسجيل الدخول');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right selection:bg-blue-200" dir="rtl">
            <section className="bg-white w-full max-w-md p-5 sm:p-6 rounded-lg shadow-sm border border-slate-100">
                <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-700 transition-colors text-sm font-bold mb-8">
                    <ArrowRight size={16} />
                    الرئيسية
                </Link>

                <div className="mb-8">
                    <div className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
                        <LockKeyhole size={20} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800">بوابة الدخول</h1>
                    <p className="text-slate-500 font-bold text-sm mt-2">أدخل بيانات صالونك للمتابعة إلى لوحة الإدارة.</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-5 text-sm font-bold border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-sm font-black text-slate-600 mb-2">البريد الإلكتروني</label>
                        <div className="relative">
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                                placeholder="admin@salon.com"
                                dir="ltr"
                            />
                            <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-black text-slate-600 mb-2">كلمة المرور</label>
                        <div className="relative">
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                                placeholder="••••••••"
                                dir="ltr"
                            />
                            <LockKeyhole size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>

                    <div className="flex justify-start">
                        <Link to="/forgot-password" className="text-xs font-bold text-slate-500 hover:text-blue-700 transition-colors">
                            نسيت كلمة المرور؟
                        </Link>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-slate-900 text-white font-black py-4 rounded-lg hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-70 mt-2 inline-flex items-center justify-center gap-2"
                    >
                        <LogIn size={17} />
                        {isLoading ? 'جاري التحقق...' : 'دخول للوحة التحكم'}
                    </button>
                </form>

                <p className="text-center mt-6 text-sm font-bold text-slate-500">
                    ليس لديك حساب صالون؟ <Link to="/register" className="text-blue-700 hover:underline underline-offset-4">سجل مجاناً الآن</Link>
                </p>
            </section>
        </main>
    );
};

export default LoginScreen;
