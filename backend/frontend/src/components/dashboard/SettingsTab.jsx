import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../../services/api';
import UpgradeModal from './UpgradeModal';

// 💡 استيراد الأقسام المجزأة
import ZatcaSection from './settings/ZatcaSection';
import MarketingSection from './settings/MarketingSection';

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
    wafeqApiKey, setWafeqApiKey,
    bio, setBio,
    socialLinks, setSocialLinks,
    themeColors, setThemeColors,
    // 💳 💡 تم إضافة حالات الدفع الإلكتروني هنا
    paymentSettings, setPaymentSettings
}) => {

    const [newBarberName, setNewBarberName] = useState('');
    const [newBarberPin, setNewBarberPin] = useState('');
    const [qrCode, setQrCode] = useState('');
    const [waStatus, setWaStatus] = useState('DISCONNECTED');
    const [isWaLoading, setIsWaLoading] = useState(false);

    const [upsellConfig, setUpsellConfig] = useState({ isOpen: false, featureName: '', requiredPlan: '', icon: '' });
    const currentPlan = subscription?.plan || 'Free';
    const fileInputRef = useRef(null);

    const [zatcaOtp, setZatcaOtp] = useState('');
    const [isOnboardingZatca, setIsOnboardingZatca] = useState(false);

    // ==========================================
    // 💡 دوال ZATCA والواتساب
    // ==========================================
    const handleZatcaOnboard = async () => {
        if (!taxNumber || taxNumber.length !== 15) return alert('الرجاء كتابة الرقم الضريبي (15 رقم) أولاً!');
        if (!zatcaOtp || zatcaOtp.length !== 6) return alert('الرجاء إدخال رمز OTP صحيح (6 أرقام).');

        setIsOnboardingZatca(true);
        try {
            const res = await API.post('/zatca/onboard', {
                otp: zatcaOtp,
                taxNumber: taxNumber
            });

            alert(res.data.message || 'تم الربط بنجاح! 🚀');
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
            alert(res.data.message || 'تم إلغاء الربط ومسح المفاتيح بنجاح 🛑');
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
            } catch (error) { console.log('لا توجد جلسة واتساب نشطة حالياً.'); }
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
                } catch (error) { console.error("❌ خطأ في تحديث الباركود", error); }
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
        } catch (error) {
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
        } catch (error) { alert('حدث خطأ أثناء إلغاء الربط.'); }
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

    // ==========================================
    // 💡 دوال الخدمات والطاقم
    // ==========================================
    const handleAddService = () => setServices([...services, { id: Date.now().toString(), name: '', price: '', duration: 30 }]);
    const handleServiceChange = (id, field, value) => setServices(services.map(srv => srv.id === id ? { ...srv, [field]: value } : srv));
    const handleRemoveService = (id) => setServices(services.filter(srv => srv.id !== id));

    const handleAddBarber = () => {
        const val = newBarberName.trim();
        const pinVal = newBarberPin.trim();
        const currentBarbers = barbers || [];

        if (currentPlan === 'Free' && currentBarbers.length >= 2) return setUpsellConfig({ isOpen: true, featureName: 'أكثر من كرسين', requiredPlan: 'Pro', icon: '👨‍💈' });
        if (!val) return alert('يرجى كتابة اسم الحلاق!');
        if (pinVal && currentPlan !== 'Premium') return setUpsellConfig({ isOpen: true, featureName: 'بوابة الحلاقين الخاصة (PIN)', requiredPlan: 'Premium', icon: '🔐' });

        const exists = currentBarbers.some(b => (typeof b === 'string' ? b : b.name) === val);

        if (!exists) {
            setBarbers([...currentBarbers, { name: val, pin: currentPlan === 'Premium' ? pinVal : "", isActive: true }]);
            setNewBarberName('');
            setNewBarberPin('');
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-28 relative">

            {/* رأس الصفحة */}
            <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-slate-800 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg">⚙️</div>
                <div>
                    <h2 className="text-2xl font-black text-slate-800">إعدادات المنشأة</h2>
                    <p className="text-sm font-bold text-slate-500 mt-1">تخصيص الهوية، الخدمات، والتسويق الآلي.</p>
                </div>
            </div>

            <form id="settings-form" onSubmit={handleSaveSettings} className="space-y-8">

                {/* 1. قسم الهوية والتواصل وتخصيص الواجهة */}
                <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        <span className="text-blue-500">1.</span> الهوية، التواصل، وتخصيص الواجهة 📱
                    </h3>

                    {/* الحقول الأساسية */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">اسم الصالون</label>
                            <input type="text" value={salonName || ''} onChange={(e) => setSalonName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="مثال: صالون الأبطال" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">اسم المالك / المدير</label>
                            <input type="text" value={ownerName || ''} onChange={(e) => setOwnerName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="مثال: أبو علي" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">رقم الجوال (للتواصل)</label>
                            <input type="text" value={ownerPhone || ''} onChange={(e) => setOwnerPhone(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm tracking-wider" placeholder="0500000000" dir="ltr" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">رابط خرائط جوجل 📍</label>
                            <input type="url" value={settings?.locationUrl || ''} onChange={(e) => setSettings({ ...settings, locationUrl: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="https://maps.google.com/..." dir="ltr" />
                        </div>

                        <div className="md:col-span-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <label className="block text-xs font-bold text-slate-500 mb-3">شعار الصالون (Logo) 🖼️</label>
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 overflow-hidden bg-white flex items-center justify-center flex-shrink-0 relative group hover:border-blue-400 transition-colors">
                                    {logoUrl ? (
                                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                                    ) : (
                                        <span className="text-3xl text-slate-300">📷</span>
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" />
                                    <button type="button" onClick={() => fileInputRef.current.click()} className="bg-white border border-slate-200 text-slate-700 font-black px-6 py-2.5 rounded-xl text-sm hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm">
                                        رفع صورة من الجهاز
                                    </button>
                                    <input type="url" value={logoUrl || ''} onChange={(e) => setLogoUrl(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 outline-none focus:border-blue-400 text-xs" placeholder="أو ضع رابط الصورة مباشرة هنا..." dir="ltr" />
                                </div>
                            </div>
                        </div>

                        {/* الهوية الرقمية */}
                        <div className="md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                            <h4 className="text-md font-black text-slate-800 mb-4 flex items-center gap-2">
                                <span className="text-pink-500 text-xl">🎨</span> تخصيص صفحة الحجز (Mini-Website)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-2">نبذة عن الصالون (Bio)</label>
                                    <textarea
                                        rows="2"
                                        value={bio || ''}
                                        onChange={(e) => setBio(e.target.value)}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-400 transition-all text-sm font-bold text-slate-700 resize-none"
                                        placeholder="مثال: أفضل صالون للحلاقة العصرية والعناية بالرجل..."
                                    />
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
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
                                            className="w-10 h-10 rounded-xl cursor-pointer border-none bg-transparent p-0"
                                        />
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
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
                                            className="w-10 h-10 rounded-xl cursor-pointer border-none bg-transparent p-0"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">📸 إنستجرام</label>
                                        <input type="url" value={socialLinks?.instagram || ''} onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-400 transition-all text-sm font-bold text-slate-700" placeholder="https://instagram.com/..." dir="ltr" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">🎵 تيك توك</label>
                                        <input type="url" value={socialLinks?.tiktok || ''} onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-800 transition-all text-sm font-bold text-slate-700" placeholder="https://tiktok.com/@..." dir="ltr" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">👻 سناب شات</label>
                                        <input type="url" value={socialLinks?.snapchat || ''} onChange={(e) => setSocialLinks({ ...socialLinks, snapchat: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-yellow-100 focus:border-yellow-400 transition-all text-sm font-bold text-slate-700" placeholder="https://snapchat.com/add/..." dir="ltr" />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </section>

                {/* 2. قسم أوقات العمل */}
                <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        <span className="text-orange-500">2.</span> أوقات العمل والجدولة ⏱️
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">وقت الافتتاح</label>
                            <input type="time" value={settings?.startTime || ''} onChange={(e) => setSettings({ ...settings, startTime: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">وقت الإغلاق</label>
                            <input type="time" value={settings?.endTime || ''} onChange={(e) => setSettings({ ...settings, endTime: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">مدة الموعد الواحد</label>
                            <select value={settings?.slotDuration || 30} onChange={(e) => setSettings({ ...settings, slotDuration: parseInt(e.target.value) })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-400 appearance-none cursor-pointer">
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
                                <input type="date" value={settings?.maxBookingDate || ''} onChange={(e) => setSettings({ ...settings, maxBookingDate: e.target.value })} className="flex-1 p-4 bg-red-50 border border-red-100 rounded-2xl font-bold text-red-600 outline-none focus:border-red-400 text-sm" />
                                {settings?.maxBookingDate && <button type="button" onClick={() => setSettings({ ...settings, maxBookingDate: '' })} className="bg-red-100 text-red-600 font-black px-4 rounded-2xl hover:bg-red-200">✖</button>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-black text-orange-700">☕ وقت الاستراحة (مغلق للحجز)</h4>
                            {(settings?.breakStart || settings?.breakEnd) && (
                                <button type="button" onClick={() => setSettings({ ...settings, breakStart: '', breakEnd: '' })} className="text-xs text-orange-500 hover:text-orange-700 font-bold bg-white px-3 py-1 rounded-lg shadow-sm">إلغاء الاستراحة</button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-orange-600/70 mb-2">من الساعة</label><input type="time" value={settings?.breakStart || ''} onChange={(e) => setSettings({ ...settings, breakStart: e.target.value })} className="w-full p-3 bg-white border border-orange-200 rounded-xl font-black text-orange-700 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-orange-600/70 mb-2">إلى الساعة</label><input type="time" value={settings?.breakEnd || ''} onChange={(e) => setSettings({ ...settings, breakEnd: e.target.value })} className="w-full p-3 bg-white border border-orange-200 rounded-xl font-black text-orange-700 outline-none" /></div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-black text-slate-700 mb-3">🏖️ أيام الإجازات (تواريخ محددة يغلق فيها الصالون)</label>
                        <div className="flex gap-2 mb-4">
                            <input type="date" value={newClosedDate} onChange={(e) => setNewClosedDate(e.target.value)} className="flex-1 max-w-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-600 outline-none focus:border-blue-400 text-sm" />
                            <button type="button" onClick={() => { if (newClosedDate && !settings?.closedDates?.includes(newClosedDate)) { setSettings({ ...settings, closedDates: [...(settings?.closedDates || []), newClosedDate] }); setNewClosedDate(''); } }} className="bg-slate-800 text-white font-black px-6 rounded-xl hover:bg-slate-700 text-sm transition-all shadow-sm">إضافة إجازة</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {settings?.closedDates?.map((date) => (
                                <div key={date} className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-3 shadow-sm">
                                    <span dir="ltr">{date}</span>
                                    <button type="button" onClick={() => setSettings({ ...settings, closedDates: settings.closedDates.filter(d => d !== date) })} className="bg-white w-5 h-5 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 3. قسم ZATCA */}
                <ZatcaSection
                    settings={settings}
                    taxNumber={taxNumber}
                    setTaxNumber={setTaxNumber}
                    wafeqApiKey={wafeqApiKey}
                    setWafeqApiKey={setWafeqApiKey}
                    zatcaOtp={zatcaOtp}
                    setZatcaOtp={setZatcaOtp}
                    isOnboardingZatca={isOnboardingZatca}
                    handleZatcaOnboard={handleZatcaOnboard}
                    currentPlan={currentPlan}
                    setUpsellConfig={setUpsellConfig}
                    handleZatcaDisconnect={handleZatcaDisconnect}
                />

                {/* 4. قسم قائمة الخدمات والطاقم */}
                <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        <span className="text-emerald-500">4.</span> قائمة الخدمات والطاقم 📋
                    </h3>

                    {/* إدارة الطاقم */}
                    <div className="mb-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <label className="block text-sm font-black text-slate-800">إدارة الطاقم وصلاحيات الدخول (PIN)</label>
                                <p className="text-xs font-bold text-slate-500 mt-1">أضف الطاقم، وحدد رمز الدخول، وتحكم بإجازاتهم.</p>
                            </div>
                            <button type="button" onClick={handleAddBarber} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-xl text-sm font-black transition-all shadow-sm">
                                + إضافة حلاق
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-3 mb-6 p-4 bg-white rounded-2xl border border-slate-200">
                            <input type="text" value={newBarberName} onChange={(e) => setNewBarberName(e.target.value)} placeholder="اسم الحلاق الجديد (مثال: محمد)" className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm" />
                            <div className="relative w-full md:w-40 group" onClick={() => { if (currentPlan !== 'Premium') setUpsellConfig({ isOpen: true, featureName: 'صلاحيات دخول الطاقم', requiredPlan: 'Premium', icon: '🔐' }); }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d*"
                                    maxLength="4"
                                    disabled={currentPlan !== 'Premium'}
                                    value={newBarberPin}
                                    onChange={(e) => setNewBarberPin(e.target.value.replace(/\D/g, ''))}
                                    placeholder="PIN (اختياري)"
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-400 text-center tracking-[0.3em] disabled:opacity-50 text-sm"
                                />
                                {currentPlan !== 'Premium' && <span className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400">🔒</span>}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {barbers?.map((barber, index) => {
                                const bName = typeof barber === 'string' ? barber : barber.name;
                                const bPin = typeof barber === 'string'
                                    ? settings?.barberPins?.find(b => b.name === bName)?.pin || ''
                                    : barber.pin || '';
                                const isActive = typeof barber === 'string' ? true : (barber.isActive !== false);

                                return (
                                    <div key={index} className={`flex flex-col md:flex-row gap-4 items-center p-5 rounded-2xl border transition-all ${isActive ? 'bg-white border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'}`}>

                                        <div className="flex-1 w-full">
                                            <label className="text-[10px] font-black text-slate-400 block mb-1">اسم الحلاق</label>
                                            <input
                                                type="text"
                                                value={bName}
                                                onChange={(e) => {
                                                    const updated = [...barbers];
                                                    if (typeof updated[index] === 'string') {
                                                        updated[index] = { name: e.target.value, pin: bPin, isActive: isActive };
                                                    } else {
                                                        updated[index].name = e.target.value;
                                                    }
                                                    setBarbers(updated);
                                                }}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm"
                                            />
                                        </div>

                                        {currentPlan === 'Premium' && (
                                            <div className="w-full md:w-32">
                                                <label className="text-[10px] font-black text-slate-400 block mb-1">رمز الدخول (PIN)</label>
                                                <input
                                                    type="text"
                                                    maxLength="4"
                                                    value={bPin}
                                                    onChange={(e) => {
                                                        const updated = [...barbers];
                                                        if (typeof updated[index] === 'string') {
                                                            updated[index] = { name: bName, pin: e.target.value.replace(/\D/g, ''), isActive: isActive };
                                                        } else {
                                                            updated[index].pin = e.target.value.replace(/\D/g, '');
                                                        }
                                                        setBarbers(updated);
                                                    }}
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:border-emerald-400 text-sm text-center tracking-widest"
                                                    dir="ltr"
                                                />
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between w-full md:w-auto md:min-w-[120px] bg-slate-100/50 p-2.5 rounded-xl border border-slate-100 mt-1 md:mt-0">
                                            <span className={`text-[10px] font-black transition-colors ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {isActive ? 'متاح 🟢' : 'إجازة 🔴'}
                                            </span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={isActive}
                                                    onChange={(e) => {
                                                        const updated = [...barbers];
                                                        if (typeof updated[index] === 'string') {
                                                            updated[index] = { name: bName, pin: bPin, isActive: e.target.checked };
                                                        } else {
                                                            updated[index].isActive = e.target.checked;
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
                                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-3 rounded-xl transition-colors mt-2 md:mt-0 w-full md:w-auto flex justify-center"
                                                title="حذف الحلاق"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                            {barbers?.length === 0 && (
                                <div className="text-center p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
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
                            <button type="button" onClick={handleAddService} className="bg-slate-800 text-white px-4 py-2.5 rounded-xl font-black text-xs hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2">
                                <span>+</span> خدمة جديدة
                            </button>
                        </div>
                        <div className="space-y-3">
                            {services.length === 0 ? (
                                <div className="text-center p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                    <span className="text-3xl mb-2 block opacity-50">💇‍♂️</span>
                                    <p className="text-slate-500 font-bold text-sm">لم تقم بإضافة خدمات. (الوضع الافتراضي: حجز مقعد فقط)</p>
                                </div>
                            ) : (
                                services.map((srv, index) => (
                                    <div key={srv.id || index} className="flex flex-col md:flex-row gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 items-center hover:border-blue-300 transition-colors">
                                        <div className="w-full md:w-2/5 relative">
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black bg-white w-5 h-5 flex items-center justify-center rounded-full shadow-sm">{index + 1}</span>
                                            <input type="text" required placeholder="اسم الخدمة (مثال: تنظيف بشرة)" value={srv.name} onChange={(e) => handleServiceChange(srv.id, 'name', e.target.value)} className="w-full pr-12 pl-4 py-3.5 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 shadow-sm" />
                                        </div>
                                        <div className="w-full md:w-1/4 relative">
                                            <input type="number" required placeholder="السعر" min="0" value={srv.price} onChange={(e) => handleServiceChange(srv.id, 'price', Number(e.target.value))} className="w-full px-4 py-3.5 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 shadow-sm" dir="ltr" />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">ر.س</span>
                                        </div>
                                        <div className="w-full md:w-1/4 relative">
                                            <select value={srv.duration} onChange={(e) => handleServiceChange(srv.id, 'duration', Number(e.target.value))} className="w-full pl-10 pr-4 py-3.5 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-slate-800 appearance-none shadow-sm cursor-pointer">
                                                <option value={15}>15 دقيقة</option>
                                                <option value={30}>30 دقيقة</option>
                                                <option value={45}>45 دقيقة</option>
                                                <option value={60}>ساعة</option>
                                            </select>
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">⏱️</span>
                                        </div>
                                        <button type="button" onClick={() => handleRemoveService(srv.id)} className="w-full md:w-auto p-3.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center font-bold">حذف</button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                {/* ========================================== */}
                {/* 💳 5. قسم إعدادات الدفع الإلكتروني (Moyasar) */}
                {/* ========================================== */}
                <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-50 pb-4">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <span className="text-indigo-500">5.</span> إعدادات الدفع المسبق (العربون) 💳
                        </h3>
                    </div>

                    <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <label className="block text-sm font-black text-indigo-900">تفعيل الدفع الإلكتروني</label>
                                <p className="text-xs font-bold text-indigo-700/70 mt-1 max-w-sm">
                                    اطلب من عملائك دفع عربون لتأكيد الحجز. يتم تحويل الأموال مباشرة إلى حسابك في "ميسر".
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={paymentSettings?.isOnlinePaymentEnabled || false}
                                    onChange={(e) => {
                                        if (currentPlan === 'Free') {
                                            setUpsellConfig({ isOpen: true, featureName: 'بوابة الدفع والعربون', requiredPlan: 'Pro', icon: '💳' });
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
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-4 border-t border-indigo-100/50 space-y-5">

                                        {/* قيمة العربون */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-2">مبلغ العربون المطلوب لتأكيد الحجز</label>
                                            <div className="relative w-full md:w-1/3">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={paymentSettings?.depositAmount || ''}
                                                    onChange={(e) => setPaymentSettings({ ...paymentSettings, depositAmount: Number(e.target.value) })}
                                                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm"
                                                    dir="ltr"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">ر.س</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {/* المفتاح العام */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-2">المفتاح العام (Publishable Key)</label>
                                                <input
                                                    type="text"
                                                    value={paymentSettings?.moyasarPublishableKey || ''}
                                                    onChange={(e) => setPaymentSettings({ ...paymentSettings, moyasarPublishableKey: e.target.value })}
                                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                                                    placeholder="pk_live_..."
                                                    dir="ltr"
                                                />
                                            </div>

                                            {/* المفتاح السري */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-2">المفتاح السري (Secret Key)</label>
                                                <input
                                                    type="password"
                                                    value={paymentSettings?.moyasarSecretKey || ''}
                                                    onChange={(e) => setPaymentSettings({ ...paymentSettings, moyasarSecretKey: e.target.value })}
                                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                                                    placeholder={paymentSettings?.hasSecretKey ? "مفتاحك السري محفوظ بأمان 🔒 (اكتب لتغييره)" : "sk_live_..."}
                                                    dir="ltr"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-1 font-bold">
                                                    {paymentSettings?.hasSecretKey ? "✅ تم حفظ المفتاح السري مسبقاً." : "سيتم تشفير المفتاح تلقائياً بمجرد الحفظ."}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-white p-4 rounded-2xl flex items-center justify-between border border-indigo-50">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">💸</span>
                                                <div>
                                                    <p className="text-xs font-black text-slate-800">ليس لديك حساب في ميسر؟</p>
                                                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">أنشئ حسابك الآن وابدأ باستقبال المدفوعات.</p>
                                                </div>
                                            </div>
                                            <a href="https://moyasar.com" target="_blank" rel="noopener noreferrer" className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-xl text-xs font-black transition-colors">
                                                إنشاء حساب
                                            </a>
                                        </div>

                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </section>

                {/* 6. قسم التسويق الآلي المجزأ */}
                <MarketingSection
                    settings={settings}
                    setSettings={setSettings}
                    currentPlan={currentPlan}
                    setUpsellConfig={setUpsellConfig}
                />

                {/* 📌 شريط الحفظ العائم */}
                <div className="fixed bottom-6 left-0 right-0 z-40 px-4 md:pl-8 lg:pl-[20%] pointer-events-none">
                    <div className="max-w-4xl mx-auto bg-white/80 backdrop-blur-xl border border-slate-200/50 p-4 rounded-[2rem] shadow-2xl flex items-center justify-between pointer-events-auto">
                        <div className="hidden sm:block text-right pr-4">
                            <p className="text-sm font-black text-slate-800">حفظ التغييرات</p>
                            <p className="text-[10px] font-bold text-slate-500">تأكد من مراجعة الإعدادات قبل الحفظ.</p>
                        </div>
                        <button type="submit" disabled={isSavingSettings} className="w-full sm:w-auto bg-slate-900 text-white font-black px-10 py-4 rounded-2xl hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-50 shadow-lg text-sm flex items-center justify-center gap-2">
                            {isSavingSettings ? <span className="animate-pulse">جاري الحفظ... ⏳</span> : <span>حفظ التحديثات ✨</span>}
                        </button>
                    </div>
                </div>
            </form>

            {/* 7. قسم الواتساب */}
            <section className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <span className="text-emerald-500">7.</span> ربط الواتساب الآلي 💬
                    </h3>
                </div>

                {currentPlan === 'Free' ? (
                    <div onClick={() => setUpsellConfig({ isOpen: true, featureName: 'الواتساب الآلي (تأكيد وتذكير)', requiredPlan: 'Pro', icon: '💬' })} className="bg-slate-50 border border-slate-200 p-10 rounded-3xl text-center relative overflow-hidden group cursor-pointer hover:border-emerald-200 transition-all">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-emerald-500/20 transition-all"></div>
                        <div className="w-20 h-20 bg-white text-slate-300 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 shadow-sm border border-slate-100 group-hover:text-emerald-500 transition-colors relative z-10">💬</div>
                        <h3 className="font-black text-slate-800 text-xl mb-2 relative z-10">تنبيهات الواتساب مقفلة 🔒</h3>
                        <p className="text-slate-500 font-bold text-sm mb-6 relative z-10 max-w-md mx-auto">ارتقِ بخدمة عملائك مع باقة Pro. دع النظام يرسل تأكيدات الحجز والتذكير بالمواعيد لعملائك آلياً.</p>
                        <button type="button" className="bg-slate-800 text-white font-black px-8 py-3.5 rounded-xl group-hover:bg-emerald-600 transition-colors text-sm shadow-lg relative z-10">استكشف الباقات 🚀</button>
                    </div>
                ) : (
                    (() => {
                        const currentStatus = waStatus?.toUpperCase() || 'DISCONNECTED';
                        if (currentStatus === 'WORKING' || currentStatus === 'CONNECTED') {
                            return (
                                <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-3xl text-center flex flex-col items-center">
                                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner ring-4 ring-white">✅</div>
                                    <h3 className="font-black text-emerald-800 text-xl mb-1">الواتساب متصل ويعمل بنجاح!</h3>
                                    <p className="text-xs font-bold text-emerald-600/80 mb-6">النظام الآن يرسل التنبيهات لعملائك آلياً.</p>
                                    <button onClick={handleDisconnectWhatsapp} disabled={isWaLoading} className="bg-white border border-red-100 text-red-500 hover:bg-red-500 hover:text-white font-black px-8 py-3 rounded-xl transition-all text-sm shadow-sm">إلغاء الربط مؤقتاً 🛑</button>
                                </div>
                            );
                        }
                        if (['CREATED', 'STARTING', 'NEED_SCAN', 'SCAN_QR_CODE', 'CONNECTING'].includes(currentStatus) || qrCode) {
                            return (
                                <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl text-center flex flex-col items-center">
                                    <h3 className="font-black text-slate-800 text-lg mb-2">افتح واتساب في جوالك وامسح الكود 📱</h3>
                                    <p className="text-xs font-bold text-slate-500 mb-6">اذهب إلى الإعدادات ➔ الأجهزة المرتبطة ➔ ربط جهاز</p>
                                    <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100 mb-6 w-64 h-64 flex items-center justify-center relative">
                                        {currentStatus === 'CONNECTING' ? (
                                            <div className="animate-pulse flex flex-col items-center"><span className="text-4xl mb-3">🔄</span><p className="text-sm font-black text-emerald-600">جاري إتمام الاتصال...</p></div>
                                        ) : qrCode ? (
                                            <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain rounded-xl" />
                                        ) : (
                                            <div className="animate-pulse flex flex-col items-center"><span className="text-4xl mb-3 border-4 border-slate-200 border-t-blue-500 rounded-full w-12 h-12 animate-spin"></span><p className="text-sm font-black text-slate-500">جاري توليد الكود...</p></div>
                                        )}
                                    </div>
                                    <button onClick={handleDisconnectWhatsapp} className="text-slate-400 hover:text-red-500 font-bold text-xs underline decoration-dotted underline-offset-4">إلغاء العملية</button>
                                </div>
                            );
                        }
                        return (
                            <div className="bg-slate-50 border border-slate-200 p-10 rounded-3xl text-center flex flex-col items-center">
                                <div className="w-20 h-20 bg-white text-slate-400 rounded-full flex items-center justify-center text-4xl mb-4 shadow-sm border border-slate-100">🔌</div>
                                <h3 className="font-black text-slate-800 text-xl mb-2">رقم الواتساب غير مربوط</h3>
                                <p className="text-xs font-bold text-slate-500 mb-6">اربط جوال الصالون لتمكين إرسال الفواتير والتنبيهات للعملاء آلياً.</p>
                                <button onClick={handleConnectWhatsapp} disabled={isWaLoading} className="bg-emerald-600 text-white font-black px-10 py-4 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all text-sm shadow-lg shadow-emerald-600/30">
                                    {isWaLoading ? 'جاري تجهيز السيرفر...' : 'بدء ربط الواتساب 🚀'}
                                </button>
                            </div>
                        );
                    })()
                )}
            </section>

            <UpgradeModal isOpen={upsellConfig.isOpen} onClose={() => setUpsellConfig({ ...upsellConfig, isOpen: false })} requiredPlan={upsellConfig.requiredPlan} featureName={upsellConfig.featureName} featureIcon={upsellConfig.icon} />
        </motion.div>
    );
};

export default SettingsTab;