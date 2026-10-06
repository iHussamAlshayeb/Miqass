import React, { useState } from 'react';
import API from '../../services/api';
import {
    BarChart3,
    CalendarDays,
    ClipboardList,
    Copy,
    CreditCard,
    ExternalLink,
    Headphones,
    LayoutDashboard,
    Lock,
    Megaphone,
    Monitor,
    Package,
    Receipt,
    Settings,
    Smartphone,
    Star,
    UsersRound,
    WalletCards,
    X,
} from 'lucide-react';
import UpgradeModal from './UpgradeModal';

const navSections = [
    {
        title: 'التشغيل',
        items: [
            { id: 'statistics', label: 'لوحة الأداء', icon: BarChart3 },
            { id: 'appointments', label: 'مواعيد اليوم', icon: CalendarDays, metric: 'todayBooked' },
            { id: 'all', label: 'سجل الحجوزات', icon: ClipboardList, metric: 'upcoming' },
        ],
    },
    {
        title: 'الإدارة المالية',
        items: [
            { id: 'sales', label: 'نقطة البيع', icon: Receipt },
            { id: 'products', label: 'المنتجات والمخزون', icon: Package },
            { id: 'expenses', label: 'المصروفات', icon: WalletCards },
        ],
    },
    {
        title: 'العلاقات والنظام',
        items: [
            { id: 'reviews', label: 'التقييمات', icon: Star },
            { id: 'customers', label: 'العملاء والولاء', icon: UsersRound },
            { id: 'broadcasts', label: 'الحملات', icon: Megaphone, premium: true },
            { id: 'settings', label: 'الإعدادات', icon: Settings },
            { id: 'billing', label: 'الاشتراك', icon: CreditCard },
        ],
    },
];

const Sidebar = ({
    activeTab,
    setActiveTab,
    appointments,
    allAppointments,
    apiStatus,
    whatsappSettings,
    slug,
    subscription,
    salonName,
    logoUrl,
    isOpen,
    onClose,
}) => {
    const [upsellConfig, setUpsellConfig] = useState({ isOpen: false, featureName: '', requiredPlan: '', icon: '' });
    const currentPlan = subscription?.plan || 'Free';
    const todayBooked = appointments?.filter((appointment) => appointment.status === 'Booked').length || 0;
    const upcomingCount = allAppointments?.length || 0;

    const metrics = {
        todayBooked,
        upcoming: upcomingCount,
    };

    const selectTab = (item) => {
        if (item.premium && currentPlan !== 'Premium') {
            setUpsellConfig({
                isOpen: true,
                featureName: 'حملات الواتساب التسويقية',
                requiredPlan: 'Premium',
                icon: 'Premium',
            });
            return;
        }

        setActiveTab(item.id);
        onClose?.();
    };

    // يفتح الكشك على هذا الجهاز بعد تفعيله، ليعرض الأسماء المحفوظة للعملاء دون رمز تحقق
    const openKiosk = async () => {
        if (currentPlan !== 'Premium') {
            setUpsellConfig({ isOpen: true, featureName: 'وضع الكشك', requiredPlan: 'Premium', icon: 'Premium' });
            return;
        }
        const kioskWindow = window.open('', '_blank');
        try {
            const res = await API.post('/appointments/kiosk/activate');
            const url = `/kiosk/${slug}#activate=${encodeURIComponent(res.data.token)}`;
            if (kioskWindow) kioskWindow.location.href = url;
            else window.location.href = url;
        } catch {
            kioskWindow?.close();
            alert('تعذر تفعيل جهاز الكشك، حاول مرة أخرى.');
        }
    };

    const copyLink = async (value, successMessage) => {
        await navigator.clipboard.writeText(value);
        alert(successMessage);
    };

    const openPremiumLink = (url, featureName) => {
        if (currentPlan !== 'Premium') {
            setUpsellConfig({
                isOpen: true,
                featureName,
                requiredPlan: 'Premium',
                icon: 'Premium',
            });
            return;
        }

        window.open(url, '_blank');
    };

    return (
        <>
            <aside
                className={`fixed inset-y-0 right-0 z-[90] flex h-dvh w-[min(88vw,320px)] flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-20 lg:w-72 lg:translate-x-0 lg:shadow-none ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                            {logoUrl ? (
                                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <LayoutDashboard size={20} className="text-slate-700" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{salonName || 'إدارة الصالون'}</p>
                            <p className="text-xs font-bold text-slate-500">{currentPlan}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 lg:hidden"
                        aria-label="إغلاق القائمة"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-4">
                    <nav className="tour-tabs space-y-5">
                        {navSections.map((section) => (
                            <section key={section.title}>
                                <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{section.title}</p>
                                <div className="space-y-1">
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = activeTab === item.id;
                                        const isLocked = item.premium && currentPlan !== 'Premium';
                                        const metric = item.metric ? metrics[item.metric] : null;

                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => selectTab(item)}
                                                className={`group flex h-11 w-full items-center justify-between rounded-lg px-3 text-sm font-black transition-colors ${isActive
                                                    ? 'bg-slate-900 text-white'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                                    }`}
                                            >
                                                <span className="flex min-w-0 items-center gap-3">
                                                    <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'} />
                                                    <span className="truncate">{item.label}</span>
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    {metric !== null && (
                                                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-black ${isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                            {metric}
                                                        </span>
                                                    )}
                                                    {isLocked && <Lock size={14} className={isActive ? 'text-white' : 'text-slate-400'} />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </nav>

                    <div className="tour-stats mt-5 grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-black text-slate-500">بانتظار الخدمة</p>
                            <p className="mt-1 text-2xl font-black text-slate-900">{todayBooked}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-black text-slate-500">حجوزات قادمة</p>
                            <p className="mt-1 text-2xl font-black text-slate-900">{upcomingCount}</p>
                        </div>
                    </div>

                    <div className="tour-whatsapp mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-black">
                            <span className="text-slate-500">حالة النظام</span>
                            <span className={`rounded-md px-2 py-1 ${apiStatus === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {apiStatus === 'ONLINE' ? 'متصل' : 'تحقق'}
                            </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs font-black">
                            <span className="text-slate-500">الواتساب</span>
                            <span className={`rounded-md px-2 py-1 ${whatsappSettings?.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                {whatsappSettings?.isEnabled ? 'مفعل' : 'معطل'}
                            </span>
                        </div>
                    </div>

                    {slug && (
                        <div className="tour-link mt-4 rounded-lg border border-slate-200 bg-white p-3">
                            <p className="mb-3 text-xs font-black text-slate-500">روابط سريعة</p>
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => copyLink(`https://www.miqass.app/${slug}`, 'تم نسخ رابط الحجز للعملاء.')}
                                    className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                                >
                                    <span>رابط الحجز</span>
                                    <Copy size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openPremiumLink(`/tv/${slug}`, 'شاشة التلفزيون التفاعلية')}
                                    className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                                >
                                    <span>شاشة الانتظار</span>
                                    <Monitor size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={openKiosk}
                                    title="يفتح الكشك على هذا الجهاز ويفعّله لعرض الأسماء المحفوظة للعملاء"
                                    className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                                >
                                    <span>بوابة الكشك</span>
                                    <Smartphone size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (currentPlan !== 'Premium') {
                                            openPremiumLink('', 'بوابة الطاقم');
                                            return;
                                        }
                                        copyLink(`https://www.miqass.app/barber/${slug}`, 'تم نسخ رابط بوابة الطاقم.');
                                    }}
                                    className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                                >
                                    <span>بوابة الطاقم</span>
                                    <ExternalLink size={15} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-200 p-3">
                    <a
                        href="https://wa.me/966541993290"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-800"
                    >
                        <Headphones size={17} />
                        الدعم الفني
                    </a>
                </div>
            </aside>

            <UpgradeModal
                isOpen={upsellConfig.isOpen}
                onClose={() => setUpsellConfig({ ...upsellConfig, isOpen: false })}
                requiredPlan={upsellConfig.requiredPlan}
                featureName={upsellConfig.featureName}
                featureIcon={upsellConfig.icon}
            />
        </>
    );
};

export default Sidebar;
