import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { disconnectOneSignal } from '../services/onesignal';
import * as XLSX from 'xlsx';
import TourGuide from '../components/dashboard/TourGuide';
import {
    BadgePercent,
    ExternalLink,
    Headphones,
    LogOut,
    Menu,
    X,
} from 'lucide-react';

import { getLocalDate, formatBookingTime, formatTime12Hour, getTimePeriod } from '../utils/helpers';

import Sidebar from '../components/dashboard/Sidebar';
import DailyTab from '../components/dashboard/DailyTab';
import AllTab from '../components/dashboard/AllTab';
import SettingsTab from '../components/dashboard/SettingsTab';
import ReviewsTab from '../components/dashboard/ReviewsTab';
import CustomersTab from '../components/dashboard/CustomersTab';
import BroadcastsTab from '../components/dashboard/BroadcastsTab';
import StatisticsTab from '../components/dashboard/StatisticsTab';
import PushNotificationPrompt from '../components/dashboard/PushNotificationPrompt';
import SalesTab from '../components/dashboard/SalesTab';
import ProductsTab from '../components/dashboard/ProductsTab';
import ExpensesTab from '../components/dashboard/ExpensesTab';

const pageMeta = {
    statistics: {
        title: 'لوحة الأداء',
        description: 'الإيراد والخدمات وأداء الحلاقين خلال الفترة المختارة، مع المقارنة بالفترة السابقة.',
    },
    appointments: {
        title: 'مواعيد اليوم',
        description: 'إدارة الطابور اليومي، إكمال الخدمات، وطباعة الفواتير.',
    },
    all: {
        title: 'سجل الحجوزات',
        description: 'بحث ومراجعة كل الحجوزات القادمة والسابقة.',
    },
    sales: {
        title: 'نقطة البيع',
        description: 'بيع الخدمات والمنتجات وتسجيل الدفعات.',
    },
    products: {
        title: 'المنتجات والمخزون',
        description: 'إدارة المنتجات، الأسعار، وحركات المخزون.',
    },
    expenses: {
        title: 'المصروفات',
        description: 'تسجيل مصروفات التشغيل ومتابعة التكلفة اليومية.',
    },
    reviews: {
        title: 'التقييمات',
        description: 'متابعة رضا العملاء والتعليقات الجديدة.',
    },
    customers: {
        title: 'العملاء والولاء',
        description: 'قاعدة العملاء، الزيارات، وبرامج الولاء.',
    },
    broadcasts: {
        title: 'الحملات',
        description: 'إدارة حملات التواصل والعروض.',
    },
    settings: {
        title: 'إعدادات النظام',
        description: 'أوقات العمل، الخدمات، الدفع، والهوية البصرية.',
    },
    billing: {
        title: 'الاشتراك',
        description: 'إدارة الباقة، الرصيد، والترقية.',
    },
};

