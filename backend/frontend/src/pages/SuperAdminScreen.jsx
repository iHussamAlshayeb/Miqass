import { createElement, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BadgePercent,
    Banknote,
    CheckCircle2,
    Crown,
    DoorOpen,
    KeyRound,
    Link2Off,
    Loader2,
    LogOut,
    Percent,
    Plus,
    ReceiptText,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Store,
    Trash2,
    UserCheck,
    Wrench,
    X,
    Zap,
} from 'lucide-react';
import API from '../services/api';

const fallbackPricing = { pro: 99, premium: 199 };
const fallbackDiscount = { isActive: false, percentage: 0, name: '' };

const statusLabels = {
    All: 'الكل',
    Active: 'نشط',
    Pending_Approval: 'بانتظار اعتماد الحوالة',
    Pending: 'بانتظار الدفع',
    Inactive: 'غير نشط',
};

const planLabels = {
    Free: 'مجانية',
    Pro: 'احترافية',
    Premium: 'مميزة',
};

const formatCurrency = (value) => `${Number(value || 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 })} ر.س`;

const getDiscountedPrice = (price, discount) => {
    const basePrice = Number(price || 0);
    if (!discount?.isActive) return basePrice;
    return Math.max(0, basePrice * (1 - Number(discount.percentage || 0) / 100));
};

const getSubscription = (tenant) => tenant?.subscription || { plan: 'Free', status: 'Inactive', billingCycle: 'monthly' };

const getStatusClasses = (status) => {
    if (status === 'Active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'Pending_Approval') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'Pending') return 'border-sky-200 bg-sky-50 text-sky-700';
    return 'border-slate-200 bg-slate-100 text-slate-600';
};

const Card = ({ children, className = '' }) => (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
        {children}
    </section>
);

const SectionTitle = ({ icon, title, action }) => (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                {createElement(icon, { size: 18 })}
            </span>
            <h2 className="text-base font-black text-slate-900">{title}</h2>
        </div>
        {action}
    </div>
);

const StatCard = ({ icon, label, value, accent = 'text-slate-900' }) => (
    <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className={`mt-2 text-xl font-black ${accent}`}>{value}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                {createElement(icon, { size: 18 })}
            </span>
        </div>
    </Card>
);

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
        {children}
    </label>
);

const StatusBadge = ({ status }) => (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-black ${getStatusClasses(status)}`}>
        {statusLabels[status] || status || 'غير معروف'}
    </span>
);

const Toggle = ({ checked, onChange, label }) => (
    <button
        type="button"
        onClick={onChange}
        aria-pressed={checked}
        aria-label={label}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'right-6' : 'right-1'}`} />
    </button>
);

