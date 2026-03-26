import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { motion } from 'framer-motion';

const RegisterScreen = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [formData, setFormData] = useState({
        salonName: '',
        slug: '',
        ownerName: '',
        ownerPhone: '',
        email: '',
        password: ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');

        // التحقق من أن الرابط (slug) لا يحتوي على مسافات
        if (formData.slug.includes(' ')) {
            setError('رابط الصالون (Slug) يجب ألا يحتوي على مسافات. استخدم الحروف الإنجليزية والشرطات فقط.');
            setIsLoading(false);
            return;
        }

        try {
            const response = await API.post('/auth/register', formData);

            setSuccess('تم إنشاء حساب صالونك المجاني بنجاح! جاري دخول النظام... 🚀');

            // 💡 1. حفظ التوكن في المتصفح لكي يتعرف عليه النظام كمدير مسجل
            if (response.data.token) {
                localStorage.setItem('token', response.data.token);
            }

            // 💡 2. توجيه للوحة التحكم مباشرة (بدون المرور بصفحة الدفع)
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);

        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ أثناء التسجيل. تأكد من البيانات.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right selection:bg-blue-200" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white w-full max-w-2xl p-6 md:p-10 rounded-[40px] shadow-xl border border-slate-100 relative"
            >
                {/* زر العودة للرئيسية */}
                <div className="absolute top-6 left-6 md:top-8 md:left-8">
                    <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-colors text-sm font-bold bg-slate-50 hover:bg-blue-50 px-4 py-2 rounded-xl">
                        <span>الرئيسية</span>
                        <span className="text-lg leading-none">🏠</span>
                    </Link>
                </div>

                <div className="text-center mb-8 mt-4 md:mt-0">
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800">ابدأ مجاناً الآن</h2>
                    <p className="text-slate-400 font-bold text-sm mt-2">سجل صالونك وابدأ باستقبال الحجوزات (لا يتطلب بطاقة ائتمانية).</p>
                </div>

                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-bold text-center border border-red-100">
                        {error}
                    </motion.div>
                )}

                {success && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl mb-6 text-sm font-black text-center border border-emerald-100">
                        {success}
                    </motion.div>
                )}

                <form onSubmit={handleRegister} className="space-y-5">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* اسم الصالون */}
                        <div>
                            <label className="block text-sm font-black text-slate-500 mb-2">اسم الصالون</label>
                            <input
                                type="text" name="salonName" required placeholder="مثال: صالون الأبطال"
                                value={formData.salonName} onChange={handleChange}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                            />
                        </div>

                        {/* الرابط المخصص */}
                        <div>
                            <label className="block text-sm font-black text-slate-500 mb-2">الرابط المخصص (Slug) بالإنجليزي</label>
                            <div className="flex relative">
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm" dir="ltr">miqass.app/</span>
                                <input
                                    type="text" name="slug" required placeholder="heroes-salon"
                                    value={formData.slug} onChange={handleChange}
                                    className="w-full p-4 pr-24 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold" dir="ltr"
                                />
                            </div>
                        </div>

                        {/* اسم المالك */}
                        <div>
                            <label className="block text-sm font-black text-slate-500 mb-2">اسم المالك / المدير</label>
                            <input
                                type="text" name="ownerName" required placeholder="مثال: عبدالله"
                                value={formData.ownerName} onChange={handleChange}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                            />
                        </div>

                        {/* رقم الجوال */}
                        <div>
                            <label className="block text-sm font-black text-slate-500 mb-2">رقم جوال الإدارة</label>
                            <input
                                type="tel" name="ownerPhone" required placeholder="05XXXXXXXX" pattern="^05[0-9]{8}$" maxLength="10"
                                value={formData.ownerPhone} onChange={handleChange}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold tracking-widest" dir="ltr"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* البريد الإلكتروني */}
                        <div>
                            <label className="block text-sm font-black text-slate-500 mb-2">البريد الإلكتروني (للدخول)</label>
                            <input
                                type="email" name="email" required placeholder="admin@salon.com"
                                value={formData.email} onChange={handleChange}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold" dir="ltr"
                            />
                        </div>

                        {/* كلمة المرور */}
                        <div>
                            <label className="block text-sm font-black text-slate-500 mb-2">كلمة المرور</label>
                            <input
                                type="password" name="password" required minLength="6" placeholder="••••••••"
                                value={formData.password} onChange={handleChange}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold" dir="ltr"
                            />
                        </div>
                    </div>

                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="submit" disabled={isLoading || success}
                        className="w-full bg-slate-800 text-white font-black py-4 rounded-2xl hover:bg-slate-700 transition-all disabled:opacity-70 mt-6 shadow-xl shadow-slate-200"
                    >
                        {isLoading ? 'جاري التجهيز...' : 'إنشاء حساب مجاني'}
                    </motion.button>
                </form>

                <p className="text-center mt-6 text-sm font-bold text-slate-500">
                    لديك حساب صالون مسبقاً؟ <Link to="/login" className="text-blue-600 hover:text-blue-800 underline underline-offset-4">تسجيل الدخول</Link>
                </p>
            </motion.div>
        </div>
    );
};

export default RegisterScreen;