const DashboardScreen = () => {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('statistics');
    const [checkoutAppointment, setCheckoutAppointment] = useState(null);
    const clearCheckout = useCallback(() => setCheckoutAppointment(null), []);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getLocalDate());
    const [isLoading, setIsLoading] = useState(true);
    const [apiStatus, setApiStatus] = useState('CHECKING');

    const [appointments, setAppointments] = useState([]);
    const [allAppointments, setAllAppointments] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [subscription, setSubscription] = useState(null);
    const [slug, setSlug] = useState('');
    const [tenantId, setTenantId] = useState(null);
    const [campaignCredits, setCampaignCredits] = useState(0);

    const [salonName, setSalonName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [ownerPhone, setOwnerPhone] = useState('');
    const [logoUrl, setLogoUrl] = useState('');

    const [bio, setBio] = useState('');
    const [socialLinks, setSocialLinks] = useState({ instagram: '', tiktok: '', snapchat: '' });
    const [themeColors, setThemeColors] = useState({ primaryColor: '#2563eb', secondaryColor: '#e2e8f0' });

    const [settings, setSettings] = useState({
        startTime: '16:00', endTime: '22:00', slotDuration: 30, closedDates: [], breakStart: '', breakEnd: '', maxBookingDate: '', locationUrl: '', googleReviewLink: '', enableGoogleReviews: false
    });

    // إعدادات الدفع الإلكتروني للصالون
    const [paymentSettings, setPaymentSettings] = useState({
        isOnlinePaymentEnabled: false,
        depositAmount: 0,
        provider: 'moyasar',
        moyasarSecretKey: '',
        hasSecretKey: false,
    });

    const [whatsappSettings, setWhatsappSettings] = useState({ apiKey: '', isEnabled: false });
    const [whatsappTemplates, setWhatsappTemplates] = useState({});
    const [whatsappTemplateDefaults, setWhatsappTemplateDefaults] = useState({});
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [newClosedDate, setNewClosedDate] = useState('');

    const [barbers, setBarbers] = useState([]);
    const [services, setServices] = useState([]);
    const [taxNumber, setTaxNumber] = useState('');

    const [promoBanner, setPromoBanner] = useState(null);

    useEffect(() => {
        const fetchPromo = async () => {
            try {
                const res = await API.get('/public/pricing');
                if (res.data?.discount?.isActive) {
                    setPromoBanner(res.data.discount);
                }
            } catch (error) {
                console.error("خطأ في جلب الإعلانات:", error);
            }
        };
        fetchPromo();
    }, []);

    const clearSession = useCallback(async () => {
        await disconnectOneSignal().catch(() => {});
        localStorage.removeItem('token');
        navigate('/login');
    }, [navigate]);

    const fetchAppointments = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const appRes = await API.get(`/appointments/barber?date=${selectedDate}`);
            setAppointments(appRes.data.appointments);

            const allAppRes = await API.get('/appointments/all-upcoming');
            setAllAppointments(allAppRes.data.appointments);
        } catch (error) {
            if (error.response?.status === 401) {
                await clearSession();
            }
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    }, [selectedDate, clearSession]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return navigate('/login');

        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const settingsRes = await API.get('/appointments/settings');
                if (settingsRes.data) {
                    setSettings(prev => ({ ...prev, ...(settingsRes.data.settings || settingsRes.data) }));
                    setSubscription(settingsRes.data.subscription);
                    setSlug(settingsRes.data.slug);
                    setTenantId(settingsRes.data.tenantId);
                    setCampaignCredits(settingsRes.data.campaignCredits || 0);
                    if (settingsRes.data.whatsappSettings) setWhatsappSettings(settingsRes.data.whatsappSettings);
                    if (settingsRes.data.whatsappTemplates) setWhatsappTemplates(settingsRes.data.whatsappTemplates);
                    if (settingsRes.data.whatsappTemplateDefaults) setWhatsappTemplateDefaults(settingsRes.data.whatsappTemplateDefaults);
                    setSalonName(settingsRes.data.salonName || '');
                    setOwnerName(settingsRes.data.ownerName || '');
                    setOwnerPhone(settingsRes.data.ownerPhone || '');

                    setLogoUrl(settingsRes.data.branding?.logoUrl || '');
                    setBio(settingsRes.data.bio || '');
                    setSocialLinks(settingsRes.data.socialLinks || { instagram: '', tiktok: '', snapchat: '' });
                    if (settingsRes.data.branding) {
                        setThemeColors({
                            primaryColor: settingsRes.data.branding.primaryColor || '#2563eb',
                            secondaryColor: settingsRes.data.branding.secondaryColor || '#e2e8f0'
                        });
                    }

                    if (settingsRes.data.paymentSettings) {
                        setPaymentSettings(settingsRes.data.paymentSettings);
                    }

                    setBarbers(settingsRes.data.barbers || []);
                    setServices(settingsRes.data.services || []);
                    setTaxNumber(settingsRes.data.taxNumber || '');

                }

                const reviewsRes = await API.get('/appointments/reviews');
                setReviews(reviewsRes.data || []);

                try {
                    const statusRes = await API.get('/appointments/whatsapp-status');
                    setApiStatus(statusRes.data.status === 'API_ACTIVE' ? 'ONLINE' : 'ERROR');
                } catch { setApiStatus('ERROR'); }

            } catch (error) {
                if (error.response?.status === 401) await clearSession();
            } finally { setIsLoading(false); }
        };

        fetchInitialData();
    }, [navigate, clearSession]);

    useEffect(() => {
        fetchAppointments();
    }, [fetchAppointments]);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await API.get('/appointments/reviews');
                setReviews(res.data || []);
            } catch {
                // تجاهل أخطاء التحديث اللحظية حتى لا تنقطع لوحة التحكم.
            }
        }, 20000);
        return () => clearInterval(interval);
    }, []);

    // يُستدعى من شريط الحفظ في الإعدادات؛ يرجع النتيجة بدل التنبيهات المنبثقة
    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            await API.put('/appointments/settings', {
                ...settings, salonName, ownerName, ownerPhone, barbers, services, taxNumber, bio, socialLinks,
                branding: { logoUrl, primaryColor: themeColors.primaryColor, secondaryColor: themeColors.secondaryColor },
                paymentSettings
            });
            // إعادة تحميل الحلاقين والدفع: الرموز والمفاتيح السرية لا تُرجع من السيرفر (فقط hasPin / hasSecretKey)
            let refreshedBarbers = null;
            let refreshedPayment = null;
            try {
                const refreshed = await API.get('/appointments/settings');
                refreshedBarbers = refreshed.data.barbers || [];
                setBarbers(refreshedBarbers);
                if (refreshed.data.paymentSettings) {
                    refreshedPayment = refreshed.data.paymentSettings;
                    setPaymentSettings(refreshedPayment);
                }
            } catch { /* الحفظ نجح؛ التحديث المحلي اختياري */ }
            return { ok: true, barbers: refreshedBarbers, paymentSettings: refreshedPayment };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'حدث خطأ أثناء حفظ الإعدادات' };
        } finally { setIsSavingSettings(false); }
    };

    const handleSaveWhatsappSettings = async () => {
        setIsSavingSettings(true);
        try {
            await API.put('/appointments/settings/whatsapp', whatsappSettings);
            alert('تم تحديث ربط الواتساب بنجاح');
        } catch { alert('حدث خطأ أثناء التحديث'); } finally { setIsSavingSettings(false); }
    };

    const handleStatusChange = async (id, newStatus, reason = null) => {
        try {
            const payload = newStatus === 'Cancelled' && reason ? { status: newStatus, cancelReason: reason } : { status: newStatus };
            const res = await API.put(`/appointments/status/${id}`, payload);
            const updatedAppointment = res.data?.appointment || { _id: id, status: newStatus, cancelReason: reason };
            setAppointments(prev => prev.map(app => app._id === id ? { ...app, ...updatedAppointment, status: newStatus, cancelReason: reason } : app));
            setAllAppointments(prev => prev.map(app => app._id === id ? { ...app, ...updatedAppointment, status: newStatus, cancelReason: reason } : app));
        } catch { alert('حدث خطأ أثناء تحديث حالة الموعد.'); }
    };

    const handleSingleWhatsApp = async (app) => {
        if (!window.confirm(`هل تريد إرسال رسالة تذكير للعميل ${app.childName} عبر الواتساب؟`)) return;
        try {
            const res = await API.post(`/appointments/resend-whatsapp/${app._id}`);
            alert(res.data.message || 'تم إرسال التذكير بنجاح');
        } catch { alert('حدث خطأ، تأكد من اتصال الخدمة.'); }
    };

    const exportToExcel = () => {
        if (allAppointments.length === 0) return alert("لا توجد حجوزات لتصديرها.");
        const dataToExport = allAppointments.map(app => {
            const servicesText = app.selectedServices && app.selectedServices.length > 0 ? app.selectedServices.map(srv => srv.name).join('، ') : 'حجز مقعد فقط';
            return {
                'وقت التسجيل': formatBookingTime(app.createdAt), 'التاريخ': app.date, 'الوقت': `${formatTime12Hour(app.timeSlot)} ${getTimePeriod(app.timeSlot)}`,
                'الاسم': app.childName, 'الجوال': app.customerPhone, 'الكرسي': app.chair, 'الخدمات المطلوبة': servicesText,
                'إجمالي الفاتورة (ر.س)': app.totalPrice || 0, 'الحالة': app.status === 'Booked' ? 'محجوز' : app.status === 'Completed' ? 'مكتمل' : 'ملغي'
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "الحجوزات");
        XLSX.writeFile(workbook, `حجوزات_صالون_${getLocalDate()}.xlsx`);
    };

    const handleLogout = () => {
        clearSession();
    };
    const activePage = pageMeta[activeTab] || pageMeta.statistics;
    const dashboardLink = slug ? `https://www.miqass.app/${slug}` : '';
    const handleSetActiveTab = (tab) => {
        setCheckoutAppointment(null);
        setActiveTab(tab);
        setIsSidebarOpen(false);
    };
    const openAppointmentCheckout = (appointment) => {
        setCheckoutAppointment(appointment);
        setActiveTab('sales');
    };

    if (isLoading && !appointments.length && !salonName) {
        return (
            <div className="min-h-screen bg-slate-100 font-arabic text-right" dir="rtl">
                <div className="flex min-h-screen">
                    <div className="hidden w-72 border-l border-slate-200 bg-white p-4 lg:block">
                        <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-200" />
                        <div className="mt-8 space-y-2">
                            {Array.from({ length: 9 }).map((_, index) => (
                                <div key={index} className="h-11 animate-pulse rounded-lg bg-slate-100" />
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 p-4 sm:p-6 lg:p-8">
                        <div className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
                            ))}
                        </div>
                        <div className="mt-6 h-[520px] animate-pulse rounded-lg border border-slate-200 bg-white" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 font-arabic text-right text-slate-900 selection:bg-slate-300" dir="rtl">
            <TourGuide />

            {isSidebarOpen && (
                <button
                    type="button"
                    aria-label="إغلاق القائمة"
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 z-[80] bg-slate-950/40 lg:hidden"
                />
            )}

            <div className="flex min-h-screen">
                <Sidebar
                    activeTab={activeTab}
                    setActiveTab={handleSetActiveTab}
                    appointments={appointments}
                    allAppointments={allAppointments}
                    apiStatus={apiStatus}
                    whatsappSettings={whatsappSettings}
                    slug={slug}
                    subscription={subscription}
                    salonName={salonName}
                    logoUrl={logoUrl}
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                />

                <div className="flex min-w-0 flex-1 flex-col">
                    {promoBanner && (
                        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-900">
                            <div className="mx-auto flex max-w-screen-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-2">
                                    <BadgePercent size={18} className="shrink-0 text-amber-700" />
                                    <span className="truncate">
                                        عرض {promoBanner.name}: خصم {promoBanner.percentage}% على الترقية
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { handleSetActiveTab('billing'); setPromoBanner(null); }}
                                        className="h-8 rounded-lg bg-amber-900 px-3 text-xs font-black text-white hover:bg-amber-800"
                                    >
                                        عرض الاشتراك
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPromoBanner(null)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-100"
                                        aria-label="إغلاق العرض"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
                        <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
                                    aria-label="فتح القائمة"
                                >
                                    <Menu size={20} />
                                </button>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h1 className="truncate text-lg font-black text-slate-950 sm:text-xl">{activePage.title}</h1>
                                        <span className="hidden rounded-md border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-500 sm:inline-flex">
                                            {subscription?.plan || 'Free'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 hidden truncate text-xs font-bold text-slate-500 sm:block">{activePage.description}</p>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                {dashboardLink && (
                                    <a
                                        href={dashboardLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 md:flex"
                                    >
                                        <ExternalLink size={16} />
                                        رابط الحجز
                                    </a>
                                )}
                                <a
                                    href="https://wa.me/966541993290"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 sm:flex"
                                >
                                    <Headphones size={16} />
                                    الدعم
                                </a>
                                <button
                                    onClick={handleLogout}
                                    className="flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-800"
                                >
                                    <LogOut size={16} />
                                    <span className="hidden sm:inline">خروج</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
                        <PushNotificationPrompt tenantId={tenantId} />

                        {activeTab === 'statistics' && <StatisticsTab />}
                        {activeTab === 'appointments' && <DailyTab selectedDate={selectedDate} setSelectedDate={setSelectedDate} isLoading={isLoading} appointments={appointments} handleStatusChange={handleStatusChange} handleSingleWhatsApp={handleSingleWhatsApp} whatsappSettings={whatsappSettings} reviewEnabled={Boolean(settings?.enableGoogleReviews && settings?.googleReviewLink)} refreshAppointments={fetchAppointments} onOpenCheckout={openAppointmentCheckout} />}
                        {activeTab === 'all' && <AllTab isLoading={isLoading} allAppointments={allAppointments} exportToExcel={exportToExcel} handleStatusChange={handleStatusChange} />}
                        {activeTab === 'sales' && <SalesTab services={services} checkoutAppointment={checkoutAppointment} onClearCheckout={clearCheckout} onSaleSaved={() => fetchAppointments(true)} />}
                        {activeTab === 'products' && <ProductsTab />}
                        {activeTab === 'expenses' && <ExpensesTab />}
                        {activeTab === 'reviews' && <ReviewsTab reviews={reviews} isLoading={isLoading} />}
                        {activeTab === 'customers' && <CustomersTab />}
                        {activeTab === 'broadcasts' && <BroadcastsTab tenantId={tenantId} />}
                        {(activeTab === 'settings' || activeTab === 'billing') &&
                            <SettingsTab
                                key={activeTab}
                                initialPage={activeTab === 'billing' ? 'plan' : undefined}
                                slug={slug} tenantId={tenantId} campaignCredits={campaignCredits} promoBanner={promoBanner}
                                salonName={salonName} setSalonName={setSalonName}
                                ownerName={ownerName} setOwnerName={setOwnerName}
                                ownerPhone={ownerPhone} setOwnerPhone={setOwnerPhone}
                                logoUrl={logoUrl} setLogoUrl={setLogoUrl}
                                settings={settings} setSettings={setSettings}
                                whatsappSettings={whatsappSettings} setWhatsappSettings={setWhatsappSettings}
                                whatsappTemplates={whatsappTemplates} setWhatsappTemplates={setWhatsappTemplates}
                                whatsappTemplateDefaults={whatsappTemplateDefaults}
                                handleSaveSettings={handleSaveSettings} handleSaveWhatsappSettings={handleSaveWhatsappSettings}
                                isSavingSettings={isSavingSettings}
                                newClosedDate={newClosedDate} setNewClosedDate={setNewClosedDate}
                                barbers={barbers} setBarbers={setBarbers}
                                subscription={subscription}
                                services={services} setServices={setServices}
                                setTaxNumber={setTaxNumber}
                                bio={bio} setBio={setBio}
                                socialLinks={socialLinks} setSocialLinks={setSocialLinks}
                                themeColors={themeColors} setThemeColors={setThemeColors}
                                paymentSettings={paymentSettings} setPaymentSettings={setPaymentSettings}
                            />
                        }
                    </main>
                </div>
            </div>
        </div>
    );
};

export default DashboardScreen;
