import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, CreditCard, Megaphone, ShieldCheck, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../../services/api';

const fallbackPricing = { pro: 99, premium: 199 };

const BillingTab = ({ subscription, tenantId, campaignCredits, promoBanner }) => {
    const navigate = useNavigate();
    const currentPlan = subscription?.plan || 'Free';
    const isFreePlan = currentPlan === 'Free';

    const [pricing, setPricing] = useState(fallbackPricing);
    const [discount, setDiscount] = useState({ isActive: false, percentage: 0, name: '' });
    const [isLoadingPricing, setIsLoadingPricing] = useState(true);

    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const pricingRes = await API.get('/public/pricing');
                if (pricingRes.data) {
                    setPricing(pricingRes.data.pricing || fallbackPricing);
                    setDiscount(pricingRes.data.discount || { isActive: false, percentage: 0, name: '' });
                }
            } catch (error) {
                console.error('خطأ في جلب الأسعار الديناميكية:', error);
            } finally {
                setIsLoadingPricing(false);
            }
        };

        fetchPricing();
    }, []);

    const calculateCurrentPrice = (basePrice) => {
        if (!discount.isActive) return basePrice;
        return Math.round(basePrice * (1 - discount.percentage / 100));
    };

    const planDetails = {
        Free: { name: 'الباقة الأساسية', price: 0, basePrice: 0 },
        Pro: { name: 'الباقة الاحترافية', price: calculateCurrentPrice(pricing.pro), basePrice: pricing.pro },
        Premium: { name: 'الباقة المميزة', price: calculateCurrentPrice(pricing.premium), basePrice: pricing.premium },
    };

    const activePlan = planDetails[currentPlan] || planDetails.Free;

    const daysLeft = useMemo(() => {
        if (!subscription?.endDate) return 0;
        const end = new Date(subscription.endDate);
        const now = new Date();
        return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    }, [subscription?.endDate]);

    const isExpired = !isFreePlan && daysLeft <= 0;
    const isPending = subscription?.status === 'Pending_Approval';
    const isActive = subscription?.status === 'Active' && !isExpired;
    const nextPlanPrice = calculateCurrentPrice(pricing.pro);

    const statusConfig = isActive
        ? { label: 'نشط', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
        : isPending
            ? { label: 'قيد المراجعة', className: 'bg-amber-50 text-amber-700 border-amber-100' }
            : isFreePlan
                ? { label: 'مجاني', className: 'bg-blue-50 text-blue-700 border-blue-100' }
                : { label: 'غير نشط', className: 'bg-red-50 text-red-700 border-red-100' };

    const goToPayment = () => {
        navigate('/payment', { state: { tenantId, appliedPromo: promoBanner } });
    };

    return (
        <div className="space-y-6">
            <section className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                            <CreditCard size={18} />
                            <span className="text-xs font-black">الاشتراك والدفع</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800">حالة الباقة الحالية</h2>
                        <p className="text-sm font-bold text-slate-500 mt-1">
                            راقب حالة الاشتراك والتجديد من مكان واحد.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={goToPayment}
                        className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-lg font-black text-sm hover:bg-slate-700 active:scale-95 transition-all"
                    >
                        <WalletCards size={16} />
                        {isFreePlan ? 'عرض الباقات' : 'إدارة الدفع'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="border border-slate-100 bg-slate-50/70 rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-slate-500">الباقة الحالية</p>
                            <BadgeCheck size={18} className="text-slate-500" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mt-3">{activePlan.name}</h3>
                        <span className={`inline-flex mt-3 px-3 py-1 rounded-full border text-xs font-black ${statusConfig.className}`}>
                            {statusConfig.label}
                        </span>
                    </div>

                    <div className="border border-slate-100 bg-white rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-slate-500">تاريخ التجديد</p>
                            <CalendarClock size={18} className="text-slate-500" />
                        </div>
                        <h3 className={`text-2xl font-black mt-3 ${isExpired ? 'text-red-700' : 'text-slate-800'}`}>
                            {isFreePlan ? 'بدون انتهاء' : isExpired ? 'منتهي' : `${daysLeft} يوم`}
                        </h3>
                        {!isFreePlan && subscription?.endDate && (
                            <p className="text-xs font-bold text-slate-400 mt-3" dir="ltr">
                                {new Date(subscription.endDate).toLocaleDateString('en-GB')}
                            </p>
                        )}
                    </div>

                    <div className="border border-slate-100 bg-white rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-slate-500">السعر الشهري</p>
                            <ShieldCheck size={18} className="text-slate-500" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mt-3">
                            {isFreePlan ? `${nextPlanPrice} ر.س` : `${activePlan.price} ر.س`}
                        </h3>
                        <p className="text-xs font-bold text-slate-400 mt-3">
                            {isFreePlan ? 'تبدأ الباقات المدفوعة من هذا السعر' : isLoadingPricing ? 'جاري تحديث الأسعار' : 'حسب الباقة الحالية'}
                        </p>
                    </div>
                </div>
            </section>

            <section className={`border rounded-lg p-4 sm:p-5 ${isExpired ? 'bg-red-50/60 border-red-100' : 'bg-blue-50/60 border-blue-100'}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className={`font-black text-base ${isExpired ? 'text-red-900' : 'text-blue-900'}`}>
                            {isFreePlan ? 'ترقية الاشتراك' : isExpired ? 'تجديد الاشتراك' : 'الاشتراك يعمل بشكل جيد'}
                        </h3>
                        <p className={`font-bold text-sm mt-1 ${isExpired ? 'text-red-700' : 'text-blue-700'}`}>
                            {isFreePlan
                                ? 'فعّل الواتساب، بوابة الحلاقين، والتسويق الآلي من الباقات المدفوعة.'
                                : isExpired
                                    ? 'انتهى الاشتراك، جدده لتجنب إيقاف صفحة الحجز عن العملاء.'
                                    : 'يمكنك التجديد أو تغيير الباقة قبل موعد الانتهاء.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={goToPayment}
                        className={`${isExpired ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-700'} inline-flex items-center justify-center gap-2 text-white px-6 py-3 rounded-lg font-black text-sm w-full md:w-auto active:scale-95 transition-all`}
                    >
                        <CreditCard size={16} />
                        {isFreePlan ? 'اختيار باقة' : 'فتح صفحة الدفع'}
                    </button>
                </div>
            </section>

            {currentPlan !== 'Premium' && (
                <section className="border border-purple-100 bg-white rounded-lg p-4 sm:p-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-purple-700 mb-2">
                                <Megaphone size={18} />
                                <span className="text-xs font-black">حملات تسويقية</span>
                            </div>
                            <h3 className="font-black text-slate-800">إطلاق حملة واتساب لمرة واحدة</h3>
                            <p className="text-sm font-bold text-slate-500 mt-1">
                                أرسل حملة لعملائك بدون تغيير الباقة الحالية.
                            </p>
                            <span className="inline-flex mt-3 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-100 text-xs font-black">
                                الرصيد المتبقي: {campaignCredits || 0} حملات
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => alert('سيتم توجيهك قريباً لبوابة الدفع لشراء رصيد حملة بـ 19 ريال. (تحت التطوير)')}
                            className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-black text-sm w-full md:w-auto active:scale-95 transition-all"
                        >
                            <Megaphone size={16} />
                            شراء رصيد حملة
                        </button>
                    </div>
                </section>
            )}

            <p className="text-center text-xs font-bold text-slate-400">
                هل تواجه مشكلة في الدفع؟ <a href="https://wa.me/966541993290" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">تواصل مع الدعم الفني</a>
            </p>
        </div>
    );
};

export default BillingTab;
