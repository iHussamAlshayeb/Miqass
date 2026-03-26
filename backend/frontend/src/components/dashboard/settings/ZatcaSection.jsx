import React from 'react';

const ZatcaSection = ({
    settings,
    taxNumber,
    setTaxNumber,
    zatcaOtp,
    setZatcaOtp,
    isOnboardingZatca,
    handleZatcaOnboard,
    handleZatcaDisconnect, // 💡 الخاصية الجديدة لمسح بيانات الربط
    currentPlan,
    setUpsellConfig
}) => {
    return (
        <section className="bg-gradient-to-bl from-blue-50 to-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-blue-100 relative overflow-hidden">
            <div className="absolute -top-10 -left-10 text-9xl opacity-5 pointer-events-none">🧾</div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-blue-100 pb-4 relative z-10">
                <div>
                    <h3 className="text-lg font-black text-blue-900 flex items-center gap-2">
                        <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-sm">3.</span> الفوترة الإلكترونية (ZATCA) 🇸🇦
                    </h3>
                    <p className="text-xs font-bold text-blue-700/70 mt-1">تفعيل الفواتير الضريبية المبسطة المتوافقة مع هيئة الزكاة والضريبة والجمارك.</p>
                </div>
                {settings.isZatcaOnboarded && (
                    <span className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-xs flex items-center gap-2 shadow-md animate-pulse">
                        ✅ الجهاز متصل (المرحلة 2)
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">

                {/* 1. الكارد الأول: الرقم الضريبي */}
                <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm">
                    <label className="block text-sm font-black text-slate-800 mb-2">الرقم الضريبي للمنشأة</label>
                    <input
                        type="text"
                        maxLength="15"
                        placeholder="310000000000003"
                        value={taxNumber}
                        onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, ''))}
                        disabled={settings.isZatcaOnboarded}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60 transition-all text-left tracking-[0.2em]"
                        dir="ltr"
                    />
                    <p className="text-[10px] text-slate-400 font-bold mt-3 leading-relaxed">* 15 رقماً يبدأ بـ 3 وينتهي بـ 3.</p>
                </div>

                {/* 2. الكارد الثاني: الربط وإلغاء الربط */}
                <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group cursor-pointer" onClick={() => { if (currentPlan === 'Free') setUpsellConfig({ isOpen: true, featureName: 'الربط المباشر (ZATCA Phase 2)', requiredPlan: 'Pro', icon: '🔌' }); }}>
                    {currentPlan === 'Free' && <div className="absolute top-0 left-0 w-full h-full bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center"><span className="bg-slate-800 text-white font-black px-4 py-2 rounded-xl shadow-lg flex items-center gap-2">🔒 يتطلب باقة Pro</span></div>}

                    <label className="block text-sm font-black text-slate-800 mb-3">الربط المباشر مع منصة (فاتورة)</label>

                    {settings.isZatcaOnboarded ? (
                        // 💡 التعديل هنا: واجهة حالة الاتصال مع زر الإلغاء
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col items-center justify-center gap-3">
                            <div className="text-center">
                                <p className="text-emerald-700 font-black text-sm">تم ربط جهاز الصالون بنجاح 🚀</p>
                                <p className="text-[10px] text-emerald-600 mt-1 font-bold">تُرفع الفواتير للزكاة تلقائياً بصمت.</p>
                            </div>

                            <button
                                type="button"
                                onClick={handleZatcaDisconnect}
                                className="bg-white text-red-600 border border-red-200 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-xs font-black transition-all active:scale-95 flex items-center gap-1 w-full justify-center shadow-sm"
                            >
                                إلغاء الربط ومسح المفاتيح 🛑
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    maxLength="6"
                                    value={zatcaOtp}
                                    onChange={(e) => setZatcaOtp(e.target.value.replace(/\D/g, ''))}
                                    disabled={currentPlan === 'Free'}
                                    placeholder="رمز OTP"
                                    className="w-full py-4 pr-4 pl-28 bg-slate-50 border border-slate-200 rounded-xl font-black text-left tracking-[0.5em] text-blue-900 outline-none focus:border-blue-500 transition-all"
                                    dir="ltr"
                                />
                                <button
                                    type="button"
                                    onClick={handleZatcaOnboard}
                                    disabled={currentPlan === 'Free' || isOnboardingZatca || !zatcaOtp || !taxNumber}
                                    className="absolute left-2 top-2 bottom-2 bg-blue-600 text-white font-black px-6 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 transition-all text-sm shadow-sm flex items-center justify-center"
                                >
                                    {isOnboardingZatca ? 'جاري...' : 'ربط 🔗'}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">* احصل على الرمز من بوابة (فاتورة).</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default ZatcaSection;