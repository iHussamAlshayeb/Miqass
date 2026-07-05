import React from 'react';
import { CheckCircle2, FileText, Link2, LockKeyhole, Unplug } from 'lucide-react';

const ZatcaSection = ({
    settings,
    taxNumber,
    setTaxNumber,
    zatcaOtp,
    setZatcaOtp,
    isOnboardingZatca,
    handleZatcaOnboard,
    handleZatcaDisconnect,
    currentPlan,
    setUpsellConfig,
}) => {
    const isLocked = currentPlan === 'Free';

    return (
        <section className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                        <FileText size={18} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-800">الفوترة الإلكترونية ZATCA</h3>
                        <p className="text-xs font-bold text-slate-500 mt-1">
                            تفعيل الفواتير الضريبية المبسطة المتوافقة مع هيئة الزكاة والضريبة والجمارك.
                        </p>
                    </div>
                </div>
                {settings.isZatcaOnboarded && (
                    <span className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg font-black text-xs border border-emerald-100">
                        <CheckCircle2 size={15} />
                        الجهاز متصل
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-100">
                    <label className="block text-sm font-black text-slate-800 mb-2">الرقم الضريبي للمنشأة</label>
                    <input
                        type="text"
                        maxLength="15"
                        placeholder="310000000000003"
                        value={taxNumber}
                        onChange={(event) => setTaxNumber(event.target.value.replace(/\D/g, ''))}
                        disabled={settings.isZatcaOnboarded}
                        className="w-full p-4 bg-white border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60 transition-all text-left tracking-[0.2em]"
                        dir="ltr"
                    />
                    <p className="text-[10px] text-slate-400 font-bold mt-3 leading-relaxed">15 رقماً يبدأ بـ 3 وينتهي بـ 3.</p>
                </div>

                <div
                    className="bg-slate-50/70 p-4 rounded-lg border border-slate-100 relative overflow-hidden"
                    onClick={() => {
                        if (isLocked) setUpsellConfig({ isOpen: true, featureName: 'الربط المباشر مع ZATCA', requiredPlan: 'Pro' });
                    }}
                >
                    {isLocked && (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] z-10 flex items-center justify-center p-4">
                            <span className="inline-flex items-center gap-2 bg-slate-900 text-white font-black px-4 py-2 rounded-lg shadow-lg text-xs">
                                <LockKeyhole size={14} />
                                يتطلب باقة Pro
                            </span>
                        </div>
                    )}

                    <label className="block text-sm font-black text-slate-800 mb-3">الربط المباشر مع منصة فاتورة</label>

                    {settings.isZatcaOnboarded ? (
                        <div className="bg-white p-4 rounded-lg border border-emerald-100 flex flex-col items-center justify-center gap-3">
                            <div className="text-center">
                                <p className="text-emerald-700 font-black text-sm">تم ربط جهاز الصالون بنجاح</p>
                                <p className="text-[10px] text-emerald-600 mt-1 font-bold">تُرفع الفواتير للزكاة تلقائياً.</p>
                            </div>

                            <button
                                type="button"
                                onClick={handleZatcaDisconnect}
                                className="bg-white text-red-600 border border-red-200 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-xs font-black transition-all active:scale-95 flex items-center gap-2 w-full justify-center shadow-sm"
                            >
                                <Unplug size={14} />
                                إلغاء الربط ومسح المفاتيح
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    maxLength="6"
                                    value={zatcaOtp}
                                    onChange={(event) => setZatcaOtp(event.target.value.replace(/\D/g, ''))}
                                    disabled={isLocked}
                                    placeholder="رمز OTP"
                                    className="w-full py-4 pr-4 pl-28 bg-white border border-slate-200 rounded-lg font-black text-left tracking-[0.5em] text-blue-900 outline-none focus:border-blue-500 transition-all"
                                    dir="ltr"
                                />
                                <button
                                    type="button"
                                    onClick={handleZatcaOnboard}
                                    disabled={isLocked || isOnboardingZatca || !zatcaOtp || !taxNumber}
                                    className="absolute left-2 top-2 bottom-2 bg-blue-600 text-white font-black px-5 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 transition-all text-sm shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Link2 size={14} />
                                    {isOnboardingZatca ? 'جاري' : 'ربط'}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">احصل على الرمز من بوابة فاتورة.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default ZatcaSection;
