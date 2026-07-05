import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Send } from 'lucide-react';
import API from '../services/api';

const ForgotPasswordScreen = () => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
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
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right" dir="rtl">
            <section className="bg-white w-full max-w-md p-5 sm:p-6 rounded-lg shadow-sm border border-slate-100">
                <Link to="/login" className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-700 transition-colors text-sm font-bold mb-8">
                    <ArrowRight size={16} />
                    العودة لصفحة الدخول
                </Link>

                <div className="mb-8">
                    <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center mb-4">
                        <Mail size={20} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800">استعادة كلمة المرور</h1>
                    <p className="text-slate-500 font-bold text-sm mt-2 leading-relaxed">
                        أدخل بريدك الإلكتروني المرتبط بحساب الصالون وسنرسل لك رابط استعادة آمن.
                    </p>
                </div>

                {message && (
                    <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-5 text-sm font-bold border border-emerald-100">
                        {message}
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-5 text-sm font-bold border border-red-100">
                        {error}
                    </div>
                )}

                {!message && (
                    <form onSubmit={handleSubmit} className="space-y-5">
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
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 text-white font-black py-4 rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-70 inline-flex items-center justify-center gap-2"
                        >
                            <Send size={17} />
                            {isLoading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}
                        </button>
                    </form>
                )}
            </section>
        </main>
    );
};

export default ForgotPasswordScreen;
