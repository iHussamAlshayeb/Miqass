import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { motion } from 'framer-motion';

const SuperAdminScreen = () => {
    const [tenants, setTenants] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [secretInput, setSecretInput] = useState('');
    const [loginError, setLoginError] = useState('');

    // حالة وضع الصيانة
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);

    // ==========================================
    // 💡 حالة الأسعار والتخفيضات والكوبونات
    // ==========================================
    const [pricing, setPricing] = useState({ pro: 99, premium: 199 });
    const [discount, setDiscount] = useState({ isActive: false, percentage: 0, name: '' });
    const [isSavingPricing, setIsSavingPricing] = useState(false);

    // 🎟️ حالات الكوبونات (Promo Codes)
    const [promoCodes, setPromoCodes] = useState([]);
    const [isPromoLoading, setIsPromoLoading] = useState(false);
    const [newPromo, setNewPromo] = useState({
        code: '',
        discountType: 'percentage',
        discountValue: 10,
        maxUses: 100,
        expiryDate: ''
    });

    useEffect(() => {
        const savedKey = sessionStorage.getItem('superAdminKey');
        if (savedKey) {
            fetchTenants(savedKey);
            fetchPricing(savedKey);
            fetchPromoCodes(savedKey);
        }
    }, []);

    const fetchPricing = async (key) => {
        try {
            const res = await API.get('/admin/pricing', { headers: { 'x-admin-key': key } });
            if (res.data) {
                setPricing(res.data.pricing || { pro: 99, premium: 199 });
                setDiscount(res.data.discount || { isActive: false, percentage: 0, name: '' });
            }
        } catch (error) {
            console.log('لم يتم العثور على إعدادات تسعير، سيتم استخدام الافتراضي.');
        }
    };

    const fetchTenants = async (key) => {
        setIsLoading(true);
        setLoginError('');
        try {
            const res = await API.get('/admin/tenants', { headers: { 'x-admin-key': key } });
            setTenants(res.data.tenants);

            if (res.data.isMaintenanceMode !== undefined) {
                setIsMaintenanceMode(res.data.isMaintenanceMode);
            }

            setIsAuthenticated(true);
            sessionStorage.setItem('superAdminKey', key);
        } catch (error) {
            setLoginError('الرمز السري غير صحيح 🛑');
            setIsAuthenticated(false);
            sessionStorage.removeItem('superAdminKey');
        } finally {
            setIsLoading(false);
        }
    };

    // 🎟️ جلب الكوبونات
    const fetchPromoCodes = async (key) => {
        try {
            const res = await API.get('/admin/promos', { headers: { 'x-admin-key': key } });
            setPromoCodes(res.data);
        } catch (error) {
            console.log('فشل جلب الكوبونات.');
        }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        if (!secretInput) return;
        fetchTenants(secretInput);
        fetchPricing(secretInput);
        fetchPromoCodes(secretInput);
    };

    const handleLogout = () => {
        sessionStorage.removeItem('superAdminKey');
        setIsAuthenticated(false);
        setSecretInput('');
    };

    const handleToggleMaintenance = async () => {
        const action = isMaintenanceMode ? "إيقاف" : "تفعيل";
        if (!window.confirm(`⚠️ تحذير: هل أنت متأكد من ${action} وضع الصيانة؟\n\n(عند التفعيل لن يتمكن أي صالون أو عميل من استخدام النظام حتى تقوم بإيقافه)`)) return;

        setIsTogglingMaintenance(true);
        try {
            const key = sessionStorage.getItem('superAdminKey');
            const res = await API.put('/admin/system-settings/maintenance',
                { isMaintenanceMode: !isMaintenanceMode },
                { headers: { 'x-admin-key': key } }
            );
            setIsMaintenanceMode(res.data.isMaintenanceMode);
            alert(`تم ${action} وضع الصيانة بنجاح! 🛠️`);
        } catch (error) {
            alert('حدث خطأ أثناء تغيير حالة الصيانة.');
        } finally {
            setIsTogglingMaintenance(false);
        }
    };

    const handleSavePricing = async () => {
        if (!window.confirm('هل أنت متأكد من تطبيق هذه الأسعار/التخفيضات على النظام؟')) return;
        setIsSavingPricing(true);
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.put('/admin/pricing', { pricing, discount }, {
                headers: { 'x-admin-key': key }
            });
            alert('تم تحديث الأسعار والتخفيضات بنجاح! 💸');
        } catch (error) {
            alert('حدث خطأ أثناء حفظ الإعدادات المالية.');
        } finally {
            setIsSavingPricing(false);
        }
    };

    // 🎟️ دالة إنشاء كوبون جديد
    const handleCreatePromo = async (e) => {
        e.preventDefault();
        if (!newPromo.code || !newPromo.expiryDate) {
            return alert("الرجاء تعبئة كود الخصم وتاريخ الانتهاء.");
        }

        setIsPromoLoading(true);
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.post('/admin/promos', newPromo, { headers: { 'x-admin-key': key } });
            alert('تم إنشاء كود الخصم بنجاح! 🎉');
            setNewPromo({ code: '', discountType: 'percentage', discountValue: 10, maxUses: 100, expiryDate: '' });
            fetchPromoCodes(key);
        } catch (error) {
            alert(error.response?.data?.message || 'حدث خطأ أثناء إنشاء الكود.');
        } finally {
            setIsPromoLoading(false);
        }
    };

    // 🎟️ دالة تفعيل/إيقاف الكوبون
    const handleTogglePromo = async (id) => {
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.put(`/admin/promos/${id}/toggle`, {}, { headers: { 'x-admin-key': key } });
            fetchPromoCodes(key);
        } catch (error) {
            alert('حدث خطأ أثناء تحديث حالة الكود.');
        }
    };

    const handleUpdateTenant = async (id, newStatus, newPlan, salonName, billingCycle = 'monthly') => {
        const durationText = billingCycle === 'annual' ? 'سنوي' : 'شهري';
        if (!window.confirm(`تأكيد تعديل صالون "${salonName}"؟\nالحالة: ${newStatus}\nالباقة: ${newPlan} (${durationText})`)) return;
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.put(`/admin/tenants/${id}/status`, { status: newStatus, plan: newPlan, billingCycle }, {
                headers: { 'x-admin-key': key }
            });
            alert('تم التحديث بنجاح! ✅');
            fetchTenants(key);
        } catch (error) {
            alert('حدث خطأ أثناء التحديث.');
        }
    };

    const handleDeleteTenant = async (id, salonName) => {
        if (!window.confirm(`⚠️ تحذير خطير: هل أنت متأكد من حذف "${salonName}" نهائياً؟`)) return;
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.delete(`/admin/tenants/${id}`, { headers: { 'x-admin-key': key } });
            alert('تم الحذف بنجاح 🗑️');
            fetchTenants(key);
        } catch (error) {
            alert('حدث خطأ أثناء الحذف.');
        }
    };

    const handleImpersonate = async (id, salonName) => {
        if (!window.confirm(`هل تريد فتح لوحة تحكم صالون "${salonName}" للدعم الفني؟`)) return;
        try {
            const key = sessionStorage.getItem('superAdminKey');
            const res = await API.post(`/admin/tenants/${id}/impersonate`, {}, { headers: { 'x-admin-key': key } });
            localStorage.setItem('token', res.data.token);
            window.open('/dashboard', '_blank');
        } catch (error) {
            alert('حدث خطأ أثناء استخراج الصلاحية.');
        }
    };

    const handleForceDisconnectZatca = async (id, salonName) => {
        if (!window.confirm(`🚨 تحذير: هل أنت متأكد من فك ارتباط هيئة الزكاة لصالون "${salonName}"؟`)) return;
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.delete(`/admin/tenants/${id}/zatca`, { headers: { 'x-admin-key': key } });
            alert('تم فك الارتباط الضريبي بنجاح 🚫');
            fetchTenants(key);
        } catch (error) {
            alert('حدث خطأ أثناء فك الارتباط الضريبي.');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-arabic text-right selection:bg-blue-500">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-800 p-8 rounded-[40px] shadow-2xl max-w-md w-full border border-slate-700 text-center">
                    <span className="text-6xl block mb-4">👑</span>
                    <h2 className="text-2xl font-black text-white mb-6">إدارة مِقَص العليا</h2>
                    {loginError && <div className="bg-red-500/10 text-red-400 p-3 rounded-xl mb-4 text-sm font-bold border border-red-500/20">{loginError}</div>}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="password" required value={secretInput} onChange={(e) => setSecretInput(e.target.value)} placeholder="الرمز السري..." className="w-full p-4 bg-slate-900/50 border border-slate-600 rounded-2xl outline-none focus:border-blue-500 text-white text-center font-black tracking-widest" dir="ltr" />
                        <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all">دخول النظام 🚀</button>
                    </form>
                </motion.div>
            </div>
        );
    }

    let expectedMonthlyRevenue = 0;
    let freeCount = 0, proCount = 0, premiumCount = 0;
    let zatcaOnboardedCount = 0;

    const currentProPrice = discount.isActive ? pricing.pro * (1 - discount.percentage / 100) : pricing.pro;
    const currentPremiumPrice = discount.isActive ? pricing.premium * (1 - discount.percentage / 100) : pricing.premium;

    tenants.forEach(t => {
        if (t.subscription.status === 'Active') {
            if (t.subscription.plan === 'Pro') { expectedMonthlyRevenue += currentProPrice; proCount++; }
            else if (t.subscription.plan === 'Premium') { expectedMonthlyRevenue += currentPremiumPrice; premiumCount++; }
            else if (t.subscription.plan === 'Free') { freeCount++; }
        }

        const isZatcaOnboarded = t.taxSettings?.isZatcaOnboarded || t.settings?.isZatcaOnboarded;
        if (isZatcaOnboarded) zatcaOnboardedCount++;
    });

    const pendingCount = tenants.filter(t => t.subscription.status === 'Pending_Approval').length;

    const filteredTenants = tenants.filter(t => {
        const matchesStatus = filter === 'All' || t.subscription.status === filter;
        const taxNumberStr = t.taxSettings?.taxNumber || t.settings?.taxNumber || '';
        const matchesSearch = t.salonName.includes(searchQuery) || t.ownerPhone.includes(searchQuery) || taxNumberStr.includes(searchQuery);
        return matchesStatus && matchesSearch;
    });

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-arabic text-right pb-20" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* رأس الصفحة وتنبيه الصيانة */}
                <div className={`text-white p-8 rounded-[35px] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden transition-all duration-500 ${isMaintenanceMode ? 'bg-amber-600' : 'bg-slate-900'}`}>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                    <div className="relative z-10 flex items-center gap-5">
                        <span className="text-5xl bg-white/10 p-4 rounded-3xl border border-white/10">
                            {isMaintenanceMode ? '🛠️' : '👑'}
                        </span>
                        <div>
                            <h1 className="text-3xl font-black mb-2">
                                {isMaintenanceMode ? 'النظام في وضع الصيانة' : 'غرفة القيادة العليا'}
                            </h1>
                            <p className="text-white/80 font-bold text-sm">
                                {isMaintenanceMode ? 'جميع الصالونات متوقفة حالياً. قم بإلغاء الصيانة عند الانتهاء.' : 'تحكم بالباقات، راقب الإيرادات، وساعد عملائك بضغطة زر.'}
                            </p>
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-3">
                        <button
                            onClick={handleToggleMaintenance}
                            disabled={isTogglingMaintenance}
                            className={`px-6 py-3 rounded-2xl font-black transition-all shadow-md flex items-center gap-2 ${isMaintenanceMode ? 'bg-white text-amber-600 hover:bg-slate-50' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                        >
                            {isTogglingMaintenance ? 'جاري التنفيذ...' : (isMaintenanceMode ? 'إيقاف الصيانة 🟢' : 'تفعيل الصيانة 🛠️')}
                        </button>
                        <button onClick={handleLogout} className="bg-red-500/10 text-red-200 hover:bg-red-500 hover:text-white px-6 py-3 rounded-2xl font-black transition-all">خروج</button>
                    </div>
                </div>

                {/* الإحصائيات الدقيقة */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="col-span-2 md:col-span-1 bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm text-center md:text-right">
                        <p className="text-slate-400 font-bold text-xs mb-1">الإيرادات المتوقعة (MRR)</p>
                        <h3 className="text-2xl font-black text-emerald-600">{expectedMonthlyRevenue.toFixed(0)} <span className="text-xs">ر.س</span></h3>
                    </div>
                    <div className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-xl mb-1 opacity-80">🆓</span>
                        <h3 className="text-xl font-black text-slate-700">{freeCount} <span className="text-[10px] font-bold text-slate-400">مجانية</span></h3>
                    </div>
                    <div className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-xl mb-1 opacity-80">⚡</span>
                        <h3 className="text-xl font-black text-blue-600">{proCount} <span className="text-[10px] font-bold text-slate-400">Pro</span></h3>
                    </div>
                    <div className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-xl mb-1 opacity-80">👑</span>
                        <h3 className="text-xl font-black text-purple-600">{premiumCount} <span className="text-[10px] font-bold text-slate-400">VIP</span></h3>
                    </div>
                    <div className="bg-slate-900 p-5 rounded-[25px] border border-slate-800 shadow-md flex flex-col items-center justify-center">
                        <span className="text-xl mb-1">🧾</span>
                        <h3 className="text-xl font-black text-emerald-400">{zatcaOnboardedCount} <span className="text-[10px] font-bold text-slate-400">مربوط بالزكاة</span></h3>
                    </div>
                </div>

                {/* 💸 قسم الإدارة المالية والتسويق (الأسعار والكوبونات) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* 1. إدارة الأسعار الأساسية */}
                    <div className="bg-white p-6 rounded-[25px] border border-emerald-100 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2">
                                <span>💸</span> تسعير الباقات
                            </h3>
                            <button
                                onClick={handleSavePricing}
                                disabled={isSavingPricing}
                                className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-black hover:bg-emerald-700 transition-all text-xs disabled:opacity-50"
                            >
                                {isSavingPricing ? 'جاري الحفظ...' : 'حفظ الأسعار 💾'}
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                <span className="text-2xl">⚡</span>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">باقة Pro (شهري)</label>
                                    <div className="relative">
                                        <input type="number" value={pricing.pro} onChange={e => setPricing({ ...pricing, pro: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-emerald-400" />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">ر.س</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                <span className="text-2xl">👑</span>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">باقة Premium (شهري)</label>
                                    <div className="relative">
                                        <input type="number" value={pricing.premium} onChange={e => setPricing({ ...pricing, premium: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-emerald-400" />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">ر.س</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`p-5 rounded-2xl border transition-all mt-auto ${discount.isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                    <span>🏷️</span> تفعيل عرض ترويجي (خصم عام)
                                </h4>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={discount.isActive} onChange={() => setDiscount({ ...discount, isActive: !discount.isActive })} />
                                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                            </div>
                            <div className={`space-y-4 transition-opacity ${discount.isActive ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">اسم العرض</label>
                                    <input type="text" placeholder="مثال: عروض نهاية العام 🔥" value={discount.name} onChange={e => setDiscount({ ...discount, name: e.target.value })} className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-400 text-sm" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">نسبة الخصم (%)</label>
                                        <div className="relative">
                                            <input type="number" min="0" max="100" value={discount.percentage} onChange={e => setDiscount({ ...discount, percentage: Number(e.target.value) })} className="w-full p-2 pl-8 bg-white border border-slate-200 rounded-xl font-black text-emerald-600 outline-none focus:border-emerald-400" />
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">%</span>
                                        </div>
                                    </div>
                                </div>
                                {discount.isActive && (
                                    <div className="mt-2 p-2 bg-emerald-100/50 rounded-xl border border-emerald-100 flex gap-4 justify-center">
                                        <span className="text-xs text-emerald-700 font-black">Pro: {currentProPrice.toFixed(0)} ر.س</span>
                                        <span className="text-xs text-emerald-700 font-black">VIP: {currentPremiumPrice.toFixed(0)} ر.س</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. 🎟️ محرك الكوبونات (Promo Codes) */}
                    <div className="bg-white p-6 rounded-[25px] border border-blue-100 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                            <h3 className="text-lg font-black text-blue-800 flex items-center gap-2">
                                <span>🎟️</span> محرك كوبونات الخصم
                            </h3>
                            <span className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-lg">إصدار حصري</span>
                        </div>

                        {/* نموذج صناعة كوبون جديد */}
                        <form onSubmit={handleCreatePromo} className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 mb-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">كود الخصم (Code)</label>
                                    <input type="text" required placeholder="مثال: VIP50" value={newPromo.code} onChange={e => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:border-blue-400 text-center tracking-widest uppercase" dir="ltr" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">نوع الخصم</label>
                                    <select value={newPromo.discountType} onChange={e => setNewPromo({ ...newPromo, discountType: e.target.value })} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-400 text-xs">
                                        <option value="percentage">نسبة مئوية (%)</option>
                                        <option value="fixed">مبلغ ثابت (ر.س)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">قيمة الخصم</label>
                                    <input type="number" required min="1" value={newPromo.discountValue} onChange={e => setNewPromo({ ...newPromo, discountValue: Number(e.target.value) })} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-black text-blue-600 outline-none focus:border-blue-400" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">عدد الاستخدامات</label>
                                    <input type="number" required min="1" value={newPromo.maxUses} onChange={e => setNewPromo({ ...newPromo, maxUses: Number(e.target.value) })} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-400 text-xs" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ الانتهاء</label>
                                    <input type="date" required value={newPromo.expiryDate} onChange={e => setNewPromo({ ...newPromo, expiryDate: e.target.value })} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-400 text-xs" />
                                </div>
                            </div>
                            <button type="submit" disabled={isPromoLoading} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-black hover:bg-blue-700 transition-all text-xs disabled:opacity-50 mt-2 shadow-md">
                                {isPromoLoading ? 'جاري الإنشاء...' : '+ توليد الكوبون'}
                            </button>
                        </form>

                        {/* جدول الكوبونات */}
                        <div className="flex-1 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                            {promoCodes.length === 0 ? (
                                <div className="text-center text-slate-400 font-bold text-xs py-8">لا توجد كوبونات مسجلة.</div>
                            ) : (
                                <div className="space-y-3">
                                    {promoCodes.map(promo => {
                                        const isExpired = new Date(promo.expiryDate) < new Date();
                                        const isDepleted = promo.usedCount >= promo.maxUses;
                                        const isUsable = promo.isActive && !isExpired && !isDepleted;

                                        return (
                                            <div key={promo._id} className={`p-3 rounded-2xl border flex items-center justify-between transition-colors ${isUsable ? 'bg-white border-blue-100 hover:border-blue-300' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                                <div>
                                                    <h4 className="font-black text-slate-800 text-sm mb-1 tracking-wider" dir="ltr">{promo.code}</h4>
                                                    <p className="text-[10px] font-bold text-slate-500 flex gap-2">
                                                        <span className={promo.discountType === 'percentage' ? 'text-blue-600' : 'text-emerald-600'}>
                                                            خصم: {promo.discountValue}{promo.discountType === 'percentage' ? '%' : ' ر.س'}
                                                        </span>
                                                        <span>|</span>
                                                        <span>استخدم: {promo.usedCount}/{promo.maxUses}</span>
                                                    </p>
                                                    {(isExpired || isDepleted) && (
                                                        <span className="text-[9px] text-red-500 font-black mt-1 block">
                                                            {isExpired ? 'منتهي الصلاحية' : 'استنفد الحد الأقصى'}
                                                        </span>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => handleTogglePromo(promo._id)}
                                                    className={`w-12 h-6 rounded-full relative transition-colors ${promo.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                >
                                                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${promo.isActive ? 'right-1' : 'left-1'}`}></span>
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* الفلترة والبحث */}
                <div className="flex flex-col lg:flex-row gap-6 items-center justify-between bg-white p-4 rounded-[25px] border border-slate-100 shadow-sm">
                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                        {['All', 'Pending_Approval', 'Active'].map((status) => (
                            <button key={status} onClick={() => setFilter(status)} className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all ${filter === status ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                                {status === 'All' ? 'الكل' : status === 'Pending_Approval' ? `مراجعة الحوالات (${pendingCount})` : 'النشطين'}
                            </button>
                        ))}
                    </div>
                    <input type="text" placeholder="ابحث باسم الصالون، الجوال، أو الرقم الضريبي..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full lg:w-1/2 bg-slate-50 border border-slate-100 p-3 rounded-xl outline-none font-bold text-sm" />
                </div>

                {/* قائمة الصالونات */}
                {isLoading ? (
                    <div className="text-center py-20 animate-pulse text-slate-400 font-bold">جاري تحميل بيانات المنشآت... ⏳</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredTenants.map((tenant) => {
                            const taxNum = tenant.taxSettings?.taxNumber || tenant.settings?.taxNumber || '---';
                            const isZatcaOnboarded = tenant.taxSettings?.isZatcaOnboarded || tenant.settings?.isZatcaOnboarded;

                            const currentSelectValue = tenant.subscription.billingCycle === 'annual' && tenant.subscription.plan !== 'Free'
                                ? `${tenant.subscription.plan}-annual`
                                : tenant.subscription.plan;

                            return (
                                <div key={tenant._id} className="bg-white p-6 rounded-[30px] shadow-sm border border-slate-100 flex flex-col justify-between hover:border-blue-200 transition-colors">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h2 className="text-lg font-black text-slate-800">{tenant.salonName}</h2>
                                                <p className="text-slate-400 font-bold text-[10px]" dir="ltr">{tenant.slug}</p>
                                            </div>

                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`px-3 py-1 rounded-xl text-[10px] font-black ${tenant.subscription.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {tenant.subscription.status}
                                                </span>
                                                {tenant.subscription.billingCycle === 'annual' && (
                                                    <span className="bg-purple-100 text-purple-700 text-[9px] font-black px-2 py-0.5 rounded-lg animate-pulse">
                                                        طلب سنوي 🎁
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-xs font-bold text-slate-600 mb-4">📞 {tenant.ownerPhone}</p>

                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex justify-between items-center mb-4">
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 mb-0.5">الرقم الضريبي:</p>
                                                <p className="text-xs font-black text-slate-700 tracking-wider" dir="ltr">{taxNum}</p>
                                            </div>
                                            {isZatcaOnboarded ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-lg">متصل ✅</span>
                                                    <button onClick={() => handleForceDisconnectZatca(tenant._id, tenant.salonName)} className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white w-6 h-6 flex items-center justify-center rounded-md transition-colors" title="إلغاء الربط إجبارياً">
                                                        <span className="text-xs">🗑️</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="bg-slate-200 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-lg">غير مربوط</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-3 border-t border-slate-50">
                                        <div className="flex gap-2">
                                            <select
                                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold p-2 outline-none cursor-pointer"
                                                value={currentSelectValue}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    let newPlan = val;
                                                    let cycle = 'monthly';

                                                    if (val.includes('-annual')) {
                                                        newPlan = val.split('-')[0];
                                                        cycle = 'annual';
                                                    }

                                                    handleUpdateTenant(tenant._id, 'Active', newPlan, tenant.salonName, cycle);
                                                }}
                                            >
                                                <option value="Free">مجانية (Free)</option>
                                                <option value="Pro">احترافية (Pro) - شهري</option>
                                                <option value="Pro-annual">احترافية (Pro) - سنوي 🎁</option>
                                                <option value="Premium">مميزة (VIP) - شهري</option>
                                                <option value="Premium-annual">مميزة (VIP) - سنوي 🎁</option>
                                            </select>

                                            {tenant.subscription.status === 'Pending_Approval' && (
                                                <button onClick={() => handleUpdateTenant(tenant._id, 'Active', tenant.subscription.plan, tenant.salonName, tenant.subscription.billingCycle || 'monthly')} className="bg-emerald-500 text-white font-black px-3 py-2 rounded-xl text-[10px]">
                                                    تفعيل ✅
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button onClick={() => handleImpersonate(tenant._id, tenant.salonName)} className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white font-black py-2 rounded-xl text-xs transition-all shadow-sm">
                                                دخول كصالون 🕵️‍♂️
                                            </button>
                                            <button onClick={() => handleDeleteTenant(tenant._id, tenant.salonName)} className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white font-black px-3 py-2 rounded-xl text-xs transition-all shadow-sm" title="حذف المنشأة بالكامل">
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuperAdminScreen;