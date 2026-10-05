import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
const MotionDiv = motion.div;
import {
    Camera,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    Image as ImageIcon,
    LockKeyhole,
    MapPin,
    MessageCircle,
    Palette,
    Plug,
    Plus,
    RotateCcw,
    Save,
    Scissors,
    Sparkles,
    Smartphone,
    Trash2,
    Unplug,
    X,
} from 'lucide-react';
import API from '../../services/api';
import UpgradeModal from './UpgradeModal';

import ZatcaSection from './settings/ZatcaSection';
import ZakatySection from './settings/ZakatySection';
import MarketingSection from './settings/MarketingSection';

const LEAVE_TYPE_OPTIONS = [
    { value: 'daily', label: 'يوم أسبوعي متكرر' },
    { value: 'weekly', label: 'أسبوع', durationDays: 7 },
    { value: 'monthly', label: 'شهر', durationDays: 30 },
];

const WEEKDAY_OPTIONS = [
    { value: 0, label: 'الأحد' },
    { value: 1, label: 'الإثنين' },
    { value: 2, label: 'الثلاثاء' },
    { value: 3, label: 'الأربعاء' },
    { value: 4, label: 'الخميس' },
    { value: 5, label: 'الجمعة' },
    { value: 6, label: 'السبت' },
];

const SETTINGS_TABS = [
    {
        id: 'identity',
        label: 'الهوية',
        description: 'بيانات المنشأة ومظهر صفحة الحجز',
        icon: Palette,
        activeClass: 'border-blue-500 bg-blue-50 text-blue-700',
        iconClass: 'bg-blue-100 text-blue-700',
    },
    {
        id: 'booking',
        label: 'الحجز',
        description: 'ساعات العمل والاستراحات وأيام الإغلاق',
        icon: Clock3,
        activeClass: 'border-amber-500 bg-amber-50 text-amber-700',
        iconClass: 'bg-amber-100 text-amber-700',
    },
    {
        id: 'team',
        label: 'الفريق والخدمات',
        description: 'الحلاقون والإجازات والخدمات والأسعار',
        icon: Scissors,
        activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-700',
        iconClass: 'bg-emerald-100 text-emerald-700',
    },
    {
        id: 'finance',
        label: 'الدفع والفوترة',
        description: 'العربون والدفع الإلكتروني والفوترة الضريبية',
        icon: CircleDollarSign,
        activeClass: 'border-indigo-500 bg-indigo-50 text-indigo-700',
        iconClass: 'bg-indigo-100 text-indigo-700',
    },
    {
        id: 'marketing',
        label: 'التسويق',
        description: 'التقييمات والولاء وإعادة الاستهداف',
        icon: Sparkles,
        activeClass: 'border-rose-500 bg-rose-50 text-rose-700',
        iconClass: 'bg-rose-100 text-rose-700',
    },
    {
        id: 'integrations',
        label: 'الربط',
        description: 'ربط واتساب ومتابعة حالة الاتصال',
        icon: Plug,
        activeClass: 'border-teal-500 bg-teal-50 text-teal-700',
        iconClass: 'bg-teal-100 text-teal-700',
    },
];

const WHATSAPP_MESSAGE_TYPES = [
    { key: 'confirmation', label: 'تأكيد الحجز', variables: ['اسم_الصالون', 'اسم_العميل', 'التاريخ', 'الوقت', 'الحلاق', 'الموقع', 'رقم_التواصل'] },
    { key: 'reminder', label: 'تذكير الموعد', variables: ['اسم_الصالون', 'اسم_العميل', 'الوقت', 'الحلاق', 'الموقع', 'رقم_التواصل'] },
    { key: 'cancellation', label: 'إلغاء الحجز', variables: ['اسم_الصالون', 'اسم_العميل', 'الحلاق', 'سبب_الإلغاء', 'رابط_الحجز'] },
    { key: 'review', label: 'طلب التقييم', variables: ['اسم_الصالون', 'اسم_العميل', 'رابط_التقييم'] },
    { key: 'loyalty', label: 'مكافأة الولاء', variables: ['اسم_الصالون', 'اسم_العميل', 'رابط_الحجز'] },
    { key: 'retention', label: 'استعادة العملاء', variables: ['اسم_الصالون', 'اسم_العميل', 'رابط_الحجز'] },
];

const buildLeavePeriod = (type, startDate, endDate, weekday) => {
    const option = LEAVE_TYPE_OPTIONS.find((item) => item.value === type);
    if (!option || !startDate) return null;

    if (type === 'daily') {
        const parsedWeekday = Number(weekday);
        if (!endDate || endDate < startDate || !Number.isInteger(parsedWeekday)) return null;

        return { type, startDate, endDate, weekday: parsedWeekday };
    }

    const calculatedEndDate = new Date(`${startDate}T12:00:00`);
    if (Number.isNaN(calculatedEndDate.getTime())) return null;
    calculatedEndDate.setDate(calculatedEndDate.getDate() + option.durationDays - 1);

    return {
        type,
        startDate,
        endDate: `${calculatedEndDate.getFullYear()}-${String(calculatedEndDate.getMonth() + 1).padStart(2, '0')}-${String(calculatedEndDate.getDate()).padStart(2, '0')}`,
    };
};

const formatLeaveDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('ar-SA-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

const SettingsTab = ({
    salonName, setSalonName,
    ownerName, setOwnerName,
    ownerPhone, setOwnerPhone,
    logoUrl, setLogoUrl,
    settings, setSettings,
    handleSaveSettings,
    isSavingSettings,
    newClosedDate, setNewClosedDate,
    barbers, setBarbers,
    subscription,
    services, setServices,
    taxNumber, setTaxNumber,
    bio, setBio,
    socialLinks, setSocialLinks,
    themeColors, setThemeColors,
    paymentSettings, setPaymentSettings
    ,whatsappTemplates, setWhatsappTemplates, whatsappTemplateDefaults
}) => {

    const [newBarberName, setNewBarberName] = useState('');
    const [newBarberPin, setNewBarberPin] = useState('');
    const [leaveDrafts, setLeaveDrafts] = useState({});
    const [activeSettingsTab, setActiveSettingsTab] = useState('identity');
    const [qrCode, setQrCode] = useState('');
    const [waStatus, setWaStatus] = useState('DISCONNECTED');
    const [isWaLoading, setIsWaLoading] = useState(false);
    const [activeMessageType, setActiveMessageType] = useState('confirmation');
    const [isSavingTemplates, setIsSavingTemplates] = useState(false);
    const [templateError, setTemplateError] = useState('');
    const [templateSaved, setTemplateSaved] = useState(false);

    const [upsellConfig, setUpsellConfig] = useState({ isOpen: false, featureName: '', requiredPlan: '' });
    const currentPlan = subscription?.plan || 'Free';
    const fileInputRef = useRef(null);
    const activeTab = SETTINGS_TABS.find((tab) => tab.id === activeSettingsTab) || SETTINGS_TABS[0];

    const [zatcaOtp, setZatcaOtp] = useState('');
    const [isOnboardingZatca, setIsOnboardingZatca] = useState(false);

    const handleZatcaOnboard = async () => {
        if (!taxNumber || taxNumber.length !== 15) return alert('الرجاء كتابة الرقم الضريبي (15 رقم) أولاً!');
        if (!zatcaOtp || zatcaOtp.length !== 6) return alert('الرجاء إدخال رمز OTP صحيح (6 أرقام).');

        setIsOnboardingZatca(true);
        try {
            const res = await API.post('/zatca/onboard', {
                otp: zatcaOtp,
                taxNumber: taxNumber
            });

            alert(res.data.message || 'تم الربط بنجاح.');
            setSettings({ ...settings, isZatcaOnboarded: true });

        } catch (error) {
            alert(error.response?.data?.message || 'حدث خطأ أثناء محاولة الربط بهيئة الزكاة.');
        } finally {
            setIsOnboardingZatca(false);
        }
    };

    const handleZatcaDisconnect = async () => {
        if (!window.confirm("هل أنت متأكد من إلغاء الربط؟ سيتم مسح المفاتيح الضريبية من النظام ولن تتمكن من إرسال الفواتير حتى تقوم بالربط مجدداً.")) {
            return;
        }

        try {
            const res = await API.delete('/zatca/disconnect');
            alert(res.data.message || 'تم إلغاء الربط ومسح المفاتيح بنجاح.');
            setSettings({ ...settings, isZatcaOnboarded: false });
            setZatcaOtp('');
        } catch (error) {
            console.error("خطأ في إلغاء الربط:", error);
            alert(error.response?.data?.message || "حدث خطأ أثناء محاولة إلغاء الربط.");
        }
    };

    useEffect(() => {
        const fetchWaStatus = async () => {
            try {
                const res = await API.get('/whatsapp/session-data');
                if (res.data?.session) {
                    setWaStatus(res.data.session.status);
                    if (res.data.session.qr_code) setQrCode(res.data.session.qr_code);
                }
            } catch { console.log('لا توجد جلسة واتساب نشطة حالياً.'); }
        };
        fetchWaStatus();
    }, []);

    useEffect(() => {
        let interval;
        const pendingStates = ['CREATED', 'STARTING', 'NEED_SCAN', 'SCAN_QR_CODE', 'CONNECTING'];
        const currentStatus = waStatus?.toUpperCase();

        if (pendingStates.includes(currentStatus)) {
            interval = setInterval(async () => {
                try {
                    const res = await API.get(`/whatsapp/session-data?t=${new Date().getTime()}`);
                    if (res.data?.session) {
                        const newStatus = res.data.session.status?.toUpperCase();
                        setWaStatus(newStatus);
                        if (newStatus !== 'CONNECTED' && res.data.session.qr_code) {
                            setQrCode(res.data.session.qr_code);
                        }
                    }
                } catch (error) { console.error('خطأ في تحديث الباركود', error); }
            }, 5000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [waStatus]);

    const handleConnectWhatsapp = async () => {
        setIsWaLoading(true);
        try {
            await API.post('/whatsapp/create-session');
            setWaStatus('STARTING');
            setTimeout(async () => {
                try {
                    const qrRes = await API.get('/whatsapp/session-data');
                    const status = qrRes.data?.session?.status?.toUpperCase();
                    setWaStatus(status);
                    if (qrRes.data?.session?.qr_code) setQrCode(qrRes.data.session.qr_code);
                } catch (err) { console.error(err); }
                setIsWaLoading(false);
            }, 3000);
        } catch {
            alert('حدث خطأ أثناء الاتصال بالخادم، يرجى المحاولة لاحقاً.');
            setIsWaLoading(false);
        }
    };

    const handleDisconnectWhatsapp = async () => {
        if (!window.confirm('هل أنت متأكد من إلغاء ربط الواتساب؟')) return;
        setIsWaLoading(true);
        try {
            await API.post('/whatsapp/disconnect');
            setWaStatus('DISCONNECTED');
            setQrCode('');
        } catch { alert('حدث خطأ أثناء إلغاء الربط.'); }
        finally { setIsWaLoading(false); }
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return alert('حجم الصورة كبير جداً. الحد الأقصى 2 ميجابايت.');

        const reader = new FileReader();
        reader.onloadend = () => setLogoUrl(reader.result);
        reader.readAsDataURL(file);
    };

    const handleAddService = () => setServices([...services, { id: Date.now().toString(), name: '', price: '', duration: 30 }]);
    const handleServiceChange = (id, field, value) => setServices(services.map(srv => srv.id === id ? { ...srv, [field]: value } : srv));
    const handleRemoveService = (id) => setServices(services.filter(srv => srv.id !== id));

    const handleAddBarber = () => {
        const val = newBarberName.trim();
        const pinVal = newBarberPin.trim();
        const currentBarbers = barbers || [];

        if (currentPlan === 'Free' && currentBarbers.length >= 2) return setUpsellConfig({ isOpen: true, featureName: 'أكثر من كرسين', requiredPlan: 'Pro' });
        if (!val) return alert('يرجى كتابة اسم الحلاق!');
        if (pinVal && currentPlan !== 'Premium') return setUpsellConfig({ isOpen: true, featureName: 'بوابة الحلاقين الخاصة (PIN)', requiredPlan: 'Premium' });
        if (pinVal && !/^\d{4,8}$/.test(pinVal)) return alert('رمز PIN يجب أن يكون من 4 إلى 8 أرقام.');

        const exists = currentBarbers.some(b => (typeof b === 'string' ? b : b.name) === val);

        if (!exists) {
            setBarbers([...currentBarbers, { name: val, pin: currentPlan === 'Premium' ? pinVal : "", isActive: true, leaves: [] }]);
            setNewBarberName('');
            setNewBarberPin('');
        }
    };

    const handleSaveTemplates = async () => {
        setTemplateError('');
        setTemplateSaved(false);
        setIsSavingTemplates(true);
        try {
            const res = await API.put('/appointments/settings/whatsapp/templates', { templates: whatsappTemplates });
            setWhatsappTemplates(res.data.templates);
            setTemplateSaved(true);
        } catch (error) {
            setTemplateError(error.response?.data?.message || 'تعذر حفظ الرسائل. حاول مرة أخرى.');
        } finally {
            setIsSavingTemplates(false);
        }
    };

    const updateLeaveDraft = (index, field, value) => {
        setLeaveDrafts((current) => ({
            ...current,
            [index]: {
                type: 'daily',
                startDate: '',
                endDate: '',
                weekday: 0,
                ...current[index],
                [field]: value,
            },
        }));
    };

    const handleAddBarberLeave = (index) => {
        const draft = leaveDrafts[index] || { type: 'daily', startDate: '', endDate: '', weekday: 0 };
        const leave = buildLeavePeriod(draft.type, draft.startDate, draft.endDate, draft.weekday);
        if (!leave) {
            return alert(draft.type === 'daily'
                ? 'اختر يوم الأسبوع وفترة صحيحة للإجازة المتكررة.'
                : 'اختر تاريخ بداية الإجازة.');
        }

        setBarbers((current) => current.map((barber, barberIndex) => {
            if (barberIndex !== index) return barber;

            const normalizedBarber = typeof barber === 'string'
                ? { name: barber, pin: '', isActive: true, leaves: [] }
                : barber;
            const currentLeaves = normalizedBarber.leaves || [];
            const exists = currentLeaves.some((item) =>
                item.type === leave.type &&
                item.startDate === leave.startDate &&
                item.endDate === leave.endDate &&
                Number(item.weekday ?? -1) === Number(leave.weekday ?? -1));
            if (exists) return normalizedBarber;

            return {
                ...normalizedBarber,
                leaves: [...currentLeaves, leave].sort((a, b) => a.startDate.localeCompare(b.startDate)),
            };
        }));
        setLeaveDrafts((current) => ({
            ...current,
            [index]: { type: draft.type, startDate: '', endDate: '', weekday: draft.weekday ?? 0 },
        }));
    };

    const handleRemoveBarberLeave = (barberIndex, leaveIndex) => {
        setBarbers((current) => current.map((barber, index) => {
            if (index !== barberIndex || typeof barber === 'string') return barber;
            return {
                ...barber,
                leaves: (barber.leaves || []).filter((_, indexToRemove) => indexToRemove !== leaveIndex),
            };
        }));
    };

    return (
        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 pb-28 relative">

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-4 p-4 sm:p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 shrink-0 rounded-lg flex items-center justify-center ${activeTab.iconClass}`}>
                            {React.createElement(activeTab.icon, { size: 20 })}
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl sm:text-2xl font-black text-slate-800">إعدادات المنشأة</h2>
                            <p className="text-xs sm:text-sm font-bold text-slate-500 mt-1 truncate">{activeTab.description}</p>
                        </div>
                    </div>
                    <span className="hidden sm:inline-flex shrink-0 items-center rounded-md bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600">
                        {activeTab.label}
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="أقسام الإعدادات">
                    {SETTINGS_TABS.map((tab) => {
                        const TabIcon = tab.icon;
                        const isActive = activeSettingsTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => setActiveSettingsTab(tab.id)}
                                className={`min-h-20 px-3 py-3 border-b-2 flex flex-col items-center justify-center gap-2 text-center transition-colors ${isActive
                                    ? tab.activeClass
                                    : 'border-transparent bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                            >
                                <TabIcon size={18} />
                                <span className="text-xs font-black leading-tight">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <form id="settings-form" onSubmit={handleSaveSettings} className="space-y-4">

                {/* 1. قسم الهوية والتواصل وتخصيص الواجهة */}
                <section role="tabpanel" className={`${activeSettingsTab === 'identity' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        الهوية، التواصل، وتخصيص الواجهة
                    </h3>

                    {/* الحقول الأساسية */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">اسم الصالون</label>
                            <input type="text" value={salonName || ''} onChange={(e) => setSalonName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="مثال: صالون الأبطال" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">اسم المالك / المدير</label>
                            <input type="text" value={ownerName || ''} onChange={(e) => setOwnerName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="مثال: أبو علي" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">رقم الجوال (للتواصل)</label>
                            <input type="text" value={ownerPhone || ''} onChange={(e) => setOwnerPhone(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm tracking-wider" placeholder="0500000000" dir="ltr" />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2">
                                <MapPin size={13} />
                                رابط خرائط جوجل
                            </label>
                            <input type="url" value={settings?.locationUrl || ''} onChange={(e) => setSettings({ ...settings, locationUrl: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="https://maps.google.com/..." dir="ltr" />
                        </div>

                        <div className="md:col-span-2 bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-3">
                                <ImageIcon size={13} />
                                شعار الصالون
                            </label>
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 overflow-hidden bg-white flex items-center justify-center flex-shrink-0 relative group hover:border-blue-400 transition-colors">
                                    {logoUrl ? (
                                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                                    ) : (
                                        <Camera size={24} className="text-slate-300" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" />
                                    <button type="button" onClick={() => fileInputRef.current.click()} className="bg-white border border-slate-200 text-slate-700 font-black px-6 py-2.5 rounded-lg text-sm hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm">
                                        رفع صورة من الجهاز
                                    </button>
                                    <input type="url" value={logoUrl || ''} onChange={(e) => setLogoUrl(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-500 outline-none focus:border-blue-400 text-xs" placeholder="أو ضع رابط الصورة مباشرة هنا..." dir="ltr" />
                                </div>
                            </div>
                        </div>

                        {/* الهوية الرقمية */}
                        <div className="md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                            <h4 className="text-md font-black text-slate-800 mb-4 flex items-center gap-2">
                                <Palette size={17} className="text-pink-500" /> تخصيص صفحة الحجز
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-2">نبذة عن الصالون (Bio)</label>
                                    <textarea
                                        rows="2"
                                        value={bio || ''}
                                        onChange={(e) => setBio(e.target.value)}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-400 transition-all text-sm font-bold text-slate-700 resize-none"
                                        placeholder="مثال: أفضل صالون للحلاقة العصرية والعناية بالرجل..."
                                    />
                                </div>

                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">اللون الأساسي</label>
                                        <p className="text-[10px] text-slate-400 font-bold">للأزرار والخلفيات</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">{themeColors?.primaryColor}</span>
                                        <input
                                            type="color"
                                            value={themeColors?.primaryColor || '#3b82f6'}
                                            onChange={(e) => setThemeColors({ ...themeColors, primaryColor: e.target.value })}
                                            className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent p-0"
                                        />
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">اللون الثانوي</label>
                                        <p className="text-[10px] text-slate-400 font-bold">للمسات والظلال</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">{themeColors?.secondaryColor}</span>
                                        <input
                                            type="color"
                                            value={themeColors?.secondaryColor || '#cbd5e1'}
                                            onChange={(e) => setThemeColors({ ...themeColors, secondaryColor: e.target.value })}
                                            className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent p-0"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">إنستجرام</label>
                                        <input type="url" value={socialLinks?.instagram || ''} onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-400 transition-all text-sm font-bold text-slate-700" placeholder="https://instagram.com/..." dir="ltr" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">تيك توك</label>
                                        <input type="url" value={socialLinks?.tiktok || ''} onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-800 transition-all text-sm font-bold text-slate-700" placeholder="https://tiktok.com/@..." dir="ltr" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">سناب شات</label>
                                        <input type="url" value={socialLinks?.snapchat || ''} onChange={(e) => setSocialLinks({ ...socialLinks, snapchat: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-yellow-100 focus:border-yellow-400 transition-all text-sm font-bold text-slate-700" placeholder="https://snapchat.com/add/..." dir="ltr" />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </section>

                {/* 2. قسم أوقات العمل */}
                <section role="tabpanel" className={`${activeSettingsTab === 'booking' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        أوقات العمل والجدولة
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">وقت الافتتاح</label>
                            <input type="time" value={settings?.startTime || ''} onChange={(e) => setSettings({ ...settings, startTime: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">وقت الإغلاق</label>
                            <input type="time" value={settings?.endTime || ''} onChange={(e) => setSettings({ ...settings, endTime: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">مدة الموعد الواحد</label>
                            <select value={settings?.slotDuration || 30} onChange={(e) => setSettings({ ...settings, slotDuration: parseInt(e.target.value) })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400 appearance-none cursor-pointer">
                                <option value={15}>15 دقيقة (سريع)</option>
                                <option value={20}>20 دقيقة</option>
                                <option value={30}>30 دقيقة (قياسي)</option>
                                <option value={45}>45 دقيقة</option>
                                <option value={60}>ساعة كاملة</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-red-500 mb-2">إيقاف الحجوزات بعد تاريخ (اختياري)</label>
                            <div className="flex gap-2">
                                <input type="date" value={settings?.maxBookingDate || ''} onChange={(e) => setSettings({ ...settings, maxBookingDate: e.target.value })} className="flex-1 p-4 bg-red-50 border border-red-100 rounded-lg font-bold text-red-600 outline-none focus:border-red-400 text-sm" />
                                {settings?.maxBookingDate && <button type="button" onClick={() => setSettings({ ...settings, maxBookingDate: '' })} className="bg-red-100 text-red-600 font-black px-4 rounded-lg hover:bg-red-200 inline-flex items-center justify-center"><X size={16} /></button>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-orange-50 p-5 rounded-lg border border-orange-100 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-black text-orange-700 flex items-center gap-2">
                                <Clock3 size={16} />
                                وقت الاستراحة (مغلق للحجز)
                            </h4>
                            {(settings?.breakStart || settings?.breakEnd) && (
                                <button type="button" onClick={() => setSettings({ ...settings, breakStart: '', breakEnd: '' })} className="text-xs text-orange-500 hover:text-orange-700 font-bold bg-white px-3 py-1 rounded-lg shadow-sm">إلغاء الاستراحة</button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-orange-600/70 mb-2">من الساعة</label><input type="time" value={settings?.breakStart || ''} onChange={(e) => setSettings({ ...settings, breakStart: e.target.value })} className="w-full p-3 bg-white border border-orange-200 rounded-lg font-black text-orange-700 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-orange-600/70 mb-2">إلى الساعة</label><input type="time" value={settings?.breakEnd || ''} onChange={(e) => setSettings({ ...settings, breakEnd: e.target.value })} className="w-full p-3 bg-white border border-orange-200 rounded-lg font-black text-orange-700 outline-none" /></div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-black text-slate-700 mb-3">أيام الإجازات (تواريخ محددة يغلق فيها الصالون)</label>
                        <div className="flex gap-2 mb-4">
                            <input type="date" value={newClosedDate} onChange={(e) => setNewClosedDate(e.target.value)} className="flex-1 max-w-xs p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-600 outline-none focus:border-blue-400 text-sm" />
                            <button type="button" onClick={() => { if (newClosedDate && !settings?.closedDates?.includes(newClosedDate)) { setSettings({ ...settings, closedDates: [...(settings?.closedDates || []), newClosedDate] }); setNewClosedDate(''); } }} className="bg-slate-800 text-white font-black px-6 rounded-lg hover:bg-slate-700 text-sm transition-all shadow-sm">إضافة إجازة</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {settings?.closedDates?.map((date) => (
                                <div key={date} className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-3 shadow-sm">
                                    <span dir="ltr">{date}</span>
                                    <button type="button" onClick={() => setSettings({ ...settings, closedDates: settings.closedDates.filter(d => d !== date) })} className="bg-white w-5 h-5 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <div role="tabpanel" className={activeSettingsTab === 'finance' ? 'block' : 'hidden'}>
                    {settings?.isZatcaOnboarded && <ZatcaSection
                        settings={settings}
                        taxNumber={taxNumber}
                        setTaxNumber={setTaxNumber}
                        zatcaOtp={zatcaOtp}
                        setZatcaOtp={setZatcaOtp}
                        isOnboardingZatca={isOnboardingZatca}
                        handleZatcaOnboard={handleZatcaOnboard}
                        currentPlan={currentPlan}
                        setUpsellConfig={setUpsellConfig}
                        handleZatcaDisconnect={handleZatcaDisconnect}
                    />}
                    <ZakatySection onTaxNumberSaved={setTaxNumber} />
                </div>

                {/* 4. قسم قائمة الخدمات والطاقم */}
                <section role="tabpanel" className={`${activeSettingsTab === 'team' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        الفريق والخدمات
                    </h3>

                    {/* إدارة الطاقم */}
                    <div className="mb-8 bg-slate-50/50 p-6 rounded-lg border border-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <label className="block text-sm font-black text-slate-800">إدارة الطاقم وصلاحيات الدخول (PIN)</label>
                                <p className="text-xs font-bold text-slate-500 mt-1">أضف الطاقم، وحدد رمز الدخول، وتحكم بإجازاتهم.</p>
                            </div>
                            <button type="button" onClick={handleAddBarber} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-lg text-sm font-black transition-all shadow-sm">
                                + إضافة حلاق
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-3 mb-6 p-4 bg-white rounded-lg border border-slate-200">
                            <input type="text" value={newBarberName} onChange={(e) => setNewBarberName(e.target.value)} placeholder="اسم الحلاق الجديد (مثال: محمد)" className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm" />
                            <div className="relative w-full md:w-40 group" onClick={() => { if (currentPlan !== 'Premium') setUpsellConfig({ isOpen: true, featureName: 'صلاحيات دخول الطاقم', requiredPlan: 'Premium' }); }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d*"
                                    maxLength="8"
                                    disabled={currentPlan !== 'Premium'}
                                    value={newBarberPin}
                                    onChange={(e) => setNewBarberPin(e.target.value.replace(/\D/g, ''))}
                                    placeholder="PIN (اختياري)"
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-slate-800 outline-none focus:border-emerald-400 text-center tracking-[0.3em] disabled:opacity-50 text-sm"
                                />
                                {currentPlan !== 'Premium' && <LockKeyhole size={15} className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400" />}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {barbers?.map((barber, index) => {
                                const bName = typeof barber === 'string' ? barber : barber.name;
                                const bPin = typeof barber === 'string'
                                    ? settings?.barberPins?.find(b => b.name === bName)?.pin || ''
                                    : barber.pin || '';
                                const isActive = typeof barber === 'string' ? true : (barber.isActive !== false);
                                const iconColor = typeof barber === 'string' ? '' : (barber.iconColor || '');
                                const leaves = typeof barber === 'string' ? [] : (barber.leaves || []);
                                const leaveDraft = leaveDrafts[index] || {
                                    type: 'daily',
                                    startDate: '',
                                    endDate: '',
                                    weekday: 0,
                                };

                                return (
                                    <div key={barber?._id || index} className={`rounded-lg border transition-all ${isActive ? 'bg-white border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`flex flex-col md:flex-row gap-4 items-center p-5 ${isActive ? '' : 'opacity-75'}`}>
                                            <div className="flex-1 w-full">
                                                <label className="text-[10px] font-black text-slate-400 block mb-1">اسم الحلاق</label>
                                                <input
                                                    type="text"
                                                    value={bName}
                                                    onChange={(e) => {
                                                        const updated = [...barbers];
                                                        if (typeof updated[index] === 'string') {
                                                            updated[index] = { name: e.target.value, pin: bPin, isActive, leaves };
                                                        } else {
                                                            updated[index] = { ...updated[index], name: e.target.value };
                                                        }
                                                        setBarbers(updated);
                                                    }}
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm"
                                                />
                                            </div>

                                            {currentPlan === 'Premium' && (
                                                <div className="w-full md:w-36">
                                                    <label className="text-[10px] font-black text-slate-400 block mb-1">رمز الدخول (PIN)</label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        maxLength="8"
                                                        placeholder={barber?.hasPin ? '•••• محفوظ' : 'بدون رمز'}
                                                        value={bPin}
                                                        onChange={(e) => {
                                                            const updated = [...barbers];
                                                            if (typeof updated[index] === 'string') {
                                                                updated[index] = { name: bName, pin: e.target.value.replace(/\D/g, ''), isActive, leaves };
                                                            } else {
                                                                updated[index] = { ...updated[index], pin: e.target.value.replace(/\D/g, '') };
                                                            }
                                                            setBarbers(updated);
                                                        }}
                                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-emerald-400 text-sm text-center tracking-widest"
                                                        dir="ltr"
                                                    />
                                                    {barber?.hasPin && !bPin && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const updated = [...barbers];
                                                                updated[index] = { ...updated[index], hasPin: false, clearPin: true };
                                                                setBarbers(updated);
                                                            }}
                                                            className="text-[10px] font-black text-rose-500 hover:text-rose-600 mt-1"
                                                        >
                                                            إزالة الرمز
                                                        </button>
                                                    )}
                                                    {barber?.clearPin && !bPin && (
                                                        <p className="text-[10px] font-bold text-rose-500 mt-1">سيُزال الرمز عند الحفظ</p>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between w-full md:w-auto md:min-w-[120px] bg-slate-100/50 p-2.5 rounded-lg border border-slate-100 mt-1 md:mt-0">
                                                <span className={`text-[10px] font-black transition-colors ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {isActive ? 'متاح' : 'متوقف'}
                                                </span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={isActive}
                                                        onChange={(e) => {
                                                            const updated = [...barbers];
                                                            if (typeof updated[index] === 'string') {
                                                                updated[index] = { name: bName, pin: bPin, isActive: e.target.checked, leaves };
                                                            } else {
                                                                updated[index] = { ...updated[index], isActive: e.target.checked };
                                                            }
                                                            setBarbers(updated);
                                                        }}
                                                    />
                                                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </label>
                                            </div>

                                            {barbers.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (window.confirm(`هل أنت متأكد من حذف الحلاق "${bName}" نهائياً؟`)) {
                                                            setBarbers(barbers.filter((_, i) => i !== index));
                                                        }
                                                    }}
                                                    className="text-red-500 hover:bg-red-50 p-3 rounded-lg transition-colors w-full md:w-auto inline-flex justify-center"
                                                    title="حذف الحلاق"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-3">
                                            <div>
                                                <label htmlFor={`barber-icon-color-${index}`} className="text-xs font-black text-slate-700">لون أيقونة الحلاق</label>
                                                <p className="text-[10px] font-bold text-slate-400">يظهر في صفحة الحجز</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {iconColor && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setBarbers((current) => current.map((item, itemIndex) => itemIndex === index
                                                            ? { ...(typeof item === 'string' ? { name: item, pin: bPin, isActive, leaves } : item), iconColor: '' }
                                                            : item))}
                                                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                                                        title="إعادة اللون الافتراضي"
                                                        aria-label={`إعادة لون أيقونة ${bName} الافتراضي`}
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                )}
                                                <input
                                                    id={`barber-icon-color-${index}`}
                                                    type="color"
                                                    value={iconColor || (index % 2 === 0 ? themeColors?.primaryColor : themeColors?.secondaryColor) || '#3b82f6'}
                                                    onChange={(event) => setBarbers((current) => current.map((item, itemIndex) => itemIndex === index
                                                        ? { ...(typeof item === 'string' ? { name: item, pin: bPin, isActive, leaves } : item), iconColor: event.target.value }
                                                        : item))}
                                                    className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent p-0"
                                                    aria-label={`لون أيقونة ${bName}`}
                                                />
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-100 p-5">
                                            <div className="flex items-center gap-2 mb-3 text-slate-700">
                                                <CalendarDays size={17} />
                                                <h5 className="text-sm font-black">إجازات الحلاق</h5>
                                            </div>

                                            <div className={`grid grid-cols-1 gap-2 ${leaveDraft.type === 'daily'
                                                ? 'sm:grid-cols-2 xl:grid-cols-[190px_130px_minmax(150px,1fr)_minmax(150px,1fr)_auto]'
                                                : 'sm:grid-cols-[190px_minmax(0,1fr)_auto]'}`}>
                                                <select
                                                    value={leaveDraft.type}
                                                    onChange={(event) => updateLeaveDraft(index, 'type', event.target.value)}
                                                    className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-700 outline-none focus:border-emerald-400"
                                                >
                                                    {LEAVE_TYPE_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                                {leaveDraft.type === 'daily' && (
                                                    <select
                                                        value={leaveDraft.weekday}
                                                        onChange={(event) => updateLeaveDraft(index, 'weekday', Number(event.target.value))}
                                                        className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-700 outline-none focus:border-emerald-400"
                                                        aria-label="يوم الأسبوع"
                                                    >
                                                        {WEEKDAY_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                <input
                                                    type="date"
                                                    value={leaveDraft.startDate}
                                                    onChange={(event) => updateLeaveDraft(index, 'startDate', event.target.value)}
                                                    className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                                                    aria-label={leaveDraft.type === 'daily' ? 'بداية فترة التكرار' : 'تاريخ بداية الإجازة'}
                                                />
                                                {leaveDraft.type === 'daily' && (
                                                    <input
                                                        type="date"
                                                        min={leaveDraft.startDate || undefined}
                                                        value={leaveDraft.endDate}
                                                        onChange={(event) => updateLeaveDraft(index, 'endDate', event.target.value)}
                                                        className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                                                        aria-label="نهاية فترة التكرار"
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddBarberLeave(index)}
                                                    className="h-11 px-4 rounded-lg bg-slate-900 text-white text-sm font-black hover:bg-slate-700 inline-flex items-center justify-center gap-2"
                                                >
                                                    <Plus size={17} />
                                                    إضافة
                                                </button>
                                            </div>

                                            {leaves.length > 0 && (
                                                <div className="mt-3 divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                                                    {leaves.map((leave, leaveIndex) => {
                                                        const typeLabel = LEAVE_TYPE_OPTIONS.find((option) => option.value === leave.type)?.label || 'إجازة';
                                                        const weekdayLabel = WEEKDAY_OPTIONS.find((option) => option.value === Number(leave.weekday))?.label;
                                                        return (
                                                            <div key={`${leave.type}-${leave.startDate}-${leaveIndex}`} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                                                                <div className="min-w-0">
                                                                    <span className="text-xs font-black text-slate-700">
                                                                        {weekdayLabel ? `${weekdayLabel} أسبوعيًا` : typeLabel}
                                                                    </span>
                                                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                                                        {formatLeaveDate(leave.startDate)} إلى {formatLeaveDate(leave.endDate)}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveBarberLeave(index, leaveIndex)}
                                                                    className="w-9 h-9 shrink-0 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                                                                    title="حذف الإجازة"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {barbers?.length === 0 && (
                                <div className="text-center p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                    <p className="text-slate-400 font-bold text-sm">لم تقم بإضافة أي حلاق بعد.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* قائمة الخدمات */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <label className="block text-sm font-black text-slate-800">قائمة الخدمات والأسعار</label>
                                <p className="text-[10px] font-bold text-slate-500 mt-1">لحساب الفاتورة بدقة، قم بإضافة خدماتك بأسعار شاملة الضريبة.</p>
                            </div>
                            <button type="button" onClick={handleAddService} className="bg-slate-800 text-white px-4 py-2.5 rounded-lg font-black text-xs hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2">
                                <span>+</span> خدمة جديدة
                            </button>
                        </div>
                        <div className="space-y-3">
                            {services.length === 0 ? (
                                <div className="text-center p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                    <Scissors size={28} className="text-slate-300 mx-auto mb-2" />
                                    <p className="text-slate-500 font-bold text-sm">لم تقم بإضافة خدمات. (الوضع الافتراضي: حجز مقعد فقط)</p>
                                </div>
                            ) : (
                                services.map((srv, index) => (
                                    <div key={srv.id || index} className="flex flex-col md:flex-row gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 items-center hover:border-blue-300 transition-colors">
                                        <div className="w-full md:w-2/5 relative">
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black bg-white w-5 h-5 flex items-center justify-center rounded-full shadow-sm">{index + 1}</span>
                                            <input type="text" required placeholder="اسم الخدمة (مثال: تنظيف بشرة)" value={srv.name} onChange={(e) => handleServiceChange(srv.id, 'name', e.target.value)} className="w-full pr-12 pl-4 py-3.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 shadow-sm" />
                                        </div>
                                        <div className="w-full md:w-1/4 relative">
                                            <input type="number" required placeholder="السعر" min="0" value={srv.price} onChange={(e) => handleServiceChange(srv.id, 'price', Number(e.target.value))} className="w-full px-4 py-3.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 shadow-sm" dir="ltr" />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">ر.س</span>
                                        </div>
                                        <div className="w-full md:w-1/4 relative">
                                            <select value={srv.duration} onChange={(e) => handleServiceChange(srv.id, 'duration', Number(e.target.value))} className="w-full pl-10 pr-4 py-3.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 appearance-none shadow-sm cursor-pointer">
                                                <option value={15}>15 دقيقة</option>
                                                <option value={30}>30 دقيقة</option>
                                                <option value={45}>45 دقيقة</option>
                                                <option value={60}>ساعة</option>
                                            </select>
                                            <Clock3 size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                        <button type="button" onClick={() => handleRemoveService(srv.id)} className="w-full md:w-auto p-3.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center font-bold">حذف</button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                <section role="tabpanel" className={`${activeSettingsTab === 'finance' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
                    <div className="flex justify-between items-center mb-6 border-b border-slate-50 pb-4">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            إعدادات الدفع المسبق (العربون)
                        </h3>
                    </div>

                    <div className="bg-indigo-50/50 p-6 rounded-lg border border-indigo-100">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <label className="block text-sm font-black text-indigo-900">تفعيل الدفع الإلكتروني</label>
                                <p className="text-xs font-bold text-indigo-700/70 mt-1 max-w-sm">
                                    اطلب من عملائك دفع عربون لتأكيد الحجز. الربط يتم بحساب ميسر الخاص بالصالون.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={paymentSettings?.isOnlinePaymentEnabled || false}
                                    onChange={(e) => {
                                        if (currentPlan === 'Free') {
                                            setUpsellConfig({ isOpen: true, featureName: 'بوابة الدفع والعربون', requiredPlan: 'Pro' });
                                            return;
                                        }
                                        setPaymentSettings({ ...paymentSettings, isOnlinePaymentEnabled: e.target.checked });
                                    }}
                                />
                                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                            </label>
                        </div>

                        <AnimatePresence>
                            {paymentSettings?.isOnlinePaymentEnabled && (
                                <MotionDiv
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-4 border-t border-indigo-100/50 space-y-5">

                                        {/* قيمة العربون */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-2">مبلغ العربون المطلوب لتأكيد الحجز</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={paymentSettings?.depositAmount || ''}
                                                        onChange={(e) => setPaymentSettings({ ...paymentSettings, depositAmount: Number(e.target.value) })}
                                                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm"
                                                        dir="ltr"
                                                    />
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">ر.س</span>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-2">مزود الدفع</label>
                                                <div className="w-full p-3 bg-white border border-slate-200 rounded-lg font-black text-slate-800 text-sm">
                                                    ميسر (Moyasar)
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-2">المفتاح السري لميسر (Secret Key)</label>
                                            <input
                                                type="password"
                                                autoComplete="off"
                                                value={paymentSettings?.moyasarSecretKey || ''}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, moyasarSecretKey: e.target.value })}
                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                                                placeholder={paymentSettings?.hasSecretKey ? "محفوظ بأمان (اكتب لتغييره)" : "sk_live_..."}
                                                dir="ltr"
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1 font-bold">
                                                {paymentSettings?.hasSecretKey ? "تم حفظ المفتاح مسبقاً." : "سيتم تشفير المفتاح تلقائياً بمجرد الحفظ."} لا حاجة لإعداد Webhook يدوياً، النظام يرسله مع كل رابط دفع.
                                            </p>
                                        </div>

                                        <div className="bg-white p-4 rounded-lg flex items-center justify-between border border-indigo-50">
                                            <div className="flex items-center gap-3">
                                                <CircleDollarSign size={20} className="text-indigo-600" />
                                                <div>
                                                    <p className="text-xs font-black text-slate-800">الربط مع حساب ميسر</p>
                                                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">كل صالون يستخدم حساب ميسر الخاص به، والمبالغ تذهب لحسابه مباشرة.</p>
                                                </div>
                                            </div>
                                            <a href="https://dashboard.moyasar.com" target="_blank" rel="noopener noreferrer" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-lg text-xs font-black transition-colors">
                                                لوحة ميسر
                                            </a>
                                        </div>

                                    </div>
                                </MotionDiv>
                            )}
                        </AnimatePresence>
                    </div>
                </section>

                <div role="tabpanel" className={activeSettingsTab === 'marketing' ? 'block' : 'hidden'}>
                    <MarketingSection
                        settings={settings}
                        setSettings={setSettings}
                        currentPlan={currentPlan}
                        setUpsellConfig={setUpsellConfig}
                    />
                </div>

                {activeSettingsTab !== 'integrations' && <div className="fixed bottom-4 sm:bottom-6 left-0 right-0 z-40 px-3 sm:px-4 md:pl-8 lg:pl-[20%] pointer-events-none">
                    <div className="max-w-4xl mx-auto bg-white/80 backdrop-blur-xl border border-slate-200/50 p-4 rounded-lg shadow-2xl flex items-center justify-between pointer-events-auto">
                        <div className="hidden sm:block text-right pr-4">
                            <p className="text-sm font-black text-slate-800">حفظ إعدادات {activeTab.label}</p>
                            <p className="text-[10px] font-bold text-slate-500">تُحفظ جميع التغييرات التي أجريتها في التبويبات.</p>
                        </div>
                        <button type="submit" disabled={isSavingSettings} className="w-full sm:w-auto bg-slate-900 text-white font-black px-10 py-4 rounded-lg hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-50 shadow-lg text-sm flex items-center justify-center gap-2">
                            {isSavingSettings ? (
                                <span className="animate-pulse">جاري الحفظ...</span>
                            ) : (
                                <>
                                    <Save size={16} />
                                    <span>حفظ التحديثات</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>}
            </form>

            <section role="tabpanel" className={`${activeSettingsTab === 'integrations' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        ربط الواتساب الآلي
                    </h3>
                </div>

                {currentPlan === 'Free' ? (
                    <div onClick={() => setUpsellConfig({ isOpen: true, featureName: 'الواتساب الآلي (تأكيد وتذكير)', requiredPlan: 'Pro' })} className="bg-slate-50 border border-slate-200 p-8 rounded-lg text-center group cursor-pointer hover:border-emerald-200 transition-all">
                        <div className="w-16 h-16 bg-white text-slate-400 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100 group-hover:text-emerald-600 transition-colors">
                            <MessageCircle size={26} />
                        </div>
                        <h3 className="font-black text-slate-800 text-xl mb-2">تنبيهات الواتساب مقفلة</h3>
                        <p className="text-slate-500 font-bold text-sm mb-6 max-w-md mx-auto">ارتقِ بخدمة عملائك مع باقة Pro. دع النظام يرسل تأكيدات الحجز والتذكير بالمواعيد لعملائك آلياً.</p>
                        <button type="button" className="bg-slate-800 text-white font-black px-8 py-3.5 rounded-lg group-hover:bg-emerald-600 transition-colors text-sm shadow-lg">استكشف الباقات</button>
                    </div>
                ) : (
                    (() => {
                        const currentStatus = waStatus?.toUpperCase() || 'DISCONNECTED';
                        if (currentStatus === 'WORKING' || currentStatus === 'CONNECTED') {
                            return (
                                <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-lg text-center flex flex-col items-center">
                                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-4 shadow-inner ring-4 ring-white">
                                        <CheckCircle2 size={28} />
                                    </div>
                                    <h3 className="font-black text-emerald-800 text-xl mb-1">الواتساب متصل ويعمل بنجاح!</h3>
                                    <p className="text-xs font-bold text-emerald-600/80 mb-6">النظام الآن يرسل التنبيهات لعملائك آلياً.</p>
                                    <button onClick={handleDisconnectWhatsapp} disabled={isWaLoading} className="bg-white border border-red-100 text-red-500 hover:bg-red-500 hover:text-white font-black px-8 py-3 rounded-lg transition-all text-sm shadow-sm inline-flex items-center gap-2">
                                        <Unplug size={15} />
                                        إلغاء الربط مؤقتاً
                                    </button>
                                </div>
                            );
                        }
                        if (['CREATED', 'STARTING', 'NEED_SCAN', 'SCAN_QR_CODE', 'CONNECTING'].includes(currentStatus) || qrCode) {
                            return (
                                <div className="bg-slate-50 border border-slate-200 p-8 rounded-lg text-center flex flex-col items-center">
                                    <div className="w-11 h-11 bg-white border border-slate-100 text-slate-600 rounded-lg flex items-center justify-center mb-3">
                                        <Smartphone size={20} />
                                    </div>
                                    <h3 className="font-black text-slate-800 text-lg mb-2">افتح واتساب في جوالك وامسح الكود</h3>
                                    <p className="text-xs font-bold text-slate-500 mb-6">اذهب إلى الإعدادات، الأجهزة المرتبطة، ثم ربط جهاز.</p>
                                    <div className="bg-white p-4 rounded-lg shadow-md border border-slate-100 mb-6 w-64 h-64 flex items-center justify-center relative">
                                        {currentStatus === 'CONNECTING' ? (
                                            <div className="animate-pulse flex flex-col items-center"><div className="border-4 border-slate-200 border-t-emerald-500 rounded-full w-12 h-12 animate-spin mb-3" /><p className="text-sm font-black text-emerald-600">جاري إتمام الاتصال...</p></div>
                                        ) : qrCode ? (
                                            <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain rounded-lg" />
                                        ) : (
                                            <div className="animate-pulse flex flex-col items-center"><div className="border-4 border-slate-200 border-t-blue-500 rounded-full w-12 h-12 animate-spin mb-3" /><p className="text-sm font-black text-slate-500">جاري توليد الكود...</p></div>
                                        )}
                                    </div>
                                    <button onClick={handleDisconnectWhatsapp} className="text-slate-400 hover:text-red-500 font-bold text-xs underline decoration-dotted underline-offset-4">إلغاء العملية</button>
                                </div>
                            );
                        }
                        return (
                            <div className="bg-slate-50 border border-slate-200 p-10 rounded-lg text-center flex flex-col items-center">
                                <div className="w-16 h-16 bg-white text-slate-400 rounded-lg flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                                    <Plug size={26} />
                                </div>
                                <h3 className="font-black text-slate-800 text-xl mb-2">رقم الواتساب غير مربوط</h3>
                                <p className="text-xs font-bold text-slate-500 mb-6">اربط جوال الصالون لتمكين إرسال الفواتير والتنبيهات للعملاء آلياً.</p>
                                <button onClick={handleConnectWhatsapp} disabled={isWaLoading} className="bg-emerald-600 text-white font-black px-10 py-4 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all text-sm shadow-lg shadow-emerald-600/30 inline-flex items-center gap-2">
                                    <MessageCircle size={16} />
                                    {isWaLoading ? 'جاري تجهيز السيرفر...' : 'بدء ربط الواتساب'}
                                </button>
                            </div>
                        );
                    })()
                )}
                {currentPlan !== 'Free' && Object.keys(whatsappTemplateDefaults || {}).length > 0 && (
                    <div className="mt-8 border-t border-slate-200 pt-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                            <h4 className="text-base font-black text-slate-800">رسائل واتساب الآلية</h4>
                            <button type="button" onClick={handleSaveTemplates} disabled={isSavingTemplates} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-md text-sm font-bold">
                                <Save size={16} />{isSavingTemplates ? 'جاري الحفظ...' : 'حفظ الرسائل'}
                            </button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 mb-4" role="tablist" aria-label="أنواع رسائل واتساب">
                            {WHATSAPP_MESSAGE_TYPES.map(({ key, label }) => (
                                <button key={key} type="button" role="tab" aria-selected={activeMessageType === key} onClick={() => { setActiveMessageType(key); setTemplateError(''); setTemplateSaved(false); }} className={`shrink-0 px-3 py-2 rounded-md text-sm font-bold border ${activeMessageType === key ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-600 border-slate-200'}`}>{label}</button>
                            ))}
                        </div>
                        {WHATSAPP_MESSAGE_TYPES.filter(({ key }) => key === activeMessageType).map(({ key, label, variables }) => (
                            <div key={key} role="tabpanel" className="space-y-3">
                                <label htmlFor={`wa-template-${key}`} className="block text-sm font-bold text-slate-700">{label}</label>
                                <textarea id={`wa-template-${key}`} dir="rtl" rows={10} maxLength={4000} value={whatsappTemplates?.[key] ?? whatsappTemplateDefaults[key] ?? ''} onChange={(event) => { setWhatsappTemplates((current) => ({ ...current, [key]: event.target.value })); setTemplateSaved(false); }} className="w-full border border-slate-300 rounded-md p-3 text-sm leading-7 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                                <div className="flex flex-wrap gap-2" aria-label="متغيرات الرسالة">
                                    {variables.map((variable) => <button key={variable} type="button" title={`إضافة ${variable}`} onClick={() => { setWhatsappTemplates((current) => ({ ...current, [key]: `${current[key] ?? whatsappTemplateDefaults[key] ?? ''}{${variable}}` })); setTemplateSaved(false); }} className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-600 hover:border-emerald-400 hover:text-emerald-700">{`{${variable}}`}</button>)}
                                </div>
                                <button type="button" onClick={() => { setWhatsappTemplates((current) => ({ ...current, [key]: whatsappTemplateDefaults[key] })); setTemplateSaved(false); }} className="text-xs font-bold text-slate-500 hover:text-emerald-700">استعادة النص الافتراضي</button>
                            </div>
                        ))}
                        {templateError && <p role="alert" className="mt-3 text-sm font-bold text-red-600">{templateError}</p>}
                        {templateSaved && <p role="status" className="mt-3 text-sm font-bold text-emerald-700">تم حفظ الرسائل.</p>}
                    </div>
                )}
            </section>

            <UpgradeModal isOpen={upsellConfig.isOpen} onClose={() => setUpsellConfig({ ...upsellConfig, isOpen: false })} requiredPlan={upsellConfig.requiredPlan} featureName={upsellConfig.featureName} />
        </MotionDiv>
    );
};

export default SettingsTab;
