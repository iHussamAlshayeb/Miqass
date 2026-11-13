import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowRight, Maximize, Minus, Plus, Trash2, Percent, Scissors, Package, Search,
    UserRound, LockKeyhole, Printer, CheckCircle2, ScanBarcode, X, CalendarDays, RefreshCw, ReceiptText, LogOut,
} from 'lucide-react';
import posApi, { endCashierSession, forgetDevice, hasPosSession, isCashierSession, isDeviceNotActivated } from '../services/posApi';
import CashierLogin from '../components/pos/CashierLogin';
import TodayBookings from '../components/pos/TodayBookings';
import ShiftPanel from '../components/pos/ShiftPanel';
import { getBarberServicePrice } from '../utils/servicePricing';
import { priceCart, money } from '../utils/posPricing';
import OpenShiftGate from '../components/pos/OpenShiftGate';
import PaymentModal from '../components/pos/PaymentModal';
import CloseShiftModal from '../components/pos/CloseShiftModal';
import { methodLabel, printShiftReport, isAwaitingPayment } from '../components/pos/posShared';
import DiscountSheet from '../components/pos/DiscountSheet';
import InvoiceModal from '../components/dashboard/InvoiceModal';
import CustomerLookup from '../components/pos/CustomerLookup';
import { normalizeSaudiMobile } from '../utils/saudiMobile';

