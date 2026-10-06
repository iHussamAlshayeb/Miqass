import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
const MotionDiv = motion.div;
import {
    CircleDollarSign,
    Clock3,
    Copy,
    CreditCard,
    ExternalLink,
    MessageCircle,
    Monitor,
    Receipt,
    RotateCcw,
    Save,
    Scissors,
    Send,
    Store,
    Tablet,
    Users,
} from 'lucide-react';
import API from '../../services/api';
import UpgradeModal from './UpgradeModal';

import ZakatySection from './settings/ZakatySection';
import MarketingSection from './settings/MarketingSection';
import IdentitySection from './settings/IdentitySection';
import BookingHoursSection from './settings/BookingHoursSection';
import KioskSection from './settings/KioskSection';
import TeamSection from './settings/TeamSection';
import PaymentSection from './settings/PaymentSection';
import IntegrationsSection from './settings/IntegrationsSection';
import BillingTab from './BillingTab';
import { buildLeavePeriod } from './settings/barberLeaveOptions';

// صفحات الإعدادات مجمّعة حسب ما يبحث عنه صاحب الصالون، لا حسب بنية النظام
const SETTINGS_GROUPS = [
    {
        label: 'الصالون',
        pages: [
            { id: 'profile', label: 'الملف التعريفي', icon: Store, description: 'الاسم والشعار والألوان والنبذة وبيانات التواصل الظاهرة في صفحة الحجز.' },
            { id: 'hours', label: 'ساعات العمل', icon: Clock3, description: 'الدوام والاستراحة وأيام الإغلاق، وآخر تاريخ يُسمح بالحجز فيه.' },
        ],
    },
    {
        label: 'الفريق والخدمات',
        pages: [
            { id: 'barbers', label: 'الحلاقون', icon: Users, description: 'الحلاقون وألوانهم في صفحة الحجز ورموز دخولهم وإجازاتهم.' },
            { id: 'services', label: 'الخدمات', icon: Scissors, description: 'الخدمات وأسعارها شاملة الضريبة ومدة كل خدمة.' },
        ],
    },
    {
        label: 'التواصل مع العملاء',
        pages: [
            { id: 'whatsapp', label: 'واتساب', icon: MessageCircle, description: 'ربط رقم واتساب الصالون الذي تُرسل منه الرسائل للعملاء.' },
            { id: 'messages', label: 'الرسائل التلقائية', icon: Send, description: 'التأكيد والتذكير والإلغاء تُرسل دائماً عند ربط واتساب. هنا تشغّل الرسائل الإضافية وتعدّل نصوص الرسائل.' },
        ],
    },
    {
        label: 'المدفوعات والضرائب',
        pages: [
            { id: 'deposit', label: 'العربون', icon: CircleDollarSign, description: 'تحصيل عربون عند الحجز عبر حساب ميسر الخاص بالصالون.' },
            { id: 'einvoice', label: 'الفوترة الإلكترونية', icon: Receipt, description: 'إرسال فواتير المبيعات لهيئة الزكاة والضريبة والجمارك عبر Zakaty.' },
        ],
    },
    {
        label: 'الأجهزة',
        pages: [
            { id: 'kiosk', label: 'الكشك', icon: Tablet, description: 'جهاز تسجيل الحضور والحلاقة المباشرة داخل الصالون.' },
            { id: 'screens', label: 'الطابور وبوابة الحلاقين', icon: Monitor, description: 'شاشة الطابور على تلفزيون الصالون، وبوابة دخول الحلاقين لمواعيدهم.' },
        ],
    },
    {
        label: 'الحساب',
        pages: [
            { id: 'plan', label: 'الاشتراك', icon: CreditCard, description: 'الباقة الحالية وتاريخ التجديد والترقية.' },
        ],
    },
];

const SETTINGS_PAGES = SETTINGS_GROUPS.flatMap((group) => group.pages);

// الصفحات التي تُحفظ عبر شريط الحفظ (حقول نموذج)، والبقية إجراءات فورية (ربط وفك ربط)
const FORM_PAGES = new Set(['profile', 'hours', 'barbers', 'services', 'messages', 'deposit']);