const ConfirmDialog = ({ dialog, onClose, onConfirm }) => {
    if (!dialog) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" dir="rtl">
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 text-right shadow-2xl">
                <div className="mb-4 flex items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${dialog.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        <AlertTriangle size={20} />
                    </span>
                    <div>
                        <h3 className="text-base font-black text-slate-900">{dialog.title}</h3>
                        <p className="mt-1 text-sm font-bold leading-6 text-slate-600">{dialog.message}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`inline-flex flex-1 items-center justify-center rounded-md px-4 py-2.5 text-sm font-black text-white transition-colors ${dialog.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}
                    >
                        {dialog.confirmLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex flex-1 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50"
                    >
                        إلغاء
                    </button>
                </div>
            </div>
        </div>
    );
};

const SuperAdminScreen = () => {
    const [tenants, setTenants] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [secretInput, setSecretInput] = useState('');
    const [loginError, setLoginError] = useState('');
    const [notice, setNotice] = useState(null);
    const [confirmDialog, setConfirmDialog] = useState(null);

    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);

    const [pricing, setPricing] = useState(fallbackPricing);
    const [discount, setDiscount] = useState(fallbackDiscount);
    const [isSavingPricing, setIsSavingPricing] = useState(false);

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

    const showNotice = (type, message) => {
        setNotice({ type, message });
    };

    const runConfirmedAction = async () => {
        const dialog = confirmDialog;
        setConfirmDialog(null);
        if (dialog?.onConfirm) await dialog.onConfirm();
    };

    const fetchPricing = async (key) => {
        try {
            const res = await API.get('/admin/pricing', { headers: { 'x-admin-key': key } });
            if (res.data) {
                setPricing(res.data.pricing || fallbackPricing);
                setDiscount(res.data.discount || fallbackDiscount);
            }
        } catch {
            console.log('لم يتم العثور على إعدادات تسعير، سيتم استخدام الافتراضي.');
        }
    };

    const fetchTenants = async (key) => {
        setIsLoading(true);
        setLoginError('');
        try {
            const res = await API.get('/admin/tenants', { headers: { 'x-admin-key': key } });
            setTenants(Array.isArray(res.data?.tenants) ? res.data.tenants : []);

            if (res.data?.isMaintenanceMode !== undefined) {
                setIsMaintenanceMode(res.data.isMaintenanceMode);
            }

            setIsAuthenticated(true);
            sessionStorage.setItem('superAdminKey', key);
        } catch {
            setLoginError('الرمز السري غير صحيح');
            setIsAuthenticated(false);
            sessionStorage.removeItem('superAdminKey');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPromoCodes = async (key) => {
        try {
            const res = await API.get('/admin/promos', { headers: { 'x-admin-key': key } });
            setPromoCodes(Array.isArray(res.data) ? res.data : []);
        } catch {
            console.log('فشل جلب الكوبونات.');
        }
    };

    const refreshAdminData = () => {
        const key = sessionStorage.getItem('superAdminKey');
        if (!key) return;
        fetchTenants(key);
        fetchPricing(key);
        fetchPromoCodes(key);
    };

    const handleLogin = (e) => {
        e.preventDefault();
        const key = secretInput.trim();
        if (!key) return;
        fetchTenants(key);
        fetchPricing(key);
        fetchPromoCodes(key);
    };

    const handleLogout = () => {
        sessionStorage.removeItem('superAdminKey');
        setIsAuthenticated(false);
        setSecretInput('');
        setNotice(null);
    };

    const handleToggleMaintenance = () => {
        const action = isMaintenanceMode ? 'إيقاف' : 'تفعيل';
        setConfirmDialog({
            title: `${action} وضع الصيانة`,
            message: isMaintenanceMode
                ? 'سيعود النظام للعمل لجميع الصالونات والعملاء بعد الإيقاف.'
                : 'عند التفعيل لن يتمكن أي صالون أو عميل من استخدام النظام حتى تقوم بإيقافه.',
            confirmLabel: action,
            tone: isMaintenanceMode ? 'warning' : 'danger',
            onConfirm: async () => {
                setIsTogglingMaintenance(true);
                try {
                    const key = sessionStorage.getItem('superAdminKey');
                    const res = await API.put('/admin/system-settings/maintenance',
                        { isMaintenanceMode: !isMaintenanceMode },
                        { headers: { 'x-admin-key': key } }
                    );
                    setIsMaintenanceMode(res.data.isMaintenanceMode);
                    showNotice('success', `تم ${action} وضع الصيانة بنجاح.`);
                } catch {
                    showNotice('error', 'حدث خطأ أثناء تغيير حالة الصيانة.');
                } finally {
                    setIsTogglingMaintenance(false);
                }
            }
        });
    };

    const handleSavePricing = () => {
        setConfirmDialog({
            title: 'حفظ إعدادات التسعير',
            message: 'سيتم تطبيق الأسعار والعرض العام على صفحات التسجيل والترقية مباشرة.',
            confirmLabel: 'حفظ الأسعار',
            tone: 'warning',
            onConfirm: async () => {
                setIsSavingPricing(true);
                try {
                    const key = sessionStorage.getItem('superAdminKey');
                    await API.put('/admin/pricing', { pricing, discount }, {
                        headers: { 'x-admin-key': key }
                    });
                    showNotice('success', 'تم تحديث الأسعار والتخفيضات بنجاح.');
                } catch {
                    showNotice('error', 'حدث خطأ أثناء حفظ الإعدادات المالية.');
                } finally {
                    setIsSavingPricing(false);
                }
            }
        });
    };

    const handleCreatePromo = async (e) => {
        e.preventDefault();
        if (!newPromo.code.trim() || !newPromo.expiryDate) {
            showNotice('error', 'الرجاء تعبئة كود الخصم وتاريخ الانتهاء.');
            return;
        }

        setIsPromoLoading(true);
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.post('/admin/promos', newPromo, { headers: { 'x-admin-key': key } });
            showNotice('success', 'تم إنشاء كود الخصم بنجاح.');
            setNewPromo({ code: '', discountType: 'percentage', discountValue: 10, maxUses: 100, expiryDate: '' });
            fetchPromoCodes(key);
        } catch (error) {
            showNotice('error', error.response?.data?.message || 'حدث خطأ أثناء إنشاء الكود.');
        } finally {
            setIsPromoLoading(false);
        }
    };

    const handleTogglePromo = async (id) => {
        try {
            const key = sessionStorage.getItem('superAdminKey');
            await API.put(`/admin/promos/${id}/toggle`, {}, { headers: { 'x-admin-key': key } });
            fetchPromoCodes(key);
        } catch {
            showNotice('error', 'حدث خطأ أثناء تحديث حالة الكود.');
        }
    };

    const handleUpdateTenant = (id, newStatus, newPlan, salonName, billingCycle = 'monthly') => {
        const durationText = billingCycle === 'annual' ? 'سنوي' : 'شهري';
        setConfirmDialog({
            title: 'تعديل الاشتراك',
            message: `سيتم تعديل "${salonName}" إلى حالة ${statusLabels[newStatus] || newStatus} وباقة ${planLabels[newPlan] || newPlan} (${durationText}).`,
            confirmLabel: 'تأكيد التعديل',
            tone: 'warning',
            onConfirm: async () => {
                try {
                    const key = sessionStorage.getItem('superAdminKey');
                    await API.put(`/admin/tenants/${id}/status`, { status: newStatus, plan: newPlan, billingCycle }, {
                        headers: { 'x-admin-key': key }
                    });
                    showNotice('success', 'تم تحديث بيانات الصالون بنجاح.');
                    fetchTenants(key);
                } catch {
                    showNotice('error', 'حدث خطأ أثناء التحديث.');
                }
            }
        });
    };

    const handleDeleteTenant = (id, salonName) => {
        setConfirmDialog({
            title: 'حذف الصالون نهائياً',
            message: `سيتم حذف "${salonName}" وجميع بياناته المرتبطة من النظام. لا يمكن التراجع عن هذه العملية.`,
            confirmLabel: 'حذف نهائي',
            tone: 'danger',
            onConfirm: async () => {
                try {
                    const key = sessionStorage.getItem('superAdminKey');
                    await API.delete(`/admin/tenants/${id}`, { headers: { 'x-admin-key': key } });
                    showNotice('success', 'تم حذف الصالون بنجاح.');
                    fetchTenants(key);
                } catch {
                    showNotice('error', 'حدث خطأ أثناء الحذف.');
                }
            }
        });
    };

    const handleImpersonate = (id, salonName) => {
        setConfirmDialog({
            title: 'الدخول للدعم الفني',
            message: `سيتم فتح لوحة تحكم "${salonName}" في نافذة جديدة بصلاحية مؤقتة.`,
            confirmLabel: 'فتح اللوحة',
            tone: 'warning',
            onConfirm: async () => {
                try {
                    const key = sessionStorage.getItem('superAdminKey');
                    const res = await API.post(`/admin/tenants/${id}/impersonate`, {}, { headers: { 'x-admin-key': key } });
                    localStorage.setItem('token', res.data.token);
                    window.open('/dashboard', '_blank');
                } catch {
                    showNotice('error', 'حدث خطأ أثناء استخراج الصلاحية.');
                }
            }
        });
    };

    const handleForceDisconnectZatca = (id, salonName) => {
        setConfirmDialog({
            title: 'فك الارتباط الضريبي',
            message: `سيتم حذف مفاتيح الربط الضريبي لصالون "${salonName}" وإرجاع حالة الزكاة إلى غير مربوط.`,
            confirmLabel: 'فك الارتباط',
            tone: 'danger',
            onConfirm: async () => {
                try {
                    const key = sessionStorage.getItem('superAdminKey');
                    await API.delete(`/admin/tenants/${id}/zatca`, { headers: { 'x-admin-key': key } });
                    showNotice('success', 'تم فك الارتباط الضريبي بنجاح.');
                    fetchTenants(key);
                } catch {
                    showNotice('error', 'حدث خطأ أثناء فك الارتباط الضريبي.');
                }
            }
        });
    };

    const currentProPrice = getDiscountedPrice(pricing.pro, discount);
    const currentPremiumPrice = getDiscountedPrice(pricing.premium, discount);

    const stats = useMemo(() => {
        return tenants.reduce((acc, tenant) => {
            const subscription = getSubscription(tenant);
            const isZatcaOnboarded = tenant.taxSettings?.isZatcaOnboarded || tenant.settings?.isZatcaOnboarded;

            acc.total += 1;
            if (subscription.status === 'Pending_Approval') acc.pendingApproval += 1;
            if (subscription.status === 'Active') {
                acc.active += 1;
                if (subscription.plan === 'Pro') {
                    acc.expectedMonthlyRevenue += currentProPrice;
                    acc.pro += 1;
                } else if (subscription.plan === 'Premium') {
                    acc.expectedMonthlyRevenue += currentPremiumPrice;
                    acc.premium += 1;
                } else {
                    acc.free += 1;
                }
            }
            if (isZatcaOnboarded) acc.zatca += 1;
            return acc;
        }, {
            total: 0,
            active: 0,
            pendingApproval: 0,
            free: 0,
            pro: 0,
            premium: 0,
            zatca: 0,
            expectedMonthlyRevenue: 0
        });
    }, [tenants, currentProPrice, currentPremiumPrice]);

    const filteredTenants = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        return tenants.filter((tenant) => {
            const subscription = getSubscription(tenant);
            const taxNumberStr = tenant.taxSettings?.taxNumber || tenant.settings?.taxNumber || '';
            const matchesStatus = filter === 'All' || subscription.status === filter;
            const matchesSearch = !normalizedSearch
                || (tenant.salonName || '').toLowerCase().includes(normalizedSearch)
                || (tenant.ownerPhone || '').toLowerCase().includes(normalizedSearch)
                || taxNumberStr.toLowerCase().includes(normalizedSearch);
            return matchesStatus && matchesSearch;
        });
    }, [tenants, filter, searchQuery]);

    if (!isAuthenticated) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-arabic text-right" dir="rtl">
                <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
                    <div className="mb-6 flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                            <ShieldCheck size={22} />
                        </span>
                        <div>
                            <h1 className="text-xl font-black text-white">إدارة مِقَص العليا</h1>
                            <p className="mt-1 text-xs font-bold text-slate-400">دخول مخصص لإدارة المنصة والاشتراكات.</p>
                        </div>
                    </div>

                    {loginError && (
                        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                            {loginError}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <label className="block">
                            <span className="mb-2 block text-xs font-bold text-slate-400">الرمز السري</span>
                            <div className="relative">
                                <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password"
                                    required
                                    value={secretInput}
                                    onChange={(e) => setSecretInput(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-3 pl-4 pr-10 text-center font-black tracking-widest text-white outline-none transition-colors focus:border-blue-500"
                                    dir="ltr"
                                />
                            </div>
                        </label>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <DoorOpen size={18} />}
                            دخول النظام
                        </button>
                    </form>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-5 font-arabic text-right text-slate-900 sm:px-6 lg:px-8" dir="rtl">
            <div className="mx-auto max-w-7xl space-y-5">
                <header className={`rounded-lg border p-5 shadow-sm ${isMaintenanceMode ? 'border-amber-200 bg-amber-50' : 'border-slate-800 bg-slate-950 text-white'}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${isMaintenanceMode ? 'bg-amber-100 text-amber-700' : 'bg-white/10 text-blue-200'}`}>
                                {isMaintenanceMode ? <Wrench size={23} /> : <Crown size={23} />}
                            </span>
                            <div>
                                <p className={`text-xs font-black ${isMaintenanceMode ? 'text-amber-700' : 'text-blue-200'}`}>
                                    لوحة إدارة المنصة
                                </p>
                                <h1 className={`mt-1 text-2xl font-black ${isMaintenanceMode ? 'text-amber-950' : 'text-white'}`}>
                                    {isMaintenanceMode ? 'النظام في وضع الصيانة' : 'غرفة القيادة العليا'}
                                </h1>
                                <p className={`mt-2 max-w-2xl text-sm font-bold leading-6 ${isMaintenanceMode ? 'text-amber-800' : 'text-slate-300'}`}>
                                    {isMaintenanceMode ? 'جميع الصالونات والعملاء متوقفون مؤقتاً حتى يتم إيقاف الصيانة.' : 'إدارة الاشتراكات، التسعير، الكوبونات، والربط الضريبي من مكان واحد.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={refreshAdminData}
                                className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-black transition-colors ${isMaintenanceMode ? 'border-amber-200 bg-white text-amber-800 hover:bg-amber-100' : 'border-white/10 bg-white/10 text-white hover:bg-white/15'}`}
                            >
                                <RefreshCw size={16} />
                                تحديث
                            </button>
                            <button
                                type="button"
                                onClick={handleToggleMaintenance}
                                disabled={isTogglingMaintenance}
                                className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isMaintenanceMode ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}`}
                            >
                                {isTogglingMaintenance ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
                                {isMaintenanceMode ? 'إيقاف الصيانة' : 'تفعيل الصيانة'}
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-black transition-colors ${isMaintenanceMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-500/10 text-red-200 hover:bg-red-500 hover:text-white'}`}
                            >
                                <LogOut size={16} />
                                خروج
                            </button>
                        </div>
                    </div>
                </header>

                {notice && (
                    <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        <span>{notice.message}</span>
                        <button type="button" onClick={() => setNotice(null)} className="rounded-md p-1 transition-colors hover:bg-white/70" aria-label="إغلاق التنبيه">
                            <X size={16} />
                        </button>
                    </div>
                )}

                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <StatCard icon={Banknote} label="الإيرادات المتوقعة شهرياً" value={formatCurrency(stats.expectedMonthlyRevenue)} accent="text-emerald-700" />
                    <StatCard icon={Store} label="إجمالي الصالونات" value={stats.total.toLocaleString('ar-SA')} />
                    <StatCard icon={Zap} label="Pro" value={stats.pro.toLocaleString('ar-SA')} accent="text-blue-700" />
                    <StatCard icon={Crown} label="Premium" value={stats.premium.toLocaleString('ar-SA')} accent="text-violet-700" />
                    <StatCard icon={ReceiptText} label="مربوط بالزكاة" value={stats.zatca.toLocaleString('ar-SA')} accent="text-emerald-700" />
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <Card>
                        <SectionTitle
                            icon={Banknote}
                            title="تسعير الباقات"
                            action={(
                                <button
                                    type="button"
                                    onClick={handleSavePricing}
                                    disabled={isSavingPricing}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSavingPricing ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                    حفظ الأسعار
                                </button>
                            )}
                        />

                        <div className="space-y-5 p-5">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="باقة Pro شهرياً">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            value={pricing.pro}
                                            onChange={(e) => setPricing({ ...pricing, pro: Number(e.target.value) })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pl-12 text-sm font-black text-slate-900 outline-none transition-colors focus:border-emerald-500"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">ر.س</span>
                                    </div>
                                </Field>
                                <Field label="باقة Premium شهرياً">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            value={pricing.premium}
                                            onChange={(e) => setPricing({ ...pricing, premium: Number(e.target.value) })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pl-12 text-sm font-black text-slate-900 outline-none transition-colors focus:border-emerald-500"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">ر.س</span>
                                    </div>
                                </Field>
                            </div>

                            <div className="rounded-lg border border-slate-200 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <BadgePercent size={18} className="text-emerald-600" />
                                        <h3 className="text-sm font-black text-slate-900">عرض عام على الباقات</h3>
                                    </div>
                                    <Toggle
                                        checked={discount.isActive}
                                        label="تفعيل العرض العام"
                                        onChange={() => setDiscount({ ...discount, isActive: !discount.isActive })}
                                    />
                                </div>

                                <div className={`grid gap-3 sm:grid-cols-2 ${discount.isActive ? '' : 'pointer-events-none opacity-45'}`}>
                                    <Field label="اسم العرض">
                                        <input
                                            type="text"
                                            placeholder="مثال: عرض نهاية الشهر"
                                            value={discount.name}
                                            onChange={(e) => setDiscount({ ...discount, name: e.target.value })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-500"
                                        />
                                    </Field>
                                    <Field label="نسبة الخصم">
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={discount.percentage}
                                                onChange={(e) => setDiscount({ ...discount, percentage: Number(e.target.value) })}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pl-9 text-sm font-black text-emerald-700 outline-none transition-colors focus:border-emerald-500"
                                            />
                                            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        </div>
                                    </Field>
                                </div>

                                {discount.isActive && (
                                    <div className="mt-4 grid gap-2 text-xs font-black text-emerald-700 sm:grid-cols-2">
                                        <span className="rounded-md bg-emerald-50 px-3 py-2">Pro بعد الخصم: {formatCurrency(currentProPrice)}</span>
                                        <span className="rounded-md bg-emerald-50 px-3 py-2">Premium بعد الخصم: {formatCurrency(currentPremiumPrice)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <SectionTitle icon={BadgePercent} title="كوبونات الخصم" />

                        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <form onSubmit={handleCreatePromo} className="space-y-3">
                                <Field label="كود الخصم">
                                    <input
                                        type="text"
                                        required
                                        placeholder="VIP50"
                                        value={newPromo.code}
                                        onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center text-sm font-black tracking-widest text-slate-900 outline-none transition-colors focus:border-blue-500"
                                        dir="ltr"
                                    />
                                </Field>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="نوع الخصم">
                                        <select
                                            value={newPromo.discountType}
                                            onChange={(e) => setNewPromo({ ...newPromo, discountType: e.target.value })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 outline-none transition-colors focus:border-blue-500"
                                        >
                                            <option value="percentage">نسبة مئوية</option>
                                            <option value="fixed">مبلغ ثابت</option>
                                        </select>
                                    </Field>
                                    <Field label="قيمة الخصم">
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={newPromo.discountValue}
                                            onChange={(e) => setNewPromo({ ...newPromo, discountValue: Number(e.target.value) })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-blue-700 outline-none transition-colors focus:border-blue-500"
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="عدد الاستخدامات">
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={newPromo.maxUses}
                                            onChange={(e) => setNewPromo({ ...newPromo, maxUses: Number(e.target.value) })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-blue-500"
                                        />
                                    </Field>
                                    <Field label="تاريخ الانتهاء">
                                        <input
                                            type="date"
                                            required
                                            value={newPromo.expiryDate}
                                            onChange={(e) => setNewPromo({ ...newPromo, expiryDate: e.target.value })}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 outline-none transition-colors focus:border-blue-500"
                                        />
                                    </Field>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isPromoLoading}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isPromoLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    إنشاء كوبون
                                </button>
                            </form>

                            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                                {promoCodes.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-bold text-slate-400">
                                        لا توجد كوبونات مسجلة.
                                    </div>
                                ) : (
                                    promoCodes.map((promo) => {
                                        const usedCount = Number(promo.usedCount || 0);
                                        const maxUses = Number(promo.maxUses || 0);
                                        const isExpired = promo.expiryDate ? new Date(promo.expiryDate) < new Date() : false;
                                        const isDepleted = maxUses > 0 && usedCount >= maxUses;
                                        const isUsable = promo.isActive && !isExpired && !isDepleted;

                                        return (
                                            <div key={promo._id} className={`rounded-lg border p-3 transition-colors ${isUsable ? 'border-blue-100 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-black tracking-wider text-slate-900" dir="ltr">{promo.code}</p>
                                                        <p className="mt-1 text-xs font-bold text-slate-500">
                                                            خصم {promo.discountValue}{promo.discountType === 'percentage' ? '%' : ' ر.س'}، استخدم {usedCount.toLocaleString('ar-SA')} من {maxUses.toLocaleString('ar-SA')}
                                                        </p>
                                                        {(isExpired || isDepleted) && (
                                                            <p className="mt-1 text-[11px] font-black text-red-600">
                                                                {isExpired ? 'منتهي الصلاحية' : 'استنفد الحد الأقصى'}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Toggle
                                                        checked={Boolean(promo.isActive)}
                                                        label="تغيير حالة الكوبون"
                                                        onChange={() => handleTogglePromo(promo._id)}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </Card>
                </section>

                <Card className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                            {['All', 'Pending_Approval', 'Active', 'Pending', 'Inactive'].map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setFilter(status)}
                                    className={`rounded-md px-4 py-2 text-xs font-black transition-colors ${filter === status ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {statusLabels[status]}{status === 'Pending_Approval' ? ` (${stats.pendingApproval.toLocaleString('ar-SA')})` : ''}
                                </button>
                            ))}
                        </div>
                        <div className="relative w-full lg:max-w-md">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                            <input
                                type="text"
                                placeholder="ابحث باسم الصالون، الجوال، أو الرقم الضريبي"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm font-bold outline-none transition-colors focus:border-slate-400 focus:bg-white"
                            />
                        </div>
                    </div>
                </Card>

                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-16 text-sm font-bold text-slate-500">
                        <Loader2 size={18} className="animate-spin" />
                        جاري تحميل بيانات المنشآت
                    </div>
                ) : filteredTenants.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center text-sm font-bold text-slate-400">
                        لا توجد نتائج مطابقة.
                    </div>
                ) : (
                    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                        {filteredTenants.map((tenant) => {
                            const subscription = getSubscription(tenant);
                            const taxNum = tenant.taxSettings?.taxNumber || tenant.settings?.taxNumber || 'غير مسجل';
                            const isZatcaOnboarded = tenant.taxSettings?.isZatcaOnboarded || tenant.settings?.isZatcaOnboarded;
                            const billingCycle = subscription.billingCycle || 'monthly';
                            const currentSelectValue = billingCycle === 'annual' && subscription.plan !== 'Free'
                                ? `${subscription.plan}-annual`
                                : subscription.plan;

                            return (
                                <Card key={tenant._id} className="flex flex-col">
                                    <div className="flex-1 p-5">
                                        <div className="mb-4 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="truncate text-lg font-black text-slate-900">{tenant.salonName}</h2>
                                                <p className="mt-1 truncate text-xs font-bold text-slate-400" dir="ltr">{tenant.slug}</p>
                                            </div>
                                            <StatusBadge status={subscription.status} />
                                        </div>

                                        <div className="grid gap-3 text-sm">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Store size={16} className="text-slate-400" />
                                                <span className="font-bold">{planLabels[subscription.plan] || subscription.plan} - {billingCycle === 'annual' ? 'سنوي' : 'شهري'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <UserCheck size={16} className="text-slate-400" />
                                                <span className="font-bold">{tenant.ownerName || 'بدون اسم مالك'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <KeyRound size={16} className="text-slate-400" />
                                                <span className="font-bold" dir="ltr">{tenant.ownerPhone || 'غير مسجل'}</span>
                                            </div>
                                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <span className="text-xs font-bold text-slate-500">الرقم الضريبي</span>
                                                    {isZatcaOnboarded ? (
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                                                            <CheckCircle2 size={13} />
                                                            متصل
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-500">غير مربوط</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-sm font-black text-slate-800" dir="ltr">{taxNum}</span>
                                                    {isZatcaOnboarded && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleForceDisconnectZatca(tenant._id, tenant.salonName)}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                                                            title="فك الارتباط الضريبي"
                                                            aria-label="فك الارتباط الضريبي"
                                                        >
                                                            <Link2Off size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-t border-slate-100 p-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-colors focus:border-slate-400"
                                                value={subscription.status}
                                                onChange={(e) => handleUpdateTenant(tenant._id, e.target.value, subscription.plan, tenant.salonName, billingCycle)}
                                            >
                                                <option value="Active">نشط</option>
                                                <option value="Pending_Approval">بانتظار اعتماد الحوالة</option>
                                                <option value="Pending">بانتظار الدفع</option>
                                                <option value="Inactive">غير نشط</option>
                                            </select>
                                            <select
                                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-colors focus:border-slate-400"
                                                value={currentSelectValue}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    let nextPlan = value;
                                                    let nextBillingCycle = 'monthly';

                                                    if (value.includes('-annual')) {
                                                        nextPlan = value.split('-')[0];
                                                        nextBillingCycle = 'annual';
                                                    }

                                                    handleUpdateTenant(tenant._id, 'Active', nextPlan, tenant.salonName, nextBillingCycle);
                                                }}
                                            >
                                                <option value="Free">مجانية</option>
                                                <option value="Pro">Pro شهري</option>
                                                <option value="Pro-annual">Pro سنوي</option>
                                                <option value="Premium">Premium شهري</option>
                                                <option value="Premium-annual">Premium سنوي</option>
                                            </select>
                                        </div>

                                        {subscription.status === 'Pending_Approval' && (
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateTenant(tenant._id, 'Active', subscription.plan, tenant.salonName, billingCycle)}
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-emerald-700"
                                            >
                                                <CheckCircle2 size={16} />
                                                اعتماد الحوالة وتفعيل الصالون
                                            </button>
                                        )}

                                        <div className="grid grid-cols-[1fr_auto] gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleImpersonate(tenant._id, tenant.salonName)}
                                                className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition-colors hover:bg-blue-600 hover:text-white"
                                            >
                                                <ShieldCheck size={16} />
                                                دخول كدعم فني
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteTenant(tenant._id, tenant.salonName)}
                                                className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                                                title="حذف المنشأة بالكامل"
                                                aria-label="حذف المنشأة بالكامل"
                                            >
                                                <Trash2 size={17} />
                                            </button>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </section>
                )}
            </div>

            <ConfirmDialog
                dialog={confirmDialog}
                onClose={() => setConfirmDialog(null)}
                onConfirm={runConfirmedAction}
            />
        </main>
    );
};

export default SuperAdminScreen;
