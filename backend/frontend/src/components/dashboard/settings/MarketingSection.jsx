import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MarketingSection = ({ settings, setSettings, currentPlan, setUpsellConfig }) => {
    return (
        <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                <span className="text-purple-500">5.</span> التسويق الذكي والولاء 🎯
            </h3>

            <div className="flex flex-col gap-4">
                {/* 1. التقييمات وخرائط جوجل */}
                <div className={`rounded-3xl border transition-all duration-300 ${settings.enableGoogleReviews ? 'border-yellow-300 bg-yellow-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                    <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer"
                        onClick={() => {
                            if (currentPlan === 'Free') setUpsellConfig({ isOpen: true, featureName: 'التقييمات الذكية', requiredPlan: 'Pro', icon: '⭐' });
                            else setSettings({ ...settings, enableGoogleReviews: !settings.enableGoogleReviews });
                        }}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-colors ${settings.enableGoogleReviews ? 'bg-yellow-100' : 'bg-white border border-slate-200'}`}>⭐</div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-black text-slate-800">فلترة التقييمات وخرائط جوجل</h4>
                                    {currentPlan === 'Free' && <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1">باقة Pro 🔒</span>}
                                </div>
                                <p className="text-xs text-slate-500 font-bold">توجيه التقييمات الإيجابية (4 و 5 نجوم) فقط آلياً لحسابك في Google Maps.</p>
                            </div>
                        </div>
                        <div className="flex-shrink-0 self-end md:self-auto mr-16 md:mr-0 pointer-events-none">
                            <div className="relative inline-flex items-center">
                                <input type="checkbox" className="sr-only peer" checked={settings.enableGoogleReviews || false} readOnly />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400"></div>
                            </div>
                        </div>
                    </div>
                    <AnimatePresence>
                        {settings.enableGoogleReviews && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="px-5 pb-5 pt-2 border-t border-yellow-200/50 mt-2">
                                    <label className="block text-xs font-black text-yellow-800 mb-2">🔗 رابط التقييم المباشر (Google Review Link)</label>
                                    <input type="url" value={settings.googleReviewLink || ''} onChange={(e) => setSettings({ ...settings, googleReviewLink: e.target.value })} className="w-full p-3.5 bg-white border border-yellow-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition-all" placeholder="https://g.page/r/YOUR_ID/review" dir="ltr" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 2. نظام الولاء */}
                <div className={`rounded-3xl border transition-all duration-300 ${settings.isLoyaltyEnabled ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                    <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer"
                        onClick={() => {
                            if (currentPlan === 'Free') setUpsellConfig({ isOpen: true, featureName: 'نظام الولاء', requiredPlan: 'Pro', icon: '🎁' });
                            else setSettings({ ...settings, isLoyaltyEnabled: !settings.isLoyaltyEnabled });
                        }}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-colors ${settings.isLoyaltyEnabled ? 'bg-indigo-100' : 'bg-white border border-slate-200'}`}>🎁</div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-black text-slate-800">نظام الولاء والمكافآت</h4>
                                    {currentPlan === 'Free' && <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1">باقة Pro 🔒</span>}
                                </div>
                                <p className="text-xs text-slate-500 font-bold">إرسال رسالة "حلاقة مجانية" للعميل آلياً بعد عدد معين من الزيارات.</p>
                            </div>
                        </div>
                        <div className="flex-shrink-0 self-end md:self-auto mr-16 md:mr-0 pointer-events-none">
                            <div className="relative inline-flex items-center">
                                <input type="checkbox" className="sr-only peer" checked={settings.isLoyaltyEnabled || false} readOnly />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                            </div>
                        </div>
                    </div>
                    <AnimatePresence>
                        {settings.isLoyaltyEnabled && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="px-5 pb-5 pt-2 border-t border-indigo-200/50 mt-2">
                                    <label className="block text-xs font-black text-indigo-800 mb-2">عدد الزيارات المطلوبة للحصول على الهدية</label>
                                    <div className="flex items-center gap-3">
                                        <input type="number" min="2" max="20" value={settings.loyaltyVisitsRequired || 5} onChange={(e) => setSettings({ ...settings, loyaltyVisitsRequired: parseInt(e.target.value) })} className="w-32 p-3.5 bg-white border border-indigo-200 rounded-xl text-sm font-black text-center text-indigo-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
                                        <span className="text-sm font-bold text-slate-500">زيارات</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 3. إعادة الاستهداف */}
                <div className={`rounded-3xl border transition-all duration-300 ${settings.isRetentionEnabled ? 'border-purple-300 bg-purple-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                    <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer"
                        onClick={() => {
                            if (currentPlan !== 'Premium') setUpsellConfig({ isOpen: true, featureName: 'رسائل الاستهداف', requiredPlan: 'Premium', icon: '🎯' });
                            else setSettings({ ...settings, isRetentionEnabled: !settings.isRetentionEnabled });
                        }}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-colors ${settings.isRetentionEnabled ? 'bg-purple-100' : 'bg-white border border-slate-200'}`}>🎯</div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-black text-slate-800">إعادة الاستهداف (اشتقنالك)</h4>
                                    {currentPlan !== 'Premium' && <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-md font-black flex items-center gap-1">Premium 👑</span>}
                                </div>
                                <p className="text-xs text-slate-500 font-bold">إرسال واتساب آلي للعميل الذي انقطع فترة طويلة لتذكيره بالحجز.</p>
                            </div>
                        </div>
                        <div className="flex-shrink-0 self-end md:self-auto mr-16 md:mr-0 pointer-events-none">
                            <div className="relative inline-flex items-center">
                                <input type="checkbox" className="sr-only peer" checked={settings.isRetentionEnabled || false} readOnly />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                            </div>
                        </div>
                    </div>
                    <AnimatePresence>
                        {settings.isRetentionEnabled && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="px-5 pb-5 pt-2 border-t border-purple-200/50 mt-2">
                                    <label className="block text-xs font-black text-purple-800 mb-2">إرسال الرسالة بعد انقطاع العميل لمدة:</label>
                                    <div className="flex items-center gap-3">
                                        <input type="number" min="10" max="90" value={settings.retentionDays || 30} onChange={(e) => setSettings({ ...settings, retentionDays: parseInt(e.target.value) })} className="w-32 p-3.5 bg-white border border-purple-200 rounded-xl text-sm font-black text-center text-purple-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all" />
                                        <span className="text-sm font-bold text-slate-500">يوماً</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
};

export default MarketingSection;