const PageCard = ({ title, children }) => (
    <section className="rounded-lg border border-slate-100 bg-white p-5 shadow-sm md:p-7">
        {title && <h3 className="mb-4 text-base font-black text-slate-800">{title}</h3>}
        {children}
    </section>
);

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
    setTaxNumber,
    bio, setBio,
    socialLinks, setSocialLinks,
    themeColors, setThemeColors,
    paymentSettings, setPaymentSettings,
    whatsappTemplates, setWhatsappTemplates, whatsappTemplateDefaults,
    slug, tenantId, campaignCredits, promoBanner, initialPage,
}) => {

    const [newBarberName, setNewBarberName] = useState('');
    const [newBarberPin, setNewBarberPin] = useState('');
    const [leaveDrafts, setLeaveDrafts] = useState({});
    const [activePage, setActivePage] = useState(SETTINGS_PAGES.some((page) => page.id === initialPage) ? initialPage : 'profile');
    const [qrCode, setQrCode] = useState('');
    const [whatsiInfo, setWhatsiInfo] = useState(null);
    const [waProvider, setWaProvider] = useState('');
    const [waProviders, setWaProviders] = useState([]);
    const [selectedWaProvider, setSelectedWaProvider] = useState('wasender');
    const [waStatus, setWaStatus] = useState('DISCONNECTED');
    const [isWaLoading, setIsWaLoading] = useState(false);
    const [activeMessageType, setActiveMessageType] = useState('confirmation');
    const [isSavingTemplates, setIsSavingTemplates] = useState(false);
    const [templateError, setTemplateError] = useState('');

    const [upsellConfig, setUpsellConfig] = useState({ isOpen: false, featureName: '', requiredPlan: '' });
    const currentPlan = subscription?.plan || 'Free';
    const fileInputRef = useRef(null);
    const activePageInfo = SETTINGS_PAGES.find((page) => page.id === activePage) || SETTINGS_PAGES[0];

    // ─── شريط الحفظ: يظهر فقط عند وجود تغييرات غير محفوظة ───
    const formState = { salonName, ownerName, ownerPhone, logoUrl, settings, bio, socialLinks, themeColors, barbers, services, paymentSettings };
    const [savedForm, setSavedForm] = useState(() => formState);
    const [savedTemplates, setSavedTemplates] = useState(() => whatsappTemplates || {});
    const [saveFeedback, setSaveFeedback] = useState(null);
    const isFormDirty = JSON.stringify(formState) !== JSON.stringify(savedForm);
    const areTemplatesDirty = JSON.stringify(whatsappTemplates || {}) !== JSON.stringify(savedTemplates);
    const isDirty = isFormDirty || areTemplatesDirty;

    const discardChanges = () => {
        setSalonName(savedForm.salonName);
        setOwnerName(savedForm.ownerName);
        setOwnerPhone(savedForm.ownerPhone);
        setLogoUrl(savedForm.logoUrl);
        setSettings(savedForm.settings);
        setBio(savedForm.bio);
        setSocialLinks(savedForm.socialLinks);
        setThemeColors(savedForm.themeColors);
        setBarbers(savedForm.barbers);
        setServices(savedForm.services);
        setPaymentSettings(savedForm.paymentSettings);
        setWhatsappTemplates(savedTemplates);
        setTemplateError('');
        setSaveFeedback(null);
    };

    const saveAllChanges = async (event) => {
        event?.preventDefault();
        setSaveFeedback(null);
        if (isFormDirty) {
            const result = await handleSaveSettings();
            if (!result?.ok) {
                setSaveFeedback({ ok: false, text: result?.message || 'تعذر حفظ التغييرات.' });
                return;
            }
            setSavedForm({
                ...formState,
                barbers: result.barbers || formState.barbers,
                paymentSettings: result.paymentSettings || formState.paymentSettings,
            });
        }
        if (areTemplatesDirty) {
            const templatesSaved = await handleSaveTemplates();
            if (!templatesSaved) {
                setSaveFeedback({ ok: false, text: 'تعذر حفظ نصوص الرسائل. راجع النص وحاول مرة أخرى.' });
                return;
            }
        }
        setSaveFeedback({ ok: true, text: 'تم حفظ التغييرات.' });
        setTimeout(() => setSaveFeedback((current) => (current?.ok ? null : current)), 3000);
    };

    // ─── الأجهزة: فتح الكشك على هذا الجهاز ونسخ الروابط ───
    const isPremium = currentPlan === 'Premium';
    const openKioskOnThisDevice = async () => {
        if (!isPremium) {
            setUpsellConfig({ isOpen: true, featureName: 'وضع الكشك', requiredPlan: 'Premium' });
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
            alert('تعذر فتح الكشك، حاول مرة أخرى.');
        }
    };
    const [copiedLink, setCopiedLink] = useState('');
    const copyDeviceLink = async (key, url) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedLink(key);
            setTimeout(() => setCopiedLink(''), 2000);
        } catch { setCopiedLink(''); }
    };

    // يطبق بيانات الربط القادمة من أي وسيط (WaSender: جلسة + QR، Whatsi: مفتاح API + حالة الرقم)
    const applyWaSession = (session) => {
        if (!session) return;
        const status = session.status?.toUpperCase();
        setWaStatus(status);
        if (session.provider) setWaProvider(session.provider);
        if (session.provider === 'whatsi') {
            setWhatsiInfo(session);
            return;
        }
        if (status !== 'CONNECTED' && session.qr_code) setQrCode(session.qr_code);
    };

    useEffect(() => {
        const fetchWaStatus = async () => {
            try {
                const res = await API.get('/whatsapp/session-data');
                applyWaSession(res.data?.session);
            } catch { console.log('لا توجد جلسة واتساب نشطة حالياً.'); }
        };
        const fetchWaProviders = async () => {
            try {
                const res = await API.get('/whatsapp/providers');
                const available = (res.data?.providers || []).filter((provider) => provider.available);
                setWaProviders(available);
                if (available.length && !available.some((provider) => provider.id === 'wasender')) {
                    setSelectedWaProvider(available[0].id);
                }
            } catch { setWaProviders([]); }
        };
        fetchWaStatus();
        fetchWaProviders();
    }, []);

    useEffect(() => {
        let interval;
        const pendingStates = ['CREATED', 'STARTING', 'NEED_SCAN', 'SCAN_QR_CODE', 'CONNECTING'];
        const currentStatus = waStatus?.toUpperCase();

        if (pendingStates.includes(currentStatus)) {
            interval = setInterval(async () => {
                try {
                    const res = await API.get(`/whatsapp/session-data?t=${new Date().getTime()}`);
                    applyWaSession(res.data?.session);
                } catch (error) { console.error('خطأ في تحديث الباركود', error); }
            }, 5000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [waStatus]);

    const handleConnectWhatsapp = async () => {
        setIsWaLoading(true);
        try {
            await API.post('/whatsapp/create-session', { provider: 'wasender' });
            setWaProvider('wasender');
            setWaStatus('STARTING');
            setTimeout(async () => {
                try {
                    const qrRes = await API.get('/whatsapp/session-data');
                    applyWaSession(qrRes.data?.session);
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
            setWhatsiInfo(null);
            setWaProvider('');
        } catch { alert('حدث خطأ أثناء إلغاء الربط.'); }
        finally { setIsWaLoading(false); }
    };

    // ربط Whatsi أو تحديث إعداداته؛ يرجع { ok, message } لعرضه داخل النموذج
    const handleSaveWhatsi = async (payload) => {
        setIsWaLoading(true);
        try {
            const res = await API.put('/whatsapp/whatsi', payload);
            applyWaSession(res.data?.session);
            return { ok: true, message: res.data?.message };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'تعذر حفظ إعدادات Whatsi.' };
        } finally {
            setIsWaLoading(false);
        }
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
        setIsSavingTemplates(true);
        try {
            const res = await API.put('/appointments/settings/whatsapp/templates', { templates: whatsappTemplates });
            setWhatsappTemplates(res.data.templates);
            setSavedTemplates(res.data.templates);
            return true;
        } catch (error) {
            setTemplateError(error.response?.data?.message || 'تعذر حفظ الرسائل. حاول مرة أخرى.');
            return false;
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

    const pageHidden = (id) => activePage !== id;
    const isSaving = isSavingSettings || isSavingTemplates;
    const bookingUrl = `https://www.miqass.app/${slug}`;
    const tvUrl = `https://www.miqass.app/tv/${slug}`;
    const staffUrl = `https://www.miqass.app/barber/${slug}`;

    return (
        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pb-28">
            <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
                {/* قائمة صفحات الإعدادات */}
                <nav aria-label="صفحات الإعدادات" className="lg:sticky lg:top-4 lg:self-start">
                    <label className="block lg:hidden">
                        <span className="sr-only">صفحة الإعدادات</span>
                        <select value={activePage} onChange={(event) => setActivePage(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-black text-slate-800">
                            {SETTINGS_GROUPS.map((group) => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.pages.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <div className="hidden rounded-lg border border-slate-200 bg-white p-2 lg:block">
                        {SETTINGS_GROUPS.map((group) => (
                            <div key={group.label} className="py-1.5">
                                <p className="px-3 pb-1 pt-2 text-[11px] font-black text-slate-400">{group.label}</p>
                                {group.pages.map((page) => {
                                    const PageIcon = page.icon;
                                    const isActive = page.id === activePage;
                                    return (
                                        <button
                                            key={page.id}
                                            type="button"
                                            aria-current={isActive ? 'page' : undefined}
                                            onClick={() => setActivePage(page.id)}
                                            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-right text-sm font-bold transition-colors ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                                        >
                                            <PageIcon size={16} className="shrink-0" />
                                            {page.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </nav>

                <div className="min-w-0 space-y-4">
                    <header className="rounded-lg border border-slate-200 bg-white p-5">
                        <h2 className="text-xl font-black text-slate-800">{activePageInfo.label}</h2>
                        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{activePageInfo.description}</p>
                    </header>

                    <form
                        id="settings-form"
                        onSubmit={saveAllChanges}
                        // إذا كان حقل غير مكتمل في صفحة أخرى، ننتقل إليها ليظهر سبب منع الحفظ
                        onInvalidCapture={(event) => {
                            const page = event.target.closest('[data-settings-page]');
                            if (page && page.dataset.settingsPage !== activePage) setActivePage(page.dataset.settingsPage);
                        }}
                    >
                        <div data-settings-page="profile" hidden={pageHidden('profile')}>
                            <IdentitySection
                                salonName={salonName} setSalonName={setSalonName}
                                ownerName={ownerName} setOwnerName={setOwnerName}
                                ownerPhone={ownerPhone} setOwnerPhone={setOwnerPhone}
                                logoUrl={logoUrl} setLogoUrl={setLogoUrl}
                                settings={settings} setSettings={setSettings}
                                bio={bio} setBio={setBio}
                                socialLinks={socialLinks} setSocialLinks={setSocialLinks}
                                themeColors={themeColors} setThemeColors={setThemeColors}
                                fileInputRef={fileInputRef}
                                handleLogoUpload={handleLogoUpload}
                            />
                        </div>

                        <div data-settings-page="hours" hidden={pageHidden('hours')}>
                            <BookingHoursSection
                                settings={settings} setSettings={setSettings}
                                newClosedDate={newClosedDate} setNewClosedDate={setNewClosedDate}
                            />
                        </div>

                        {['barbers', 'services'].map((part) => (
                            <div key={part} data-settings-page={part} hidden={pageHidden(part)}>
                                <TeamSection
                                    part={part}
                                    settings={settings}
                                    barbers={barbers}
                                    setBarbers={setBarbers}
                                    services={services}
                                    themeColors={themeColors}
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
                            </div>
                        ))}

                        <div data-settings-page="messages" hidden={pageHidden('messages')} className="space-y-4">
                            <MarketingSection settings={settings} setSettings={setSettings} currentPlan={currentPlan} setUpsellConfig={setUpsellConfig} />
                            <IntegrationsSection
                                part="templates"
                                whatsappTemplates={whatsappTemplates}
                                setWhatsappTemplates={setWhatsappTemplates}
                                whatsappTemplateDefaults={whatsappTemplateDefaults}
                                activeMessageType={activeMessageType}
                                currentPlan={currentPlan}
                                setActiveMessageType={setActiveMessageType}
                                setTemplateError={setTemplateError}
                                setTemplateSaved={() => {}}
                                setUpsellConfig={setUpsellConfig}
                                templateError={templateError}
                            />
                        </div>

                        <div data-settings-page="deposit" hidden={pageHidden('deposit')}>
                            <PaymentSection
                                paymentSettings={paymentSettings}
                                setPaymentSettings={setPaymentSettings}
                                currentPlan={currentPlan}
                                setUpsellConfig={setUpsellConfig}
                            />
                        </div>
                    </form>

                    <div hidden={pageHidden('whatsapp')}>
                        <IntegrationsSection
                            part="connection"
                            whatsappTemplates={whatsappTemplates}
                            setWhatsappTemplates={setWhatsappTemplates}
                            whatsappTemplateDefaults={whatsappTemplateDefaults}
                            activeMessageType={activeMessageType}
                            currentPlan={currentPlan}
                            handleConnectWhatsapp={handleConnectWhatsapp}
                            handleDisconnectWhatsapp={handleDisconnectWhatsapp}
                            isWaLoading={isWaLoading}
                            qrCode={qrCode}
                            whatsiInfo={whatsiInfo}
                            handleSaveWhatsi={handleSaveWhatsi}
                            waProvider={waProvider}
                            waProviders={waProviders}
                            selectedWaProvider={selectedWaProvider}
                            setSelectedWaProvider={setSelectedWaProvider}
                            setActiveMessageType={setActiveMessageType}
                            setTemplateError={setTemplateError}
                            setTemplateSaved={() => {}}
                            setUpsellConfig={setUpsellConfig}
                            templateError={templateError}
                            waStatus={waStatus}
                        />
                    </div>

                    <div hidden={pageHidden('einvoice')}>
                        <PageCard>
                            <ZakatySection onTaxNumberSaved={setTaxNumber} />
                        </PageCard>
                    </div>

                    <div hidden={pageHidden('kiosk')} className="space-y-4">
                        <PageCard title="فتح الكشك على هذا الجهاز">
                            <p className="text-sm font-bold leading-7 text-slate-500">
                                إذا كنت على جهاز الكشك نفسه، افتحه من هنا ويتفعّل الجهاز مباشرة. لتفعيل جهاز آخر، استخدم رمز التفعيل أدناه.
                            </p>
                            <button type="button" onClick={openKioskOnThisDevice} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800">
                                <ExternalLink size={15} /> فتح الكشك
                            </button>
                        </PageCard>
                        <KioskSection currentPlan={currentPlan} />
                    </div>

                    <div hidden={pageHidden('screens')} className="space-y-4">
                        {[
                            { key: 'tv', title: 'شاشة الطابور', text: 'افتح الرابط على تلفزيون الصالون لعرض حالة كل كرسي والدور القادم. لا تُعرض أرقام العملاء.', url: tvUrl },
                            { key: 'staff', title: 'بوابة الحلاقين', text: 'يدخل كل حلاق من هذا الرابط برمزه السري ليرى مواعيده ويسجّل إنهاء الخدمة. رموز الحلاقين في صفحة الحلاقون.', url: staffUrl },
                        ].map((item) => (
                            <PageCard key={item.key} title={item.title}>
                                <p className="text-sm font-bold leading-7 text-slate-500">{item.text}</p>
                                {isPremium ? (
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <code dir="ltr" className="min-w-0 max-w-full truncate rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">{item.url}</code>
                                        <button type="button" onClick={() => copyDeviceLink(item.key, item.url)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                                            <Copy size={13} /> {copiedLink === item.key ? 'تم النسخ' : 'نسخ'}
                                        </button>
                                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                                            <ExternalLink size={13} /> فتح
                                        </a>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setUpsellConfig({ isOpen: true, featureName: item.title, requiredPlan: 'Premium' })} className="mt-4 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
                                        متاحة في الباقة المميزة
                                    </button>
                                )}
                            </PageCard>
                        ))}
                        <PageCard title="رابط الحجز للعملاء">
                            <div className="flex flex-wrap items-center gap-2">
                                <code dir="ltr" className="min-w-0 max-w-full truncate rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">{bookingUrl}</code>
                                <button type="button" onClick={() => copyDeviceLink('booking', bookingUrl)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                                    <Copy size={13} /> {copiedLink === 'booking' ? 'تم النسخ' : 'نسخ'}
                                </button>
                            </div>
                        </PageCard>
                    </div>

                    {activePage === 'plan' && (
                        <BillingTab subscription={subscription} tenantId={tenantId} campaignCredits={campaignCredits} promoBanner={promoBanner} />
                    )}
                </div>
            </div>

            {/* شريط الحفظ الموحد */}
            {(isDirty || saveFeedback) && (
                <div className="fixed inset-x-0 bottom-4 z-40 px-3 sm:bottom-6 lg:pl-8 lg:pr-[34rem]" role="region" aria-label="حفظ التغييرات">
                    <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-2xl sm:p-4">
                        <p role={saveFeedback && !saveFeedback.ok ? 'alert' : 'status'} className={`text-sm font-black ${saveFeedback ? (saveFeedback.ok ? 'text-emerald-700' : 'text-red-600') : 'text-slate-800'}`}>
                            {saveFeedback?.text || (FORM_PAGES.has(activePage) ? 'لديك تغييرات غير محفوظة.' : 'لديك تغييرات غير محفوظة في صفحات أخرى.')}
                        </p>
                        {isDirty && (
                            <div className="flex gap-2">
                                <button type="button" onClick={discardChanges} disabled={isSaving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                                    <RotateCcw size={15} /> تراجع
                                </button>
                                <button type="submit" form="settings-form" disabled={isSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">
                                    <Save size={15} /> {isSaving ? 'جاري الحفظ...' : 'حفظ'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <UpgradeModal isOpen={upsellConfig.isOpen} onClose={() => setUpsellConfig({ ...upsellConfig, isOpen: false })} requiredPlan={upsellConfig.requiredPlan} featureName={upsellConfig.featureName} />
        </MotionDiv>
    );
};

export default SettingsTab;
