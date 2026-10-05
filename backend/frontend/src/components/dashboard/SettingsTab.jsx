import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
const MotionDiv = motion.div;
import {
    CircleDollarSign,
    Clock3,
    Palette,
    Plug,
    Save,
    Scissors,
    Sparkles,
} from 'lucide-react';
import API from '../../services/api';
import UpgradeModal from './UpgradeModal';

import ZatcaSection from './settings/ZatcaSection';
import ZakatySection from './settings/ZakatySection';
import MarketingSection from './settings/MarketingSection';
import IdentitySection from './settings/IdentitySection';
import BookingHoursSection from './settings/BookingHoursSection';
import TeamSection from './settings/TeamSection';
import PaymentSection from './settings/PaymentSection';
import IntegrationsSection from './settings/IntegrationsSection';
import { buildLeavePeriod } from './settings/barberLeaveOptions';

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

                <IdentitySection
                    salonName={salonName}
                    setSalonName={setSalonName}
                    ownerName={ownerName}
                    setOwnerName={setOwnerName}
                    ownerPhone={ownerPhone}
                    setOwnerPhone={setOwnerPhone}
                    logoUrl={logoUrl}
                    setLogoUrl={setLogoUrl}
                    settings={settings}
                    setSettings={setSettings}
                    bio={bio}
                    setBio={setBio}
                    socialLinks={socialLinks}
                    setSocialLinks={setSocialLinks}
                    themeColors={themeColors}
                    setThemeColors={setThemeColors}
                    activeSettingsTab={activeSettingsTab}
                    fileInputRef={fileInputRef}
                    handleLogoUpload={handleLogoUpload}
                />

                <BookingHoursSection
                    settings={settings}
                    setSettings={setSettings}
                    newClosedDate={newClosedDate}
                    setNewClosedDate={setNewClosedDate}
                    activeSettingsTab={activeSettingsTab}
                />

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

                <TeamSection
                    settings={settings}
                    barbers={barbers}
                    setBarbers={setBarbers}
                    services={services}
                    themeColors={themeColors}
                    activeSettingsTab={activeSettingsTab}
                    currentPlan={currentPlan}
                    handleAddBarber={handleAddBarber}
                    handleAddBarberLeave={handleAddBarberLeave}
                    handleAddService={handleAddService}
                    handleRemoveBarberLeave={handleRemoveBarberLeave}
                    handleRemoveService={handleRemoveService}
                    handleServiceChange={handleServiceChange}
                    leaveDrafts={leaveDrafts}
                    newBarberName={newBarberName}
                    newBarberPin={newBarberPin}
                    setNewBarberName={setNewBarberName}
                    setNewBarberPin={setNewBarberPin}
                    setUpsellConfig={setUpsellConfig}
                    updateLeaveDraft={updateLeaveDraft}
                />

                <PaymentSection
                    paymentSettings={paymentSettings}
                    setPaymentSettings={setPaymentSettings}
                    activeSettingsTab={activeSettingsTab}
                    currentPlan={currentPlan}
                    setUpsellConfig={setUpsellConfig}
                />

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

            <IntegrationsSection
                whatsappTemplates={whatsappTemplates}
                setWhatsappTemplates={setWhatsappTemplates}
                whatsappTemplateDefaults={whatsappTemplateDefaults}
                activeMessageType={activeMessageType}
                activeSettingsTab={activeSettingsTab}
                currentPlan={currentPlan}
                handleConnectWhatsapp={handleConnectWhatsapp}
                handleDisconnectWhatsapp={handleDisconnectWhatsapp}
                handleSaveTemplates={handleSaveTemplates}
                isSavingTemplates={isSavingTemplates}
                isWaLoading={isWaLoading}
                qrCode={qrCode}
                setActiveMessageType={setActiveMessageType}
                setTemplateError={setTemplateError}
                setTemplateSaved={setTemplateSaved}
                setUpsellConfig={setUpsellConfig}
                templateError={templateError}
                templateSaved={templateSaved}
                waStatus={waStatus}
            />

            <UpgradeModal isOpen={upsellConfig.isOpen} onClose={() => setUpsellConfig({ ...upsellConfig, isOpen: false })} requiredPlan={upsellConfig.requiredPlan} featureName={upsellConfig.featureName} />
        </MotionDiv>
    );
};

export default SettingsTab;