const ALL = '__all__';
const newRequestId = () => (window.crypto?.randomUUID?.() || `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const readPref = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const writePref = (key, value) => { try { localStorage.setItem(key, value); } catch { /* تجاهل */ } };
const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const Tile = ({ title, price, sub, accent, disabled, onClick }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition active:scale-[0.97] active:bg-slate-50 disabled:opacity-40"
    >
        <span className="line-clamp-2 text-base font-bold leading-snug text-slate-800">{title}</span>
        <span className="mt-3 flex items-end justify-between gap-2">
            <span className="text-xs font-semibold text-slate-400">{sub}</span>
            <span className="font-mono text-lg font-extrabold" style={{ color: accent }} dir="ltr">{money(price)}</span>
        </span>
    </button>
);

function POSScreen() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const appointmentParam = searchParams.get('appointment') || '';
    const [catalog, setCatalog] = useState(null);
    const [shift, setShift] = useState(undefined);
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');

    const [mode, setMode] = useState('appointments');
    const firstBookingsLoad = useRef(true);
    const [category, setCategory] = useState(ALL);
    const [search, setSearch] = useState('');
    const [barberId, setBarberId] = useState(() => readPref('pos_barber', ''));

    const [cart, setCart] = useState([]);
    const [saleDiscount, setSaleDiscount] = useState(null);
    const [customer, setCustomer] = useState({ name: '', phone: '' });
    // حجز مكتمل يُحصّل حسابه: خدماته تدخل الفاتورة بأسعار الحجز ويُخصم عربونه
    const [appointment, setAppointment] = useState(null);
    // حجوزات اليوم التي لم يُحصّل حسابها
    const [openAppointments, setOpenAppointments] = useState([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);
    const [showCustomer, setShowCustomer] = useState(false);
    const [discountTarget, setDiscountTarget] = useState(null);
    const [barberTarget, setBarberTarget] = useState(null);
    const [paying, setPaying] = useState(false);
    const [closing, setClosing] = useState(false);
    const [completed, setCompleted] = useState(null);
    const [invoice, setInvoice] = useState(null);
    const [autoPrint, setAutoPrint] = useState(() => readPref('pos_auto_print', '1') === '1');
    const [toast, setToast] = useState('');
    const [showShiftPanel, setShowShiftPanel] = useState(false);
    // الكاشير يدخل برمزه؛ المالك يدخل بجلسة لوحة التحكم
    const [signedIn, setSignedIn] = useState(() => hasPosSession());
    const [operator, setOperator] = useState(null);
    const requestIdRef = useRef(newRequestId());

    const salon = catalog?.salon;
    const accent = salon?.primaryColor || '#0f172a';
    const barbers = useMemo(() => catalog?.barbers || [], [catalog]);
    const barberById = useMemo(() => new Map(barbers.map((barber) => [String(barber._id), barber])), [barbers]);
    const activeBarber = barberById.get(barberId) || null;

    const signOut = useCallback(() => {
        endCashierSession();
        setCatalog(null);
        setShift(undefined);
        setOperator(null);
        setSignedIn(hasPosSession());
    }, []);

    const handleAuthError = useCallback((error) => {
        if (error?.response?.status !== 401) return false;
        // جلسة الكاشير انتهت: نعود لشاشة الرمز. جلسة المالك: لصفحة الدخول
        if (isCashierSession()) {
            if (isDeviceNotActivated(error)) forgetDevice();
            signOut();
            setToast(errorMessage(error, 'انتهت الجلسة، أدخل رمزك من جديد.'));
        } else {
            navigate('/login', { replace: true });
        }
        return true;
    }, [navigate, signOut]);

    useEffect(() => {
        if (!signedIn) return;
        Promise.all([posApi.get('/pos/catalog'), posApi.get('/pos/shift'), posApi.get('/pos/me')])
            .then(([catalogRes, shiftRes, meRes]) => {
                setCatalog(catalogRes.data);
                setShift(shiftRes.data.shift);
                setOperator(meRes.data);
            })
            .catch((error) => {
                if (!handleAuthError(error)) setLoadError(errorMessage(error, 'تعذر تحميل نقطة البيع. تحقق من الاتصال.'));
            });
    }, [signedIn, handleAuthError]);
    const isCashier = operator?.role === 'cashier';

    useEffect(() => {
        if (!catalog || !shift || !appointmentParam || appointment?._id === appointmentParam) return;
        posApi.get(`/pos/appointments/${appointmentParam}`)
            .then((res) => {
                const booked = res.data.appointment;
                setAppointment(booked);
                setCustomer({ name: booked.childName || '', phone: booked.customerPhone || '' });
                setCart(booked.services.map((service, index) => ({
                    key: `booked-${index}`, booked: true, itemType: 'service', refId: service.serviceId, name: service.name,
                    unitPrice: Number(service.price || 0), quantity: 1, barberId: booked.barberId, barberName: booked.barberName, discount: null,
                })));
                setSaleDiscount(null);
            })
            .catch((error) => {
                if (handleAuthError(error)) return;
                setToast(errorMessage(error, 'تعذر تحميل الحجز.'));
                setSearchParams({}, { replace: true });
            });
    }, [catalog, shift, appointmentParam, appointment, handleAuthError, setSearchParams]);

    const loadOpenAppointments = useCallback(() => {
        setLoadingAppointments(true);
        posApi.get('/pos/appointments')
            .then((res) => {
                const list = res.data.appointments || [];
                setOpenAppointments(list);
                // أول فتح: تبويب الحجوزات إن وُجد ما ينتظر الدفع، وإلا الخدمات
                if (firstBookingsLoad.current) {
                    firstBookingsLoad.current = false;
                    if (!list.some(isAwaitingPayment)) setMode((current) => (current === 'appointments' ? 'services' : current));
                }
            })
            .catch((error) => { if (!handleAuthError(error)) setOpenAppointments([]); })
            .finally(() => setLoadingAppointments(false));
    }, [handleAuthError]);

    useEffect(() => {
        if (catalog && shift) loadOpenAppointments();
    }, [catalog, shift, loadOpenAppointments]);

    const pickAppointment = (item) => {
        resetSale();
        setSearchParams({ appointment: String(item._id) }, { replace: true });
    };

    useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => setToast(''), 2500);
        return () => clearTimeout(timer);
    }, [toast]);

    // الحلاق المختار يُحفظ للجهاز، ويُلغى إن لم يعد موجوداً
    useEffect(() => {
        if (catalog && barberId && !barberById.has(barberId)) setBarberId('');
    }, [catalog, barberId, barberById]);
    useEffect(() => { writePref('pos_barber', barberId); }, [barberId]);

    const serviceById = useMemo(() => new Map((catalog?.services || []).map((service) => [String(service._id), service])), [catalog]);

    const categories = useMemo(() => {
        const list = mode === 'services' ? catalog?.services : catalog?.products;
        return [...new Set((list || []).map((item) => item.category).filter(Boolean))];
    }, [catalog, mode]);

    const visibleItems = useMemo(() => {
        const list = (mode === 'services' ? catalog?.services : catalog?.products) || [];
        const term = search.trim().toLowerCase();
        return list.filter((item) => (category === ALL || item.category === category) &&
            (!term || [item.name, item.barcode, item.sku].some((field) => String(field || '').toLowerCase().includes(term))));
    }, [catalog, mode, category, search]);

    const priced = useMemo(() => priceCart(cart, saleDiscount), [cart, saleDiscount]);
    const deposit = Number(appointment?.deposit || 0);
    const amountDue = Math.max(Math.round((priced.total - deposit) * 100) / 100, 0);
    // كل فاتورة مرتبطة بعميل: الحجز يحدده، وإلا رقم جوال صحيح
    const hasCustomer = Boolean(appointment) || Boolean(normalizeSaudiMobile(customer.phone));
    const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

    const addService = (service) => {
        const barber = activeBarber;
        const unitPrice = getBarberServicePrice(service, barber);
        setCart((lines) => {
            const match = lines.find((line) => line.itemType === 'service' && line.refId === String(service._id) && line.barberId === (barber ? String(barber._id) : '') && !line.discount);
            if (match) return lines.map((line) => (line === match ? { ...line, quantity: line.quantity + 1 } : line));
            return [...lines, {
                key: `${Date.now()}-${Math.random()}`, itemType: 'service', refId: String(service._id), name: service.name,
                unitPrice, quantity: 1, barberId: barber ? String(barber._id) : '', barberName: barber?.name || '', discount: null,
            }];
        });
    };

    const addProduct = useCallback((product) => {
        setCart((lines) => {
            const inCart = lines.filter((line) => line.refId === String(product._id)).reduce((sum, line) => sum + line.quantity, 0);
            if (inCart + 1 > Number(product.stockQuantity || 0)) {
                setToast(`المخزون غير كافٍ: ${product.name}`);
                return lines;
            }
            const match = lines.find((line) => line.itemType === 'product' && line.refId === String(product._id) && !line.discount);
            if (match) return lines.map((line) => (line === match ? { ...line, quantity: line.quantity + 1 } : line));
            return [...lines, {
                key: `${Date.now()}-${Math.random()}`, itemType: 'product', refId: String(product._id), name: product.name,
                unitPrice: Number(product.salePrice || 0), quantity: 1, barberId: '', barberName: '', discount: null, stock: Number(product.stockQuantity || 0),
            }];
        });
    }, []);

    const changeQty = (key, delta) => setCart((lines) => lines.flatMap((line) => {
        if (line.key !== key || line.booked) return [line];
        const quantity = line.quantity + delta;
        if (quantity <= 0) return [];
        if (line.itemType === 'product') {
            const others = lines.filter((other) => other.refId === line.refId && other.key !== key).reduce((sum, other) => sum + other.quantity, 0);
            if (quantity + others > line.stock) { setToast('لا يوجد مخزون إضافي.'); return [line]; }
        }
        return [{ ...line, quantity }];
    }));

    const setLineBarber = (key, barber) => {
        setCart((lines) => lines.map((line) => {
            if (line.key !== key) return line;
            const service = serviceById.get(line.refId);
            return { ...line, barberId: barber ? String(barber._id) : '', barberName: barber?.name || '', unitPrice: getBarberServicePrice(service, barber) };
        }));
        setBarberTarget(null);
    };

    // قارئ الباركود يكتب بسرعة كبيرة ثم Enter؛ نلتقطه في أي مكان بالشاشة
    const scanRef = useRef({ buffer: '', last: 0 });
    useEffect(() => {
        if (!catalog || !shift) return undefined;
        const onKey = (event) => {
            const state = scanRef.current;
            const now = Date.now();
            if (event.key === 'Enter') {
                const code = state.buffer;
                state.buffer = '';
                if (code.length < 3) return;
                const product = (catalog.products || []).find((item) => item.barcode === code || item.sku === code);
                if (product) {
                    event.preventDefault();
                    addProduct(product);
                    if (event.target?.tagName === 'INPUT') setSearch((value) => (value.endsWith(code) ? value.slice(0, -code.length) : value));
                } else if (event.target?.tagName !== 'INPUT') {
                    setToast(`لا يوجد منتج بالباركود ${code}`);
                }
                return;
            }
            if (event.key.length !== 1) return;
            state.buffer = now - state.last > 60 ? event.key : state.buffer + event.key;
            state.last = now;
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [catalog, shift, addProduct]);

    const resetSale = () => {
        if (appointment || appointmentParam) setSearchParams({}, { replace: true });
        setAppointment(null);
        setCart([]);
        setSaleDiscount(null);
        setCustomer({ name: '', phone: '' });
        setShowCustomer(false);
        setCompleted(null);
        setInvoice(null);
        setActionError('');
        requestIdRef.current = newRequestId();
    };

    const openInvoice = async (saleId) => {
        try {
            const res = await posApi.get(`/pos/sales/${saleId}/invoice`);
            setInvoice(res.data.invoice);
        } catch (error) {
            setToast(errorMessage(error, 'تعذر تحميل الإيصال.'));
        }
    };

    const checkout = async (payments, cash) => {
        setBusy(true);
        setActionError('');
        try {
            if (appointment?.status === 'Booked') {
                await posApi.put(`/pos/appointments/${appointment._id}/status`, { status: 'Completed' });
                setAppointment((current) => (current ? { ...current, status: 'Completed' } : current));
            }
            const res = await posApi.post('/pos/sales', {
                requestId: requestIdRef.current,
                channel: 'pos',
                appointmentId: appointment?._id || undefined,
                customerName: customer.name.trim(),
                customerPhone: normalizeSaudiMobile(customer.phone) || customer.phone.trim(),
                discount: saleDiscount,
                // خدمات الحجز يضيفها الخادم من الحجز نفسه؛ نرسل الإضافات فقط
                items: cart.filter((line) => !line.booked).map((line) => ({
                    itemType: line.itemType,
                    ...(line.itemType === 'service' ? { serviceId: line.refId } : { productId: line.refId }),
                    quantity: line.quantity,
                    barberId: line.barberId || undefined,
                    discount: line.discount || undefined,
                })),
                payments,
            });
            const sale = res.data.sale;
            setPaying(false);
            setCompleted({ sale, payments, ...cash });
            // تحديث المخزون محلياً حتى لا يُباع ما نفد
            setCatalog((current) => ({
                ...current,
                products: current.products.map((product) => {
                    const sold = cart.filter((line) => line.refId === String(product._id)).reduce((sum, line) => sum + line.quantity, 0);
                    return sold ? { ...product, stockQuantity: product.stockQuantity - sold } : product;
                }),
            }));
            if (autoPrint) openInvoice(sale._id);
            loadOpenAppointments();
        } catch (error) {
            if (handleAuthError(error)) return;
            if (error?.response?.status === 409 && /الوردية/.test(error.response.data?.message || '')) {
                setPaying(false);
                setShift(null);
            }
            setActionError(errorMessage(error, 'تعذر حفظ البيع. حاول مرة أخرى.'));
        } finally {
            setBusy(false);
        }
    };

    const openShift = async (payload) => {
        setBusy(true);
        setActionError('');
        try {
            const res = await posApi.post('/pos/shift/open', payload);
            setShift(res.data.shift);
        } catch (error) {
            if (!handleAuthError(error)) setActionError(errorMessage(error, 'تعذر فتح الوردية.'));
            if (error?.response?.status === 409) posApi.get('/pos/shift').then((res) => setShift(res.data.shift)).catch(() => {});
        } finally {
            setBusy(false);
        }
    };

    const startClosing = async () => {
        setActionError('');
        try {
            const res = await posApi.get('/pos/shift');
            setShift(res.data.shift);
            if (res.data.shift) setClosing(true);
        } catch (error) {
            if (!handleAuthError(error)) setToast(errorMessage(error, 'تعذر تحميل الوردية.'));
        }
    };

    const closeShift = async (payload) => {
        setBusy(true);
        setActionError('');
        try {
            const res = await posApi.post('/pos/shift/close', isCashier ? payload : { ...payload, closedBy: readPref('pos_cashier_name', '') });
            setClosing(false);
            setShift(null);
            resetSale();
            printShiftReport(res.data.shift, salon?.name);
        } catch (error) {
            if (!handleAuthError(error)) setActionError(errorMessage(error, 'تعذر إغلاق الوردية.'));
        } finally {
            setBusy(false);
        }
    };

    const goFullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

    const pendingCount = openAppointments.filter(isAwaitingPayment).length;

    if (!signedIn) {
        return <CashierLogin onSignedIn={() => { setLoadError(''); setSignedIn(true); }} />;
    }

    if (loadError) {
        return (
            <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center" dir="rtl">
                <p className="text-lg font-bold text-slate-700">{loadError}</p>
                <button type="button" onClick={() => window.location.reload()} className="h-12 rounded-xl bg-slate-900 px-6 font-bold text-white">إعادة المحاولة</button>
            </div>
        );
    }

    if (!catalog || shift === undefined) {
        return (
            <div className="flex h-[100dvh] items-center justify-center bg-slate-100" dir="rtl">
                <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 font-bold text-slate-600 shadow">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-slate-900" /> جاري تجهيز نقطة البيع
                </div>
            </div>
        );
    }

    if (!shift) {
        return (
            <div className="h-[100dvh] overflow-y-auto bg-slate-100" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', 'Tajawal', sans-serif" }}>
                <OpenShiftGate salon={salon} onOpen={openShift} onExit={isCashier ? signOut : () => navigate('/dashboard')} exitLabel={isCashier ? 'خروج' : undefined} cashierName={isCashier ? operator?.name : ''} busy={busy} error={actionError} />
            </div>
        );
    }

    const lineForDiscount = discountTarget && discountTarget !== 'sale' ? priced.lines.find((line) => line.key === discountTarget) : null;

    return (
        <div className="flex h-[100dvh] select-none flex-col overflow-hidden bg-slate-100 text-slate-900" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', 'Tajawal', sans-serif" }}>
            {/* الشريط العلوي */}
            <header className="flex h-16 shrink-0 items-center gap-3 bg-slate-900 px-4 text-white">
                {!isCashier && (
                    <button type="button" onClick={() => navigate('/dashboard')} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label="العودة للوحة التحكم">
                        <ArrowRight size={22} />
                    </button>
                )}
                {salon?.logoUrl ? <img src={salon.logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white object-contain p-0.5" /> : null}
                <div className="min-w-0">
                    <p className="truncate text-base font-extrabold leading-tight">{salon?.name}</p>
                    <p className="text-xs font-semibold text-emerald-300">
                        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                        الوردية مفتوحة{shift.openedBy ? ` · ${shift.openedBy}` : ''}
                        {isCashier && operator?.name && operator.name !== shift.openedBy ? <span className="text-slate-300"> · الكاشير: {operator.name}</span> : null}
                    </p>
                </div>
                <div className="mr-auto flex items-center gap-2">
                    <span className="hidden items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-slate-300 lg:flex">
                        <ScanBarcode size={16} /> القارئ جاهز
                    </span>
                    <button type="button" onClick={goFullscreen} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label="ملء الشاشة">
                        <Maximize size={20} />
                    </button>
                    <button type="button" onClick={() => setShowShiftPanel(true)} className="flex h-11 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-bold hover:bg-white/20">
                        <ReceiptText size={18} /> الوردية
                    </button>
                    <button type="button" onClick={startClosing} className="flex h-11 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-bold hover:bg-white/20">
                        <LockKeyhole size={18} /> <span className="hidden sm:inline">إغلاق الوردية</span>
                    </button>
                    {isCashier && (
                        <button type="button" onClick={signOut} className="flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-slate-300 hover:bg-white/10" aria-label="خروج الكاشير">
                            <LogOut size={18} /> <span className="hidden md:inline">خروج</span>
                        </button>
                    )}
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                {/* الكتالوج */}
                <main className="flex min-w-0 flex-1 flex-col">
                    <div className="space-y-3 border-b border-slate-200 bg-white px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                            <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                                {[['appointments', 'الحجوزات', <CalendarDays key="a" size={18} />], ['services', 'الخدمات', <Scissors key="s" size={18} />], ['products', 'المنتجات', <Package key="p" size={18} />]].map(([id, label, icon]) => (
                                    <button key={id} type="button" onClick={() => { setMode(id); setCategory(ALL); if (id === 'appointments') loadOpenAppointments(); }} className={`flex h-11 items-center gap-2 rounded-lg px-4 font-extrabold ${mode === id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>
                                        {icon} {label}
                                        {id === 'appointments' && pendingCount > 0 && (
                                            <span className="min-w-[22px] rounded-full bg-emerald-600 px-1.5 text-xs font-extrabold leading-[22px] text-white">{pendingCount}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {mode !== 'appointments' && <label className="flex h-[52px] min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-900">
                                <Search size={20} className="text-slate-400" />
                                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === 'products' ? 'ابحث بالاسم أو الباركود' : 'ابحث عن خدمة'} className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none" />
                                {search && <button type="button" onClick={() => setSearch('')} className="p-1 text-slate-400" aria-label="مسح"><X size={18} /></button>}
                            </label>}
                            {mode === 'appointments' && (
                                <button type="button" onClick={loadOpenAppointments} className="mr-auto flex h-[52px] items-center gap-2 rounded-xl border border-slate-200 px-4 font-bold text-slate-600">
                                    <RefreshCw size={18} className={loadingAppointments ? 'animate-spin' : ''} /> تحديث
                                </button>
                            )}
                        </div>
                        {mode === 'services' && barbers.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                                <span className="shrink-0 text-sm font-bold text-slate-500">الحلاق:</span>
                                <button type="button" onClick={() => setBarberId('')} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${!barberId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>بدون</button>
                                {barbers.map((barber) => (
                                    <button key={barber._id} type="button" onClick={() => setBarberId(String(barber._id))} className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold ${barberId === String(barber._id) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700'}`}>
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: barber.iconColor || accent }} />
                                        {barber.name}
                                    </button>
                                ))}
                            </div>
                        )}
                        {mode !== 'appointments' && categories.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-0.5">
                                {[ALL, ...categories].map((name) => (
                                    <button key={name} type="button" onClick={() => setCategory(name)} className={`h-9 shrink-0 rounded-lg px-3 text-sm font-bold ${category === name ? 'bg-slate-200 text-slate-900' : 'text-slate-500'}`}>
                                        {name === ALL ? 'الكل' : name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {mode === 'appointments' ? (
                            <TodayBookings
                                appointments={openAppointments}
                                loading={loadingAppointments}
                                activeId={appointment?._id ? String(appointment._id) : ''}
                                accent={accent}
                                onCollect={pickAppointment}
                                onReceipt={openInvoice}
                                onChanged={loadOpenAppointments}
                                onToast={setToast}
                            />
                        ) : visibleItems.length === 0 ? (
                            <p className="mt-16 text-center font-bold text-slate-400">{search ? 'لا توجد نتائج.' : mode === 'services' ? 'لا توجد خدمات مفعّلة.' : 'لا توجد منتجات مفعّلة.'}</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                                {visibleItems.map((item) => (mode === 'services' ? (
                                    <Tile key={item._id} title={item.name} price={getBarberServicePrice(item, activeBarber)} sub={item.duration ? `${item.duration} د` : item.category || ''} accent={accent} onClick={() => addService(item)} />
                                ) : (
                                    <Tile key={item._id} title={item.name} price={item.salePrice} sub={Number(item.stockQuantity) > 0 ? `المخزون ${item.stockQuantity}` : 'نفد'} accent={accent} disabled={Number(item.stockQuantity) <= 0} onClick={() => addProduct(item)} />
                                )))}
                            </div>
                        )}
                    </div>
                </main>

                {/* السلة */}
                <aside className="flex w-[340px] shrink-0 flex-col border-r border-slate-200 bg-white lg:w-[400px]">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <h2 className="text-lg font-extrabold">الفاتورة <span className="text-sm font-bold text-slate-400">({itemCount})</span></h2>
                        <div className="flex gap-1">
                            {!appointment && (
                                <button type="button" onClick={() => setShowCustomer((value) => !value)} className={`flex h-10 max-w-[170px] items-center gap-1.5 rounded-lg px-3 text-sm font-bold ${hasCustomer ? 'bg-sky-50 text-sky-700' : 'border border-dashed border-amber-300 text-amber-700'}`}>
                                    <UserRound size={18} className="shrink-0" /> <span className="truncate">{hasCustomer ? (customer.name || customer.phone) : 'اختر العميل'}</span>
                                </button>
                            )}
                            {cart.length > 0 && (
                                <button type="button" onClick={resetSale} className="flex h-10 items-center rounded-lg px-3 text-sm font-bold text-red-600 hover:bg-red-50">إفراغ</button>
                            )}
                        </div>
                    </div>

                    {appointment && (
                        <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
                            <CalendarDays size={20} className="shrink-0 text-emerald-700" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-emerald-900">حجز {appointment.childName}</p>
                                <p className="truncate text-xs font-semibold text-emerald-700">{appointment.timeSlot} · {appointment.barberName}{appointment.status === 'Booked' ? ' · يُسجل مكتملاً عند الدفع' : ''}</p>
                            </div>
                            <button type="button" onClick={resetSale} className="flex h-10 w-10 items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-100" aria-label="إلغاء تحصيل الحجز"><X size={18} /></button>
                        </div>
                    )}

                    {showCustomer && !appointment && (
                        <CustomerLookup
                            customer={customer}
                            onChange={setCustomer}
                            onDone={() => setShowCustomer(false)}
                        />
                    )}

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {cart.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-slate-400">
                                <Scissors size={36} />
                                <p className="font-bold">اضغط على خدمة أو منتج لإضافته</p>
                                <p className="text-sm">أو امسح باركود المنتج</p>
                            </div>
                        ) : priced.lines.map((line) => (
                            <div key={line.key} className="border-b border-slate-100 px-4 py-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-800">{line.name}</p>
                                        {line.booked ? (
                                            <p className="text-xs font-bold text-emerald-700">من الحجز{line.barberName ? ` · ${line.barberName}` : ''}</p>
                                        ) : (
                                            <p className="font-mono text-xs text-slate-400" dir="ltr">{money(line.unitPrice)} × {line.quantity}</p>
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <p className="font-mono text-base font-extrabold" dir="ltr">{money(line.netAmount)}</p>
                                        {line.discountAmount > 0 && <p className="font-mono text-xs text-slate-400 line-through" dir="ltr">{money(line.grossAmount)}</p>}
                                    </div>
                                </div>
                                {!line.booked && <div className="mt-2 flex items-center gap-1.5">
                                    <div className="flex items-center rounded-lg border border-slate-200">
                                        <button type="button" onClick={() => changeQty(line.key, -1)} className="flex h-10 w-10 items-center justify-center text-slate-600" aria-label="إنقاص">{line.quantity === 1 ? <Trash2 size={17} className="text-red-500" /> : <Minus size={17} />}</button>
                                        <span className="w-7 text-center font-mono font-bold">{line.quantity}</span>
                                        <button type="button" onClick={() => changeQty(line.key, 1)} className="flex h-10 w-10 items-center justify-center text-slate-600" aria-label="زيادة"><Plus size={17} /></button>
                                    </div>
                                    {line.itemType === 'service' && barbers.length > 0 && (
                                        <button type="button" onClick={() => setBarberTarget(line.key)} className={`flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold ${line.barberId ? 'border-slate-200 text-slate-700' : 'border-dashed border-amber-300 text-amber-700'}`}>
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: barberById.get(line.barberId)?.iconColor || (line.barberId ? accent : '#f59e0b') }} />
                                            <span className="truncate">{line.barberName || 'اختر الحلاق'}</span>
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setDiscountTarget(line.key)} className={`mr-auto flex h-10 items-center gap-1 rounded-lg border px-2.5 text-sm font-bold ${line.discount ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500'}`}>
                                        <Percent size={15} /> {line.discount ? (line.discount.type === 'percent' ? `${line.discount.value}%` : money(line.discountAmount)) : 'خصم'}
                                    </button>
                                </div>}
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="space-y-1 text-sm font-semibold text-slate-600">
                            <div className="flex justify-between"><span>المجموع</span><span className="font-mono" dir="ltr">{money(priced.grossTotal)}</span></div>
                            {priced.lineDiscountTotal > 0 && <div className="flex justify-between text-rose-700"><span>خصم البنود</span><span className="font-mono" dir="ltr">-{money(priced.lineDiscountTotal)}</span></div>}
                            <button type="button" disabled={!cart.length} onClick={() => setDiscountTarget('sale')} className="flex w-full justify-between rounded-md py-1 text-rose-700 disabled:text-slate-400">
                                <span className="flex items-center gap-1"><Percent size={14} /> {saleDiscount ? `خصم الفاتورة${saleDiscount.type === 'percent' ? ` ${saleDiscount.value}%` : ''}` : 'إضافة خصم على الفاتورة'}</span>
                                {priced.saleDiscount > 0 && <span className="font-mono" dir="ltr">-{money(priced.saleDiscount)}</span>}
                            </button>
                            <div className="flex justify-between text-slate-400"><span>منها ضريبة 15%</span><span className="font-mono" dir="ltr">{money(priced.vat)}</span></div>
                            {deposit > 0 && <div className="flex justify-between text-emerald-700"><span>العربون المدفوع مسبقاً</span><span className="font-mono" dir="ltr">-{money(deposit)}</span></div>}
                        </div>
                        {actionError && !paying && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{actionError}</p>}
                        <button
                            type="button"
                            disabled={!cart.length || priced.total <= 0 || busy}
                            onClick={() => {
                                setActionError('');
                                if (!hasCustomer) {
                                    setShowCustomer(true);
                                    setToast('اربط الفاتورة بعميل: اكتب رقم جواله أولاً.');
                                    return;
                                }
                                // حجز مدفوع بالكامل بالعربون: يُغلق دون دفعة جديدة
                                if (amountDue <= 0) checkout([], {});
                                else setPaying(true);
                            }}
                            className="mt-3 flex h-16 w-full items-center justify-between rounded-xl px-5 text-white shadow-lg transition active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none"
                            style={{ backgroundColor: cart.length ? '#059669' : undefined }}
                        >
                            <span className="text-xl font-extrabold">{cart.length && !hasCustomer ? 'اختر العميل' : amountDue <= 0 && cart.length ? 'إتمام' : 'الدفع'}</span>
                            <span className="font-mono text-2xl font-extrabold" dir="ltr">{money(amountDue)}</span>
                        </button>
                    </div>
                </aside>
            </div>

            {barberTarget && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" onClick={() => setBarberTarget(null)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <h3 className="mb-4 text-xl font-extrabold">من نفّذ الخدمة؟</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {barbers.map((barber) => {
                                const line = cart.find((item) => item.key === barberTarget);
                                const price = getBarberServicePrice(serviceById.get(line?.refId), barber);
                                return (
                                    <button key={barber._id} type="button" onClick={() => setLineBarber(barberTarget, barber)} className={`flex h-16 items-center justify-between rounded-xl border-2 px-4 ${line?.barberId === String(barber._id) ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                                        <span className="flex items-center gap-2 font-bold"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: barber.iconColor || accent }} />{barber.name}</span>
                                        <span className="font-mono text-sm font-bold text-slate-500" dir="ltr">{money(price)}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" onClick={() => setLineBarber(barberTarget, null)} className="mt-3 h-12 w-full rounded-xl border border-slate-200 font-bold text-slate-600">بدون حلاق</button>
                    </div>
                </div>
            )}

            {discountTarget && (
                <DiscountSheet
                    title={discountTarget === 'sale' ? 'خصم على الفاتورة' : `خصم: ${lineForDiscount?.name || ''}`}
                    base={discountTarget === 'sale' ? Math.max(priced.grossTotal - priced.lineDiscountTotal, 0) : lineForDiscount?.grossAmount || 0}
                    initial={discountTarget === 'sale' ? saleDiscount : lineForDiscount?.discount}
                    onClose={() => setDiscountTarget(null)}
                    onApply={(discount) => {
                        if (discountTarget === 'sale') setSaleDiscount(discount);
                        else setCart((lines) => lines.map((line) => (line.key === discountTarget ? { ...line, discount } : line)));
                        setDiscountTarget(null);
                    }}
                />
            )}

            {paying && <PaymentModal total={amountDue} busy={busy} error={actionError} onClose={() => setPaying(false)} onComplete={checkout} />}

            {showShiftPanel && (
                <ShiftPanel
                    onClose={() => setShowShiftPanel(false)}
                    onReceipt={openInvoice}
                    onChanged={() => { posApi.get('/pos/shift').then((res) => { if (res.data.shift) setShift(res.data.shift); }).catch(() => {}); loadOpenAppointments(); }}
                    onToast={setToast}
                />
            )}

            {closing && (
                <CloseShiftModal shift={shift} salonName={salon?.name} busy={busy} error={actionError} onClose={() => { setClosing(false); setActionError(''); }} onConfirm={closeShift} />
            )}

            {completed && !invoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
                        <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
                        <h2 className="mt-3 text-2xl font-extrabold">تم البيع</h2>
                        <p className="font-mono text-sm font-bold text-slate-500" dir="ltr">{completed.sale.invoiceNumber}</p>
                        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-4 text-right text-sm font-semibold text-slate-600">
                            <div className="flex justify-between"><span>الإجمالي</span><span className="font-mono font-bold text-slate-900" dir="ltr">{money(completed.sale.totalAmount)}</span></div>
                            {completed.payments.map((payment, index) => (
                                <div key={index} className="flex justify-between"><span>{methodLabel(payment.method)}</span><span className="font-mono" dir="ltr">{money(payment.amount)}</span></div>
                            ))}
                            {completed.tendered ? <div className="flex justify-between"><span>المستلم نقداً</span><span className="font-mono" dir="ltr">{money(completed.tendered)}</span></div> : null}
                        </div>
                        {completed.change > 0 && (
                            <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-100 px-4 py-3 text-amber-900">
                                <span className="text-lg font-extrabold">الباقي للعميل</span>
                                <span className="font-mono text-3xl font-extrabold" dir="ltr">{money(completed.change)}</span>
                            </div>
                        )}
                        <label className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-slate-500">
                            <input type="checkbox" checked={autoPrint} onChange={(event) => { setAutoPrint(event.target.checked); writePref('pos_auto_print', event.target.checked ? '1' : '0'); }} className="h-5 w-5" />
                            طباعة الإيصال تلقائياً بعد كل بيع
                        </label>
                        <div className="mt-4 flex gap-2">
                            <button type="button" onClick={() => openInvoice(completed.sale._id)} className="flex h-14 items-center gap-2 rounded-xl border border-slate-300 px-5 font-bold text-slate-700">
                                <Printer size={20} /> الإيصال
                            </button>
                            <button type="button" onClick={resetSale} className="h-14 flex-1 rounded-xl bg-slate-900 text-lg font-extrabold text-white">بيع جديد</button>
                        </div>
                    </div>
                </div>
            )}

            {invoice && (
                <InvoiceModal invoice={invoice} autoPrint={autoPrint} onClose={() => setInvoice(null)} />
            )}

            {toast && (
                <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white shadow-xl">{toast}</div>
            )}
        </div>
    );
}

export default POSScreen;
