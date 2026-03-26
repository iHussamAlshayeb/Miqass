import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import API from '../../services/api'; // 💡 تأكد من مسار الـ API الصحيح لديك

const UpgradeModal = ({ isOpen, onClose, requiredPlan, featureName, featureIcon, tenantId }) => {
    const navigate = useNavigate();

    // ==========================================
    // 💡 حالات كود الخصم (Promo Code)
    // ==========================================
    const [promoCode, setPromoCode] = useState('');
    const [promoStatus, setPromoStatus] = useState({ type: '', message: '' });
    const [isVerifying, setIsVerifying] = useState(false);
    const [appliedPromo, setAppliedPromo] = useState(null);

    // دالة التحقق من الكوبون
    const handleVerifyPromo = async () => {
        if (!promoCode.trim()) return;
        setIsVerifying(true);
        setPromoStatus({ type: '', message: '' });

        try {
            const res = await API.post('/tenants/validate-promo', { code: promoCode });
            setPromoStatus({ type: 'success', message: res.data.message });
            setAppliedPromo(res.data); // حفظ بيانات الخصم (نوعه وقيمته)
        } catch (error) {
            setPromoStatus({ type: 'error', message: error.response?.data?.message || 'كود غير صالح' });
            setAppliedPromo(null);
        } finally {
            setIsVerifying(false);
        }
    };

    // تصفير الحالات عند إغلاق النافذة
    const handleClose = () => {
        setPromoCode('');
        setPromoStatus({ type: '', message: '' });
        setAppliedPromo(null);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="bg-white w-full max-w-md rounded-[35px] p-8 shadow-2xl relative overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* تصميم الخلفية */}
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-gradient-to-br from-amber-200 to-orange-400 rounded-full blur-3xl opacity-20"></div>

                        <div className="text-center relative z-10">
                            <div className="text-6xl mb-4">{featureIcon || '👑'}</div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">ميزة مقفلة!</h2>
                            <p className="text-slate-500 font-bold mb-6 leading-relaxed">
                                ميزة <strong className="text-slate-800 px-1">{featureName}</strong> متاحة فقط في
                                <span className={`mx-1 px-2 py-1 rounded-lg text-xs font-black ${requiredPlan === 'Premium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                    الباقة {requiredPlan === 'Premium' ? 'المميزة (VIP)' : 'الاحترافية (Pro)'}
                                </span>
                                وأعلى.
                            </p>

                            <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100 text-right">
                                <p className="text-xs font-black text-slate-400 mb-2">لماذا ترقي باقتك؟</p>
                                <ul className="text-sm font-bold text-slate-600 space-y-2">
                                    <li className="flex items-center gap-2"><span>✅</span> توفير وقت الإدارة والمتابعة.</li>
                                    <li className="flex items-center gap-2"><span>✅</span> زيادة ولاء عملائك وعودتهم.</li>
                                    <li className="flex items-center gap-2"><span>✅</span> أتمتة كاملة للصالون بدون تدخل بشري.</li>
                                </ul>
                            </div>

                            {/* ========================================== */}
                            {/* 🎟️ قسم كود الخصم التفاعلي */}
                            {/* ========================================== */}
                            <div className="mb-6 text-right bg-white border border-slate-100 p-3 rounded-2xl shadow-sm">
                                <label className="block text-xs font-bold text-slate-500 mb-2">هل لديك كود خصم؟ (اختياري)</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleVerifyPromo}
                                        disabled={isVerifying || !promoCode || appliedPromo}
                                        className={`px-4 rounded-xl font-black text-xs transition-colors shadow-sm ${appliedPromo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50'}`}
                                    >
                                        {isVerifying ? '⏳' : appliedPromo ? 'مُطبق ✅' : 'تطبيق'}
                                    </button>
                                    <input
                                        type="text"
                                        placeholder="أدخل الكود هنا..."
                                        value={promoCode}
                                        onChange={e => {
                                            setPromoCode(e.target.value.toUpperCase());
                                            setPromoStatus({ type: '', message: '' });
                                            setAppliedPromo(null);
                                        }}
                                        disabled={appliedPromo}
                                        className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:border-amber-400 text-center tracking-widest uppercase text-sm disabled:opacity-90 disabled:bg-emerald-50/50 disabled:text-emerald-700 disabled:border-emerald-200"
                                        dir="ltr"
                                    />
                                </div>
                                {promoStatus.message && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                                        className={`mt-2 text-[10px] font-bold px-1 ${promoStatus.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}
                                    >
                                        {promoStatus.message}
                                    </motion.p>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleClose}
                                    className="flex-1 bg-slate-100 text-slate-500 font-black py-4 rounded-2xl hover:bg-slate-200 transition-colors"
                                >
                                    لاحقاً
                                </button>
                                <button
                                    // 💡 نقوم بتمرير بيانات الخصم (إن وُجدت) لصفحة الدفع
                                    onClick={() => { handleClose(); navigate('/payment', { state: { tenantId, appliedPromo } }); }}
                                    className="flex-[2] bg-gradient-to-l from-amber-500 to-orange-400 text-white font-black py-4 rounded-2xl hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-orange-500/30"
                                >
                                    ترقية الباقة الآن 🚀
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default UpgradeModal;