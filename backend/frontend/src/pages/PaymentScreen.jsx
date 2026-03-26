import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const PaymentScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // 💡 حالات التسعير الديناميكي
    const [pricing, setPricing] = useState({ pro: 99, premium: 199 });
    const [discount, setDiscount] = useState({ isActive: false, percentage: 0, name: '' });
    const [isLoadingPricing, setIsLoadingPricing] = useState(true);

    const [isAnnual, setIsAnnual] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState('Pro');
    const [paymentMode, setPaymentMode] = useState('transfer');

    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [transferData, setTransferData] = useState({ senderName: '', bankName: '' });
    const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

    // ==========================================
    // 💡 استلام بيانات الصالون والكوبون من الشاشة السابقة
    // ==========================================
    const tenantId = location.state?.tenantId || sessionStorage.getItem('pendingTenantId');
    const appliedPromo = location.state?.appliedPromo || null;

    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const res = await API.get('/public/pricing');
                if (res.data) {
                    setPricing(res.data.pricing || { pro: 99, premium: 199 });
                    setDiscount(res.data.discount || { isActive: false, percentage: 0, name: '' });
                }
            } catch (error) {
                console.error("خطأ في جلب الأسعار:", error);
            } finally {
                setIsLoadingPricing(false);
            }
        };
        fetchPricing();
    }, []);

    // ==========================================
    // 💡 بناء الباقات ديناميكياً مع حساب التخفيضات (العامة + الكوبون)
    // ==========================================
    const dynamicPlans = [
        {
            id: 'Pro',
            name: 'الباقة الاحترافية',
            baseMonthly: pricing.pro,
            color: 'blue',
            features: ['إدارة الطاقم (كراسي لامحدودة)', 'تأكيد الحجوزات بالواتساب', 'نظام الولاء والمكافآت', 'فلترة تقييمات جوجل']
        },
        {
            id: 'Premium',
            name: 'الباقة المميزة (VIP)',
            baseMonthly: pricing.premium,
            color: 'purple',
            isPopular: true,
            features: ['كل ميزات الباقة الاحترافية', 'بوابة الحلاقين (PIN Access)', 'وضع الكشك للاستقبال', 'التسويق الآلي (إعادة الاستهداف)']
        }
    ].map(plan => {
        // 1. حساب السعر الأساسي (شهري أو سنوي)
        let calculatedPrice = isAnnual ? plan.baseMonthly * 10 : plan.baseMonthly;

        // 2. تطبيق الخصم العام (إن وجد)
        if (discount.isActive) {
            calculatedPrice = calculatedPrice * (1 - discount.percentage / 100);
        }

        // 3. تطبيق خصم الكوبون (إن وجد)
        if (appliedPromo) {
            if (appliedPromo.discountType === 'percentage') {
                calculatedPrice = calculatedPrice * (1 - appliedPromo.discountValue / 100);
            } else if (appliedPromo.discountType === 'fixed') {
                calculatedPrice = calculatedPrice - appliedPromo.discountValue;
            }
        }

        return {
            ...plan,
            currentPrice: Math.max(0, calculatedPrice) // التأكد أن السعر لا يصبح بالسالب أبداً
        };
    });

    const selectedPlan = dynamicPlans.find(p => p.id === selectedPlanId) || dynamicPlans[0];
    const currentPrice = Math.round(selectedPlan.currentPrice); // تقريب السعر النهائي

    useEffect(() => {
        if (!tenantId) {
            navigate('/register');
            return;
        }

        sessionStorage.setItem('pendingTenantId', tenantId);

        const urlParams = new URLSearchParams(window.location.search);
        const paymentIdFromUrl = urlParams.get('id');
        const statusFromUrl = urlParams.get('status');
        const messageFromUrl = urlParams.get('message');

        if (paymentIdFromUrl) {
            if (statusFromUrl === 'paid') {
                verifyPayment(paymentIdFromUrl, tenantId);
            } else {
                setError(`فشلت العملية: ${messageFromUrl || 'مرفوضة من البنك'}`);
            }
            window.history.replaceState(null, '', window.location.pathname);
            return;
        }

        if (!isLoadingPricing && window.Moyasar && document.querySelector('.mysr-form')) {
            document.querySelector('.mysr-form').innerHTML = '';

            // إذا كان السعر 0 (بسبب كوبون 100% مثلاً)، نتخطى ميسر
            if (currentPrice === 0) return;

            window.Moyasar.init({
                element: '.mysr-form',
                amount: currentPrice * 100,
                currency: 'SAR',
                description: `اشتراك منصة مقص - ${selectedPlan.name} (${isAnnual ? 'سنوي' : 'شهري'})`,
                publishable_api_key: 'pk_test_8s4X2aBao3nxmiFKLjK6mtXGSPMdr6ipBv7ufZkn',
                callback_url: window.location.href,
                methods: ['creditcard', 'stcpay'],

                on_completed: function (payment) {
                    return new Promise((resolve, reject) => {
                        if (payment.status === 'initiated') { resolve(); return; }
                        if (payment.status !== 'paid') {
                            setError('تم رفض العملية: ' + (payment.source?.message || 'تأكد من بيانات البطاقة'));
                            reject();
                            return;
                        }
                        verifyPayment(payment.id, tenantId).then(resolve).catch(reject);
                    });
                }
            });
        }
    }, [tenantId, navigate, selectedPlanId, isAnnual, currentPrice, isLoadingPricing]);

    const verifyPayment = async (paymentId, tId) => {
        setIsVerifying(true);
        setError('');
        try {
            const res = await API.post('/auth/verify-payment', {
                paymentId: paymentId,
                tenantId: tId,
                plan: selectedPlan.id,
                billingCycle: isAnnual ? 'annual' : 'monthly',
                promoCodeId: appliedPromo?.codeId // 💡 نرسل الكوبون للباك إند لاعتماده
            });

            sessionStorage.removeItem('pendingTenantId');
            localStorage.setItem('token', res.data.token);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ أثناء التحقق من الدفع');
            setIsVerifying(false);
            throw err;
        }
    };

    const handleBankTransferSubmit = async (e) => {
        e.preventDefault();
        setIsSubmittingTransfer(true);
        setError('');
        try {
            await API.post('/auth/submit-bank-transfer', {
                tenantId,
                senderName: transferData.senderName,
                bankName: transferData.bankName,
                plan: selectedPlan.id,
                billingCycle: isAnnual ? 'annual' : 'monthly',
                promoCodeId: appliedPromo?.codeId // 💡 نرسل الكوبون للباك إند لاعتماده
            });

            setSuccessMessage('تم استلام طلب التحويل بنجاح! سيتم مراجعة الحوالة وتفعيل حسابك قريباً.');
            sessionStorage.removeItem('pendingTenantId');
        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ أثناء إرسال بيانات التحويل');
        } finally {
            setIsSubmittingTransfer(false);
        }
    };

    // دالة التفعيل الفوري (في حال كان الكوبون يغطي 100% من المبلغ)
    const handleFreeActivation = async () => {
        setIsSubmittingTransfer(true); // نستخدم نفس الحالة لإظهار اللودينق
        try {
            // هنا نرسل طلب للباك إند ليقوم بتفعيل الحساب فوراً دون ميسر ودون تحويل بنكي
            const res = await API.post('/auth/free-activation', {
                tenantId,
                plan: selectedPlan.id,
                billingCycle: isAnnual ? 'annual' : 'monthly',
                promoCodeId: appliedPromo?.codeId
            });
            sessionStorage.removeItem('pendingTenantId');
            localStorage.setItem('token', res.data.token);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'حدث خطأ أثناء التفعيل المجاني');
        } finally {
            setIsSubmittingTransfer(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('تم النسخ بنجاح! 📋');
    };

    if (isLoadingPricing) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center font-arabic">
                <div className="animate-pulse flex flex-col items-center">
                    <span className="text-4xl mb-3 border-4 border-slate-200 border-t-blue-500 rounded-full w-12 h-12 animate-spin"></span>
                    <p className="text-slate-500 font-bold">جاري تجهيز الباقات المخصصة لك...</p>
                </div>
            </div>
        );
    }

    if (!tenantId) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right">
                <div className="text-center">
                    <span className="text-5xl mb-4 block">⚠️</span>
                    <h2 className="text-xl font-black text-slate-800">بيانات الصالون مفقودة</h2>
                    <button onClick={() => navigate('/register')} className="mt-4 text-blue-600 font-bold underline">العودة للتسجيل</button>
                </div>
            </div>
        );
    }

    if (successMessage) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-arabic text-right">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-10 rounded-[40px] shadow-xl max-w-lg text-center border border-slate-100">
                    <div className="text-7xl mb-6">🏦✅</div>
                    <h2 className="text-2xl font-black text-slate-800 mb-4">تم رفع الطلب بنجاح!</h2>
                    <p className="text-slate-500 font-bold mb-8 leading-relaxed">{successMessage}</p>
                    <button onClick={() => navigate('/login')} className="w-full bg-slate-800 text-white font-black py-4 rounded-2xl hover:bg-slate-700 transition-all shadow-lg shadow-slate-200">
                        العودة لصفحة الدخول
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center py-10 px-4 font-arabic text-right selection:bg-blue-200" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white w-full max-w-[900px] rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col lg:flex-row"
            >
                {/* القسم الأيمن: اختيار الباقة (التسعير) */}
                <div className="lg:w-1/2 bg-slate-900 p-8 text-white relative overflow-hidden flex flex-col justify-center">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -ml-20 -mb-20"></div>

                    <div className="relative z-10">
                        {discount.isActive && (
                            <div className="bg-amber-400 text-amber-950 font-black px-4 py-2 rounded-xl text-center mb-6 text-xs shadow-md animate-pulse">
                                🔥 عرض خاص: {discount.name} - خصم {discount.percentage}%!
                            </div>
                        )}
                        <h2 className="text-3xl font-black mb-6">اختر باقتك 🚀</h2>

                        {/* أزرار التبديل (شهري / سنوي) */}
                        <div className="bg-slate-800 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-700 mb-6">
                            <button
                                onClick={() => setIsAnnual(false)}
                                className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all ${!isAnnual ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                            >
                                شهري
                            </button>
                            <button
                                onClick={() => setIsAnnual(true)}
                                className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${isAnnual ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                            >
                                سنوي <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md">وفر أكثر!</span>
                            </button>
                        </div>

                        <div className="space-y-4">
                            {dynamicPlans.map(plan => (
                                <div
                                    key={plan.id}
                                    onClick={() => setSelectedPlanId(plan.id)}
                                    className={`p-5 rounded-3xl cursor-pointer transition-all border-2 relative ${selectedPlan.id === plan.id ? `bg-${plan.color}-600/20 border-${plan.color}-400 shadow-lg` : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}`}
                                >
                                    {plan.isPopular && <span className="absolute -top-3 -left-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-xl shadow-md rotate-[-5deg]">الأكثر مبيعاً 🔥</span>}

                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="font-black text-lg">{plan.name}</h3>
                                        <div className="text-left flex flex-col items-end">
                                            <div>
                                                {(discount.isActive || appliedPromo) && (
                                                    <span className="text-sm line-through opacity-50 mr-2">
                                                        {isAnnual ? plan.baseMonthly * 10 : plan.baseMonthly}
                                                    </span>
                                                )}
                                                <span className="font-black text-2xl tracking-tight">{Math.round(plan.currentPrice)}</span>
                                                <span className="text-[10px] text-slate-400 font-bold mr-1">ر.س / {isAnnual ? 'سنة' : 'شهر'}</span>
                                            </div>
                                            {isAnnual && !discount.isActive && !appliedPromo && (
                                                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md mt-1">
                                                    تدفع {plan.baseMonthly * 10} بدل {plan.baseMonthly * 12}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ul className="space-y-1.5 mt-2">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                                                <span className={`text-${plan.color}-400`}>✓</span> {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* القسم الأيسر: الدفع */}
                <div className="lg:w-1/2 p-6 md:p-8 flex flex-col justify-center">
                    <div className="mb-6 pb-6 border-b border-slate-100">
                        {/* 💡 إشعار الكوبون المطبق */}
                        {appliedPromo && (
                            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl mb-4 flex justify-between items-center text-emerald-700">
                                <span className="text-xs font-black">🎉 تم تطبيق كود الخصم!</span>
                                <span className="text-[10px] font-bold bg-white px-2 py-1 rounded-md shadow-sm border border-emerald-50">
                                    -{appliedPromo.discountValue}{appliedPromo.discountType === 'percentage' ? '%' : ' ر.س'}
                                </span>
                            </div>
                        )}

                        <p className="font-bold text-slate-400 text-sm mb-1">الإجمالي المطلوب الدفع:</p>
                        <p className="font-black text-slate-800 text-4xl">{currentPrice} <span className="text-lg text-slate-500">ر.س</span></p>
                        {isAnnual && <p className="text-emerald-500 font-bold text-xs mt-2">✨ خصم شهرين إضافيين مجاناً تم تطبيقه!</p>}
                    </div>

                    {/* إذا كان السعر 0 (بسبب كوبون مجاني 100%) */}
                    {currentPrice === 0 ? (
                        <div className="text-center">
                            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl mb-6 text-sm font-bold border border-emerald-100">
                                رائع! اشتراكك أصبح مجانياً بالكامل بفضل الكوبون. 🎁
                            </div>
                            <button
                                onClick={handleFreeActivation}
                                disabled={isSubmittingTransfer}
                                className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50 shadow-xl shadow-emerald-200"
                            >
                                {isSubmittingTransfer ? 'جاري التفعيل...' : 'تفعيل الاشتراك الآن 🚀'}
                            </button>
                        </div>
                    ) : (
                        /* طرق الدفع المعتادة */
                        <>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6 relative">
                                <button
                                    disabled
                                    className="flex-1 py-3 rounded-xl font-black text-xs transition-all text-slate-400 opacity-60 cursor-not-allowed bg-transparent"
                                >
                                    💳 دفع إلكتروني (قريباً)
                                </button>
                                <button
                                    onClick={() => setPaymentMode('transfer')}
                                    className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${paymentMode === 'transfer' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    🏦 تحويل بنكي
                                </button>
                            </div>

                            {error && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 text-red-500 p-4 rounded-2xl mb-6 text-sm font-bold text-center border border-red-100">
                                    {error}
                                </motion.div>
                            )}

                            <AnimatePresence mode="wait">
                                {paymentMode === 'online' && (
                                    <motion.div key="online" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                                        <div className={isVerifying ? 'hidden' : 'block'}>
                                            <div className="mysr-form" dir="ltr"></div>
                                        </div>
                                        {isVerifying && (
                                            <div className="text-center py-10">
                                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="text-4xl mb-4 inline-block">⏳</motion.div>
                                                <h3 className="font-black text-slate-800 text-lg">جاري التحقق من الدفع...</h3>
                                                <p className="text-slate-400 text-xs font-bold mt-2">الرجاء عدم إغلاق هذه الصفحة.</p>
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {paymentMode === 'transfer' && (
                                    <motion.div key="transfer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative">
                                            <h4 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                                                🏦 حسابنا البنكي (البنك الأهلي)
                                            </h4>
                                            <div className="space-y-3 text-sm bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                                    <span className="text-slate-500 font-bold text-[11px]">اسم الحساب:</span>
                                                    <span className="font-black text-slate-800 text-xs">حسام احمد علي الشايب</span>
                                                </div>
                                                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                                    <span className="text-slate-500 font-bold text-[11px]">رقم الحساب:</span>
                                                    <span className="font-black text-slate-800 tracking-widest text-xs" dir="ltr">09352015000108</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-white border border-slate-200 p-2 rounded-xl mt-2">
                                                    <span className="font-black text-slate-800 tracking-widest text-[10px]" dir="ltr">SA02 10000 0009 3520 1500 0108</span>
                                                    <button type="button" onClick={() => copyToClipboard('SA02100000009352015000108')} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-colors" title="نسخ الآيبان">📋</button>
                                                </div>
                                            </div>
                                        </div>

                                        <form onSubmit={handleBankTransferSubmit} className="space-y-4">
                                            <div>
                                                <input
                                                    type="text" required value={transferData.senderName} onChange={(e) => setTransferData({ ...transferData, senderName: e.target.value })}
                                                    placeholder="اسم المحول (كما يظهر في الإيصال)"
                                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-400 font-bold text-slate-700 text-xs transition-all focus:bg-white"
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="text" required value={transferData.bankName} onChange={(e) => setTransferData({ ...transferData, bankName: e.target.value })}
                                                    placeholder="البنك المحول منه (مثال: الراجحي)"
                                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-400 font-bold text-slate-700 text-xs transition-all focus:bg-white"
                                                />
                                            </div>
                                            <button type="submit" disabled={isSubmittingTransfer} className="w-full bg-slate-800 text-white font-black py-4 rounded-2xl hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50 mt-2 shadow-xl shadow-slate-200">
                                                {isSubmittingTransfer ? 'جاري إرسال الطلب...' : `تأكيد الإرسال ودفع ${currentPrice} ر.س`}
                                            </button>
                                        </form>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default PaymentScreen;