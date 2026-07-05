import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, KeyRound, Save } from 'lucide-react';
import API from '../services/api';

const ResetPasswordScreen = () => {
    const { token } = useParams();
    const navigate = useNavigate();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (newPassword.length < 6) {
            setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('كلمتا المرور غير متطابقتين. الرجاء التأكد.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await API.post(`/auth/reset-password/${token}`, { newPassword });
            alert('تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.message || 'الرابط غير صالح أو انتهت صلاحيته.');
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
                    <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center mb-4">
                        <KeyRound size={20} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800">كلمة مرور جديدة</h1>
                    <p className="text-slate-500 font-bold text-sm mt-2 leading-relaxed">
                        أنشئ كلمة مرور قوية لحماية حساب الصالون.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-5 text-sm font-bold border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-black text-slate-600 mb-2">كلمة المرور الجديدة</label>
                        <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:bg-white transition-all font-bold text-slate-700 text-left tracking-widest"
                            placeholder="••••••••"
                            dir="ltr"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-black text-slate-600 mb-2">تأكيد كلمة المرور</label>
                        <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:bg-white transition-all font-bold text-slate-700 text-left tracking-widest"
                            placeholder="••••••••"
                            dir="ltr"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-emerald-600 text-white font-black py-4 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-70 inline-flex items-center justify-center gap-2"
                    >
                        <Save size={17} />
                        {isLoading ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
                    </button>
                </form>
            </section>
        </main>
    );
};

export default ResetPasswordScreen;
