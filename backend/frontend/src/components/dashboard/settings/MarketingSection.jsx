import React from 'react';
import { Gift, LockKeyhole, MousePointerClick, Star, Target } from 'lucide-react';

const ToggleSwitch = ({ checked }) => (
    <div className="relative inline-flex items-center">
        <input type="checkbox" className="sr-only peer" checked={checked || false} readOnly />
        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-slate-900 after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border after:border-slate-200 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:-translate-x-full" />
    </div>
);

const FeatureRow = ({ icon: Icon, title, description, lockedLabel, checked, onClick, children }) => (
    <div className={`rounded-lg border transition-colors ${checked ? 'border-slate-300 bg-white' : 'border-slate-100 bg-slate-50/60'}`}>
        <button
            type="button"
            className="w-full p-4 sm:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-right"
            onClick={onClick}
        >
            <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${checked ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                    {React.createElement(Icon, { size: 19 })}
                </div>
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="font-black text-slate-800">{title}</h4>
                        {lockedLabel && (
                            <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-md font-black">
                                <LockKeyhole size={11} />
                                {lockedLabel}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 font-bold leading-relaxed">{description}</p>
                </div>
            </div>
            <div className="shrink-0 self-end md:self-auto pointer-events-none">
                <ToggleSwitch checked={checked} />
            </div>
        </button>
        {children}
    </div>
);

const MarketingSection = ({ settings, setSettings, currentPlan, setUpsellConfig }) => {
    const openUpsell = (featureName, requiredPlan) => {
        setUpsellConfig({ isOpen: true, featureName, requiredPlan });
    };

    return (
        <section className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-5">
                <MousePointerClick size={18} className="text-slate-500" />
                <h3 className="text-lg font-black text-slate-800">رسائل إضافية</h3>
            </div>

            <div className="flex flex-col gap-4">
                <FeatureRow
                    icon={Star}
                    title="فلترة التقييمات وخرائط جوجل"
                    description="توجيه التقييمات الإيجابية فقط إلى رابط Google Reviews."
                    lockedLabel={currentPlan === 'Free' ? 'Pro' : ''}
                    checked={settings.enableGoogleReviews}
                    onClick={() => {
                        if (currentPlan === 'Free') openUpsell('التقييمات الذكية', 'Pro');
                        else setSettings({ ...settings, enableGoogleReviews: !settings.enableGoogleReviews });
                    }}
                >
                    {settings.enableGoogleReviews && (
                        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-slate-100">
                            <label className="block text-xs font-black text-slate-600 mb-2">رابط التقييم المباشر</label>
                            <input
                                type="text"
                                inputMode="url"
                                value={settings.googleReviewLink || ''}
                                onChange={(event) => setSettings({ ...settings, googleReviewLink: event.target.value })}
                                className="w-full p-3.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                                placeholder="https://g.page/r/YOUR_ID/review"
                                dir="ltr"
                            />
                        </div>
                    )}
                </FeatureRow>

                <FeatureRow
                    icon={Gift}
                    title="نظام الولاء والمكافآت"
                    description="إرسال مكافأة تلقائية للعميل بعد عدد محدد من الزيارات."
                    lockedLabel={currentPlan === 'Free' ? 'Pro' : ''}
                    checked={settings.isLoyaltyEnabled}
                    onClick={() => {
                        if (currentPlan === 'Free') openUpsell('نظام الولاء', 'Pro');
                        else setSettings({ ...settings, isLoyaltyEnabled: !settings.isLoyaltyEnabled });
                    }}
                >
                    {settings.isLoyaltyEnabled && (
                        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-slate-100">
                            <label className="block text-xs font-black text-slate-600 mb-2">عدد الزيارات المطلوبة للمكافأة</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="2"
                                    max="20"
                                    value={settings.loyaltyVisitsRequired || 5}
                                    onChange={(event) => setSettings({ ...settings, loyaltyVisitsRequired: parseInt(event.target.value) })}
                                    className="w-32 p-3.5 bg-white border border-slate-200 rounded-lg text-sm font-black text-center text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                                />
                                <span className="text-sm font-bold text-slate-500">زيارات</span>
                            </div>
                        </div>
                    )}
                </FeatureRow>

                <FeatureRow
                    icon={Target}
                    title="إعادة الاستهداف"
                    description="إرسال رسالة تلقائية للعميل المنقطع لتذكيره بالحجز."
                    lockedLabel={currentPlan !== 'Premium' ? 'Premium' : ''}
                    checked={settings.isRetentionEnabled}
                    onClick={() => {
                        if (currentPlan !== 'Premium') openUpsell('رسائل الاستهداف', 'Premium');
                        else setSettings({ ...settings, isRetentionEnabled: !settings.isRetentionEnabled });
                    }}
                >
                    {settings.isRetentionEnabled && (
                        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-slate-100">
                            <label className="block text-xs font-black text-slate-600 mb-2">إرسال الرسالة بعد انقطاع العميل لمدة</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="10"
                                    max="90"
                                    value={settings.retentionDays || 30}
                                    onChange={(event) => setSettings({ ...settings, retentionDays: parseInt(event.target.value) })}
                                    className="w-32 p-3.5 bg-white border border-slate-200 rounded-lg text-sm font-black text-center text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                                />
                                <span className="text-sm font-bold text-slate-500">يوماً</span>
                            </div>
                        </div>
                    )}
                </FeatureRow>
            </div>
        </section>
    );
};

export default MarketingSection;
