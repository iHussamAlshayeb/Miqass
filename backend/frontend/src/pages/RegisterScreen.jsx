import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Link2, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react';
import API from '../services/api';

const emptyForm = {
    salonName: '',
    slug: '',
    ownerName: '',
    ownerPhone: '',
    email: '',
    password: '',
};

const sanitizeSlug = (value) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

const RegisterScreen = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [formData, setFormData] = useState(emptyForm);

    const bookingPathPreview = useMemo(
        () => sanitizeSlug(formData.slug) || 'your-business',
        [formData.slug],
    );

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((prev) => ({
            ...prev,
            [name]: name === 'slug' ? sanitizeSlug(value) : value,
        }));
    };

    const handleRegister = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');

        const payload = {
            ...formData,
            slug: sanitizeSlug(formData.slug),
            ownerPhone: formData.ownerPhone.replace(/\D/g, ''),
        };

        if (!payload.slug) {
            setError('اكتب رابطاً مخصصاً بالإنجليزية والأرقام.');
            setIsLoading(false);
            return;
        }

        try {
            const response = await API.post('/auth/register', payload);
            setSuccess('تم إنشاء الحساب بنجاح. جاري فتح لوحة الإدارة...');

            if (response.data.token) {
                localStorage.setItem('token', response.data.token);
            }

            setTimeout(() => {
                navigate('/dashboard');
            }, 900);
        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ أثناء التسجيل. تأكد من البيانات.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right selection:bg-blue-200" dir="rtl">
            <section className="bg-white w-full max-w-3xl p-5 sm:p-6 rounded-lg shadow-sm border border-slate-100">
                <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-700 transition-colors text-sm font-bold mb-8">
                    <ArrowRight size={16} />
                    الرئيسية
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
                    <div>
                        <div className="mb-6">
                            <div className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
                                <Building2 size={20} />
                            </div>
                            <h1 className="text-2xl font-black text-slate-800">إنشاء حساب منشأة</h1>
                            <p className="text-slate-500 font-bold text-sm mt-2">
                                جهّز الحساب الأساسي وابدأ بإدارة الحجوزات من لوحة التحكم.
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-5 text-sm font-bold border border-red-100">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-5 text-sm font-black border border-emerald-100">
                                {success}
                            </div>
                        )}

                        <form onSubmit={handleRegister} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-black text-slate-600 mb-2">اسم المنشأة</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            name="salonName"
                                            required
                                            placeholder="مثال: صالون الأبطال"
                                            value={formData.salonName}
                                            onChange={handleChange}
                                            className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                                        />
                                        <Building2 size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-600 mb-2">الرابط المخصص</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            name="slug"
                                            required
                                            placeholder="heroes-salon"
                                            value={formData.slug}
                                            onChange={handleChange}
                                            className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                                            dir="ltr"
                                        />
                                        <Link2 size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-600 mb-2">اسم المدير</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            name="ownerName"
                                            required
                                            placeholder="مثال: عبدالله"
                                            value={formData.ownerName}
                                            onChange={handleChange}
                                            className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                                        />
                                        <UserRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-600 mb-2">رقم جوال الإدارة</label>
                                    <div className="relative">
                                        <input
                                            type="tel"
                                            name="ownerPhone"
                                            required
                                            placeholder="05XXXXXXXX"
                                            pattern="^05[0-9]{8}$"
                                            maxLength="10"
                                            value={formData.ownerPhone}
                                            onChange={(event) => setFormData((prev) => ({ ...prev, ownerPhone: event.target.value.replace(/\D/g, '') }))}
                                            className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold tracking-widest"
                                            dir="ltr"
                                        />
                                        <Phone size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-black text-slate-600 mb-2">البريد الإلكتروني</label>
                                    <div className="relative">
                                        <input
                                            type="email"
                                            name="email"
                                            required
                                            placeholder="admin@example.com"
                                            value={formData.email}
                                            onChange={handleChange}
                                            className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
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
                                            name="password"
                                            required
                                            minLength="8"
                                            placeholder="••••••••"
                                            value={formData.password}
                                            onChange={handleChange}
                                            className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all text-slate-700 font-bold"
                                            dir="ltr"
                                        />
                                        <LockKeyhole size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || Boolean(success)}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-lg hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-70 inline-flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={17} />
                                {isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
                            </button>
                        </form>

                        <p className="text-center mt-6 text-sm font-bold text-slate-500">
                            لديك حساب مسبقاً؟ <Link to="/login" className="text-blue-700 hover:underline underline-offset-4">تسجيل الدخول</Link>
                        </p>
                    </div>

                    <aside className="bg-slate-50 border border-slate-100 rounded-lg p-4 h-fit">
                        <p className="text-xs font-black text-slate-400">رابط الحجز</p>
                        <div className="mt-3 bg-white border border-slate-100 rounded-lg p-3 text-sm font-black text-slate-800 break-all" dir="ltr">
                            /{bookingPathPreview}
                        </div>
                        <div className="mt-5 space-y-3 text-xs font-bold text-slate-500 leading-relaxed">
                            <p>سيتم إنشاء حساب مجاني وتسجيل دخولك مباشرة بعد نجاح العملية.</p>
                            <p>يمكنك تعديل الهوية، الخدمات، والطاقم من داخل لوحة الإدارة لاحقاً.</p>
                        </div>
                    </aside>
                </div>
            </section>
        </main>
    );
};

export default RegisterScreen;
