import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import API from '../../services/api';

// 💡 1. إضافة promoBanner لاستقبال العرض الترويجي من لوحة التحكم
const BillingTab = ({ subscription, tenantId, campaignCredits, promoBanner }) => {
    const navigate = useNavigate();

    // قراءة تفاصيل الباقة ديناميكياً
    const currentPlan = subscription?.plan || 'Free';
    const isFreePlan = currentPlan === 'Free';

    // حالة الأسعار والتخفيضات (لجلبها من السيرفر)
    const [pricing, setPricing] = useState({ pro: 99, premium: 199 });
    const [discount, setDiscount] = useState({ isActive: false, percentage: 0, name: '' });
    const [isLoadingPricing, setIsLoadingPricing] = useState(true);

    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const pricingRes = await API.get('/public/pricing');
                if (pricingRes.data) {
                    setPricing(pricingRes.data.pricing || { pro: 99, premium: 199 });
                    setDiscount(pricingRes.data.discount || { isActive: false, percentage: 0, name: '' });
                }
            } catch (error) {
                console.error("خطأ في جلب الأسعار الديناميكية:", error);
            } finally {
                setIsLoadingPricing(false);
            }
        };
        fetchPricing();
    }, []);

    // دالة حساب السعر النهائي بعد الخصم (شهري)
    const calculateCurrentPrice = (basePrice) => {
        if (!discount.isActive) return basePrice;
        return Math.round(basePrice * (1 - discount.percentage / 100));
    };

    const planDetails = {
        Free: { name: 'الباقة الأساسية (مجانية)', price: 0 },
        Pro: { name: 'الباقة الاحترافية (Pro)', price: calculateCurrentPrice(pricing.pro), basePrice: pricing.pro },
        Premium: { name: 'الباقة المميزة (VIP)', price: calculateCurrentPrice(pricing.premium), basePrice: pricing.premium }
    };

    // دالة حساب الأيام المتبقية للاشتراك
    const calculateDaysLeft = (endDate) => {
        if (!endDate) return 0;
        const end = new Date(endDate);
        const now = new Date();
        const diffTime = end - now;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const daysLeft = calculateDaysLeft(subscription?.endDate);
    const isExpired = !isFreePlan && daysLeft <= 0; // المجانية لا تنتهي

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 md:p-8 rounded-[35px] shadow-sm border border-slate-100"
        >
            <h2 className="text-xl font-black text-slate-800 mb-2">إدارة الاشتراك والدفع 💳</h2>
            <p className="text-slate-500 font-bold text-sm mb-8">تابع حالة باقتك الحالية وتاريخ التجديد لضمان استمرار الخدمة.</p>

            {/* 1. كرت عرض تفاصيل الباقة */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl shadow-slate-900/10">
                {/* تأثيرات بصرية للكرت (Glow) */}
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <p className="text-slate-400 font-bold text-sm mb-1">الباقة الحالية</p>
                        <h3 className="text-2xl md:text-3xl font-black mb-4 flex items-center flex-wrap gap-3">
                            {planDetails[currentPlan].name}

                            {subscription?.status === 'Active' && !isExpired ? (
                                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> نشط
                                </span>
                            ) : subscription?.status === 'Pending_Approval' ? (
                                <span className="text-xs bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full border border-orange-500/30">
                                    قيد المراجعة ⏳
                                </span>
                            ) : isFreePlan ? (
                                <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/30">
                                    مجاني مدى الحياة
                                </span>
                            ) : (
                                <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full border border-red-500/30">
                                    غير نشط ❌
                                </span>
                            )}
                        </h3>

                        {!isFreePlan && subscription?.endDate && (
                            <div className="flex items-center gap-2 text-slate-300 font-bold text-sm bg-slate-800/50 w-fit px-4 py-2 rounded-xl border border-slate-700 backdrop-blur-sm">
                                <span>⏳ ينتهي في:</span>
                                <span dir="ltr" className={isExpired ? 'text-red-400' : 'text-emerald-400 font-black'}>
                                    {new Date(subscription.endDate).toLocaleDateString('en-GB')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* عداد الأيام (يختفي في الباقة المجانية) */}
                    {!isFreePlan && (
                        <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 text-center min-w-[140px] backdrop-blur-md w-full md:w-auto shadow-inner relative">
                            {discount.isActive && !isExpired && (
                                <span className="absolute -top-3 -right-3 bg-amber-400 text-amber-950 font-black px-2 py-0.5 rounded-lg text-[9px] shadow-sm animate-bounce">
                                    خصم متاح 🔥
                                </span>
                            )}
                            <p className="text-slate-400 font-bold text-sm mb-1">الأيام المتبقية</p>
                            <span className={`text-4xl font-black ${isExpired ? 'text-red-500 text-2xl' : daysLeft <= 3 ? 'text-orange-400' : 'text-blue-400'}`}>
                                {isExpired ? 'منتهي ⚠️' : daysLeft}
                            </span>
                            {!isExpired && <p className="text-slate-500 font-bold text-xs mt-1">يوم</p>}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. قسم التجديد / الترقية */}
            <div className={`mt-8 border p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 transition-colors ${isExpired ? 'bg-red-50/50 border-red-100' : 'bg-blue-50/50 border-blue-100'}`}>
                <div>
                    <h4 className={`font-black text-base flex items-center gap-2 ${isExpired ? 'text-red-900' : 'text-blue-900'}`}>
                        {isFreePlan ? 'ترقية الاشتراك 🚀' : 'تجديد الاشتراك 💳'}

                        {!isFreePlan && !isLoadingPricing && (
                            <span className="text-xs bg-white px-2 py-1 rounded-lg shadow-sm text-slate-600 font-black border border-slate-100 flex items-center gap-1">
                                {discount.isActive && <span className="line-through text-red-400 opacity-60 mr-1">{planDetails[currentPlan].basePrice}</span>}
                                {planDetails[currentPlan].price} ريال / شهرياً
                            </span>
                        )}
                    </h4>
                    <p className={`font-bold text-xs mt-1.5 ${isExpired ? 'text-red-600' : 'text-blue-600/70'}`}>
                        {isFreePlan
                            ? 'رقي باقتك الآن لتفعيل خدمة الواتساب، وبوابة الحلاقين، والتسويق الآلي للعملاء!'
                            : isExpired
                                ? 'لقد انتهى اشتراكك! يرجى التجديد فوراً لتجنب إيقاف صفحة الحجز لعملائك.'
                                : 'احرص على تجديد اشتراكك قبل الانتهاء لضمان استمرار تدفق الحجوزات.'}
                    </p>
                </div>
                <button
                    // 💡 2. السطر السحري: نمرر promoBanner كـ appliedPromo لصفحة الدفع
                    onClick={() => navigate('/payment', { state: { tenantId: tenantId, appliedPromo: promoBanner } })}
                    className={`${isExpired ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-slate-800 hover:bg-slate-700 shadow-slate-800/20'} text-white px-8 py-4 rounded-xl font-black text-sm w-full md:w-auto active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 relative overflow-hidden`}
                >
                    {discount.isActive && isFreePlan && <div className="absolute top-0 left-0 w-full h-full bg-white/20 blur-sm translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000"></div>}

                    <span className="relative z-10">{isFreePlan ? 'عرض الباقات والترقية' : 'تجديد الباقة الآن'}</span>
                    <span className="relative z-10">{isFreePlan ? '🚀' : '💳'}</span>
                </button>
            </div>

            {/* 3. كرت بيع الرصيد المقطوع (Micro-transaction) */}
            {currentPlan !== 'Premium' && (
                <div className="mt-6 border-2 border-dashed border-purple-200 bg-purple-50/50 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-4 hover:border-purple-300 transition-colors">
                    <div>
                        <h4 className="font-black text-purple-900 text-lg flex items-center gap-2">
                            📢 إطلاق حملة تسويقية لمرة واحدة
                        </h4>
                        <p className="text-purple-700/80 font-bold text-sm mt-1">
                            لا تريد الترقية لـ VIP؟ لا مشكلة! يمكنك إرسال حملة واتساب لجميع عملائك بـ 19 ريال فقط للحملة.
                        </p>
                        <p className="text-purple-600 font-black text-xs mt-3 bg-purple-100 inline-block px-3 py-1.5 rounded-lg border border-purple-200">
                            الرصيد المتبقي: {campaignCredits || 0} حملات
                        </p>
                    </div>
                    <button
                        onClick={() => alert('سيتم توجيهك قريباً لبوابة الدفع لشراء رصيد حملة بـ 19 ريال. (تحت التطوير)')}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-4 rounded-2xl font-black text-sm w-full md:w-auto active:scale-95 transition-all shadow-lg shadow-purple-600/30 whitespace-nowrap flex gap-2 items-center justify-center"
                    >
                        <span>شراء رصيد حملة (19 ر.س)</span>
                        <span>⚡</span>
                    </button>
                </div>
            )}

            {/* ملاحظة للتواصل مع الدعم */}
            <p className="text-center text-xs font-bold text-slate-400 mt-8">
                هل تواجه مشكلة في الدفع؟ <a href="https://wa.me/966541993290" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">تواصل مع الدعم الفني</a>
            </p>
        </motion.div>
    );
};

export default BillingTab;