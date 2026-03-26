import React, { useState } from 'react';
import { motion } from 'framer-motion';
import UpgradeModal from './UpgradeModal';

const Sidebar = ({
    activeTab,
    setActiveTab,
    appointments,
    allAppointments,
    apiStatus,
    whatsappSettings,
    slug,
    subscription
}) => {

    const [upsellConfig, setUpsellConfig] = useState({ isOpen: false, featureName: '', requiredPlan: '', icon: '' });
    const currentPlan = subscription?.plan || 'Free';

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-3 space-y-6 relative"
        >
            {/* 1. أزرار التنقل (التبويبات) */}
            <div className="tour-tabs bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-2">

                {/* 💡 التبويب الجديد للإحصائيات */}
                <button
                    onClick={() => setActiveTab('statistics')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'statistics'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">📊</span> الإحصائيات والأداء
                </button>

                <button
                    onClick={() => setActiveTab('appointments')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'appointments'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">📅</span> مواعيد اليوم
                </button>

                <button
                    onClick={() => setActiveTab('all')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'all'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">📋</span> السجل الشامل
                </button>

                <button
                    onClick={() => setActiveTab('reviews')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'reviews'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">⭐</span> تقييمات العملاء
                </button>

                <button
                    onClick={() => setActiveTab('customers')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'customers'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">👥</span> العملاء والولاء
                </button>

                <button
                    onClick={() => {
                        if (currentPlan === 'Premium') {
                            setActiveTab('broadcasts');
                        } else {
                            setUpsellConfig({ isOpen: true, featureName: 'حملات الواتساب التسويقية', requiredPlan: 'Premium', icon: '📢' });
                        }
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl font-black transition-all ${activeTab === 'broadcasts'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xl">📢</span> حملات الواتساب
                    </div>
                    {currentPlan !== 'Premium' && <span className="text-xs opacity-60">🔒</span>}
                </button>

                <button
                    onClick={() => setActiveTab('settings')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'settings'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">⚙️</span> إعدادات النظام
                </button>

                <button
                    onClick={() => setActiveTab('billing')}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl font-black transition-all ${activeTab === 'billing'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                >
                    <span className="text-xl">💳</span> حالة الاشتراك
                </button>
            </div>

            {/* 2. الإحصائيات السريعة */}
            <div className="tour-stats grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-3xl shadow-md text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <p className="font-bold opacity-90 text-xs z-10">بانتظار المقص ✂️</p>
                    <h3 className="text-3xl font-black mt-2 z-10">
                        {appointments?.filter(a => a.status === 'Booked').length || 0}
                    </h3>
                </div>
                <div className="bg-gradient-to-br from-pink-500 to-rose-500 p-5 rounded-3xl shadow-md text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -ml-10 -mb-10"></div>
                    <p className="font-bold opacity-90 text-xs z-10">حجوزات قادمة 🗓️</p>
                    <h3 className="text-3xl font-black mt-2 z-10">
                        {allAppointments?.length || 0}
                    </h3>
                </div>
            </div>

            {/* 3. حالة الواتساب */}
            <div className="tour-whatsapp bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${whatsappSettings?.isEnabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                        <span className={`block h-3 w-3 rounded-full ${whatsappSettings?.isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                    </div>
                    <span className="font-bold text-slate-600 text-sm">خدمة الواتساب</span>
                </div>
                <span className={`font-black text-xs px-2 py-1 rounded-full ${whatsappSettings?.isEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {whatsappSettings?.isEnabled ? 'مفعل' : 'معطل'}
                </span>
            </div>

            {/* 4. الروابط السريعة */}
            {slug && (
                <div className="tour-link bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-3">
                    <p className="text-xs font-bold text-slate-400 mb-1">الروابط الذكية:</p>

                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(`https://miqass.app/${slug}`);
                            alert('تم نسخ رابط الحجز للعملاء! 🔗');
                        }}
                        className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold text-sm hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                        <span>🔗</span> نسخ رابط الحجز
                    </button>

                    <button
                        onClick={() => {
                            if (currentPlan === 'Premium') {
                                window.open(`/tv/${slug}`, '_blank');
                            } else {
                                setUpsellConfig({ isOpen: true, featureName: 'شاشة التلفزيون التفاعلية (TV Queue)', requiredPlan: 'Premium', icon: '📺' });
                            }
                        }}
                        className={`w-full p-3 rounded-xl font-black text-sm transition-all flex items-center justify-between shadow-sm border
                            ${currentPlan === 'Premium' ? 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100' : 'bg-slate-50 text-slate-400 border-slate-200 opacity-80'}`}
                    >
                        <div className="flex items-center gap-2"><span>📺</span> شاشة التلفزيون (TV Mode)</div>
                        {currentPlan !== 'Premium' && <span>🔒</span>}
                    </button>

                    <button
                        onClick={() => {
                            if (currentPlan === 'Premium') {
                                window.open(`/kiosk/${slug}`, '_blank');
                            } else {
                                setUpsellConfig({ isOpen: true, featureName: 'وضع الكشك (الاستقبال)', requiredPlan: 'Premium', icon: '🖥️' });
                            }
                        }}
                        className={`w-full p-3 rounded-xl font-black text-sm transition-all flex items-center justify-between shadow-sm border
                            ${currentPlan === 'Premium' ? 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' : 'bg-slate-50 text-slate-400 border-slate-200 opacity-80'}`}
                    >
                        <div className="flex items-center gap-2"><span>🖥️</span> وضع الكشك (للآيباد)</div>
                        {currentPlan !== 'Premium' && <span>🔒</span>}
                    </button>

                    <button
                        onClick={() => {
                            if (currentPlan === 'Premium') {
                                navigator.clipboard.writeText(`https://miqass.app/barber/${slug}`);
                                alert('تم نسخ رابط بوابة الحلاقين! أرسله لطاقمك 📱');
                            } else {
                                setUpsellConfig({ isOpen: true, featureName: 'بوابة الطاقم (Barber Portal)', requiredPlan: 'Premium', icon: '📱' });
                            }
                        }}
                        className={`w-full p-3 rounded-xl font-black text-sm transition-all flex items-center justify-between shadow-sm border
                            ${currentPlan === 'Premium' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200 opacity-80'}`}
                    >
                        <div className="flex items-center gap-2"><span>👨‍💈</span> رابط بوابة الطاقم</div>
                        {currentPlan !== 'Premium' && <span>🔒</span>}
                    </button>
                </div>
            )}

            <UpgradeModal
                isOpen={upsellConfig.isOpen}
                onClose={() => setUpsellConfig({ ...upsellConfig, isOpen: false })}
                requiredPlan={upsellConfig.requiredPlan}
                featureName={upsellConfig.featureName}
                featureIcon={upsellConfig.icon}
            />

        </motion.div>
    );
};

export default Sidebar;