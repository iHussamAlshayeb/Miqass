import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import OneSignal from 'react-onesignal';
import * as XLSX from 'xlsx';
import TourGuide from '../components/dashboard/TourGuide';
import { motion, AnimatePresence } from 'framer-motion';

import { getLocalDate, formatBookingTime, formatTime12Hour, getTimePeriod } from '../utils/helpers';

import Sidebar from '../components/dashboard/Sidebar';
import DailyTab from '../components/dashboard/DailyTab';
import AllTab from '../components/dashboard/AllTab';
import SettingsTab from '../components/dashboard/SettingsTab';
import BillingTab from '../components/dashboard/BillingTab';
import ReviewsTab from '../components/dashboard/ReviewsTab';
import CustomersTab from '../components/dashboard/CustomersTab';
import BroadcastsTab from '../components/dashboard/BroadcastsTab';
import StatisticsTab from '../components/dashboard/StatisticsTab';

const DashboardScreen = () => {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('statistics');
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

    // ==========================================
    // 💡 [NEW] حالة إعدادات الدفع الإلكتروني (Moyasar)
    // ==========================================
    const [paymentSettings, setPaymentSettings] = useState({
        isOnlinePaymentEnabled: false,
        depositAmount: 0,
        moyasarPublishableKey: '',
        moyasarSecretKey: '',
        hasSecretKey: false
    });

    const [whatsappSettings, setWhatsappSettings] = useState({ apiKey: '', isEnabled: false });
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [newClosedDate, setNewClosedDate] = useState('');

    const [barbers, setBarbers] = useState([]);
    const [services, setServices] = useState([]);
    const [taxNumber, setTaxNumber] = useState('');
    const [wafeqApiKey, setWafeqApiKey] = useState('');

    // ==========================================
    // 💡 حالة شريط الإعلانات العلوي
    // ==========================================
    const [promoBanner, setPromoBanner] = useState(null);

    useEffect(() => {
        const initOneSignal = async () => {
            try {
                await OneSignal.init({ appId: "df2b3be8-ac20-4e4b-9f52-fad5648afd2b", allowLocalhostAsSecureOrigin: true });
                OneSignal.Slidedown.promptPush();
            } catch (error) { console.error("OneSignal Error:", error); }
        };
        initOneSignal();

        // 💡 جلب بيانات العرض الترويجي من السيرفر
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

    const fetchAppointments = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const appRes = await API.get(`/appointments/barber?date=${selectedDate}`);
            setAppointments(appRes.data.appointments);

            const allAppRes = await API.get('/appointments/all-upcoming');
            setAllAppointments(allAppRes.data.appointments);
        } catch (error) {
            if (error.response?.status === 401) {
                localStorage.removeItem('token');
                navigate('/login');
            }
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    }, [selectedDate, navigate]);

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

                    // 💡 تعبئة إعدادات الدفع إذا كانت موجودة
                    if (settingsRes.data.paymentSettings) {
                        setPaymentSettings(settingsRes.data.paymentSettings);
                    }

                    setBarbers(settingsRes.data.barbers || []);
                    setServices(settingsRes.data.services || []);
                    setTaxNumber(settingsRes.data.taxNumber || '');
                    setWafeqApiKey(settingsRes.data.wafeqApiKey || '');

                    const currentTenantId = settingsRes.data.tenantId;
                    if (currentTenantId) OneSignal.User.addTag("tenantId", currentTenantId.toString());
                }

                const reviewsRes = await API.get('/appointments/reviews');
                setReviews(reviewsRes.data || []);

                try {
                    const statusRes = await API.get('/appointments/whatsapp-status');
                    setApiStatus(statusRes.data.status === 'API_ACTIVE' ? 'ONLINE' : 'ERROR');
                } catch (e) { setApiStatus('ERROR'); }

            } catch (error) {
                if (error.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); }
            } finally { setIsLoading(false); }
        };

        fetchInitialData();
    }, [navigate]);

    useEffect(() => {
        fetchAppointments();
    }, [fetchAppointments]);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await API.get('/appointments/reviews');
                setReviews(res.data || []);
            } catch (e) { }
        }, 20000);
        return () => clearInterval(interval);
    }, []);

    const handleSaveSettings = async (e) => {
        if (e) e.preventDefault();
        setIsSavingSettings(true);
        try {
            await API.put('/appointments/settings', {
                ...settings, salonName, ownerName, ownerPhone, barbers, services, taxNumber, wafeqApiKey, bio, socialLinks,
                branding: { logoUrl, primaryColor: themeColors.primaryColor, secondaryColor: themeColors.secondaryColor },
                paymentSettings // 💳 إرسال إعدادات الدفع للباك إند
            });
            alert('تم حفظ إعدادات الصالون بنجاح! ✅');
        } catch (error) {
            alert(error.response?.data?.message || 'حدث خطأ أثناء حفظ الإعدادات');
        } finally { setIsSavingSettings(false); }
    };

    const handleSaveWhatsappSettings = async () => {
        setIsSavingSettings(true);
        try {
            await API.put('/appointments/settings/whatsapp', whatsappSettings);
            alert('تم تحديث ربط الواتساب بنجاح! 💬✅');
        } catch (error) { alert('حدث خطأ أثناء التحديث'); } finally { setIsSavingSettings(false); }
    };

    const handleStatusChange = async (id, newStatus, reason = null) => {
        try {
            const payload = newStatus === 'Cancelled' && reason ? { status: newStatus, cancelReason: reason } : { status: newStatus };
            await API.put(`/appointments/status/${id}`, payload);
            setAppointments(prev => prev.map(app => app._id === id ? { ...app, status: newStatus, cancelReason: reason } : app));
            setAllAppointments(prev => prev.map(app => app._id === id ? { ...app, status: newStatus, cancelReason: reason } : app));
        } catch (error) { alert('حدث خطأ أثناء تحديث حالة الموعد.'); }
    };

    const handleSingleWhatsApp = async (app) => {
        if (!window.confirm(`هل تريد إرسال رسالة تذكير للعميل ${app.childName} عبر الواتساب؟`)) return;
        try {
            const res = await API.post(`/appointments/resend-whatsapp/${app._id}`);
            alert(res.data.message || 'تم إرسال التذكير بنجاح');
        } catch (error) { alert('حدث خطأ، تأكد من اتصال الخدمة.'); }
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

    const handleLogout = () => { localStorage.removeItem('token'); navigate('/login'); };

    if (isLoading && !appointments.length && !salonName) {
        return (
            <div className="min-h-screen bg-slate-50 font-arabic text-right overflow-hidden" dir="rtl">
                <nav className="bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-200 rounded-xl animate-pulse"></div>
                        <div className="space-y-2 hidden sm:block">
                            <div className="h-5 w-32 bg-slate-200 rounded-md animate-pulse"></div>
                            <div className="h-3 w-20 bg-slate-200 rounded-md animate-pulse"></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="h-10 w-24 md:w-32 bg-slate-200 rounded-xl animate-pulse"></div>
                        <div className="h-10 w-10 md:w-32 bg-slate-200 rounded-xl animate-pulse"></div>
                    </div>
                </nav>
                <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-3 space-y-4">
                        <div className="h-12 bg-slate-200 rounded-xl animate-pulse"></div>
                        <div className="h-12 bg-slate-200 rounded-xl animate-pulse"></div>
                        <div className="h-12 bg-slate-200 rounded-xl animate-pulse"></div>
                    </div>
                    <div className="lg:col-span-9 bg-white rounded-[2rem] p-6 h-[600px] animate-pulse border border-slate-100">
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-arabic text-right selection:bg-blue-200" dir="rtl">
            <TourGuide />

            {/* ========================================== */}
            {/* شريط الإعلانات العلوي (Announcement Bar) */}
            {/* ========================================== */}
            <AnimatePresence>
                {promoBanner && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 flex justify-between items-center text-sm font-bold z-[60] relative shadow-md"
                    >
                        <div className="flex-1 text-center flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                            <div className="flex items-center gap-2">
                                <span className="animate-bounce text-lg">🔥</span>
                                <span>عرض خاص: <strong className="text-amber-950 bg-amber-400/80 px-2 py-0.5 rounded-md mx-1">{promoBanner.name}</strong></span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 sm:mt-0">
                                <span>استفد من خصم {promoBanner.percentage}% على ترقية باقتك!</span>
                                <button
                                    onClick={() => { setActiveTab('billing'); setPromoBanner(null); }}
                                    className="bg-white text-orange-600 hover:bg-orange-50 px-4 py-1 rounded-lg transition-all border border-transparent shadow-sm text-xs font-black active:scale-95"
                                >
                                    رقي الآن 🚀
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setPromoBanner(null)}
                            className="text-white hover:bg-black/10 w-8 h-8 flex items-center justify-center rounded-full transition-colors absolute left-2 top-1/2 -translate-y-1/2"
                            title="إغلاق"
                        >
                            ✕
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <nav className="bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-3">
                    <span className="text-3xl bg-blue-50 p-2 rounded-xl hidden sm:block">✂️</span>
                    <div>
                        <h1 className="font-black text-xl text-slate-800">إدارة الصالون</h1>
                        <p className="text-xs font-bold text-slate-400" dir="ltr">{slug ? `miqass.app/${slug}` : 'لوحة التحكم'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <a href="https://wa.me/966541993290" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 md:gap-2 bg-emerald-50 text-emerald-600 font-bold px-3 py-2 md:px-4 md:py-2 rounded-xl hover:bg-emerald-500 hover:text-white transition-all text-xs md:text-sm active:scale-95 shadow-sm">
                        <span className="hidden md:inline">الدعم الفني</span><span className="text-base">🎧</span>
                    </a>
                    <button onClick={handleLogout} className="flex items-center gap-1.5 text-red-500 font-bold bg-red-50 px-3 py-2 md:px-4 md:py-2 rounded-xl hover:bg-red-50 hover:text-white transition-all text-xs md:text-sm active:scale-95 shadow-sm">
                        <span className="hidden md:inline">تسجيل الخروج</span><span className="text-base md:hidden">🚪</span>
                    </button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} appointments={appointments} allAppointments={allAppointments} apiStatus={apiStatus} whatsappSettings={whatsappSettings} slug={slug} subscription={subscription} />

                <div className="lg:col-span-9">
                    {activeTab === 'statistics' && <StatisticsTab allAppointments={allAppointments} />}
                    {activeTab === 'appointments' && <DailyTab selectedDate={selectedDate} setSelectedDate={setSelectedDate} isLoading={isLoading} appointments={appointments} handleStatusChange={handleStatusChange} handleSingleWhatsApp={handleSingleWhatsApp} whatsappSettings={whatsappSettings} refreshAppointments={fetchAppointments} />}
                    {activeTab === 'all' && <AllTab isLoading={isLoading} allAppointments={allAppointments} exportToExcel={exportToExcel} handleStatusChange={handleStatusChange} />}
                    {activeTab === 'reviews' && <ReviewsTab reviews={reviews} isLoading={isLoading} />}
                    {activeTab === 'customers' && <CustomersTab />}
                    {activeTab === 'broadcasts' && <BroadcastsTab tenantId={tenantId} />}
                    {activeTab === 'settings' &&
                        <SettingsTab
                            salonName={salonName} setSalonName={setSalonName}
                            ownerName={ownerName} setOwnerName={setOwnerName}
                            ownerPhone={ownerPhone} setOwnerPhone={setOwnerPhone}
                            logoUrl={logoUrl} setLogoUrl={setLogoUrl}
                            settings={settings} setSettings={setSettings}
                            whatsappSettings={whatsappSettings} setWhatsappSettings={setWhatsappSettings}
                            handleSaveSettings={handleSaveSettings} handleSaveWhatsappSettings={handleSaveWhatsappSettings}
                            isSavingSettings={isSavingSettings}
                            newClosedDate={newClosedDate} setNewClosedDate={setNewClosedDate}
                            barbers={barbers} setBarbers={setBarbers}
                            subscription={subscription}
                            services={services} setServices={setServices}
                            taxNumber={taxNumber} setTaxNumber={setTaxNumber}
                            wafeqApiKey={wafeqApiKey} setWafeqApiKey={setWafeqApiKey}
                            bio={bio} setBio={setBio}
                            socialLinks={socialLinks} setSocialLinks={setSocialLinks}
                            themeColors={themeColors} setThemeColors={setThemeColors}
                            // 💳 💡 تمرير حالات الدفع إلى SettingsTab
                            paymentSettings={paymentSettings} setPaymentSettings={setPaymentSettings}
                        />
                    }
                    {activeTab === 'billing' && <BillingTab subscription={subscription} tenantId={tenantId} campaignCredits={campaignCredits} promoBanner={promoBanner} />}
                </div>
            </div>
        </div>
    );
};

export default DashboardScreen;