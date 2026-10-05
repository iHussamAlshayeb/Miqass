import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import API from '../services/api';
import { formatTime12Hour, getTimePeriod } from '../utils/helpers';
import { FaPhone } from "react-icons/fa";
import BarberChairIcon from '../components/BarberChairIcon';
import { getBarberColor, getSelectedBarberColor } from '../utils/barberTheme';
// 💡 دالة مساعدة للحصول على التاريخ بصيغة YYYY-MM-DD
const getLocalYYYYMMDD = (dateObj = new Date()) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const BarberPortal = () => {
    const { slug } = useParams();

    const [tenantData, setTenantData] = useState(null);
    const [barbersList, setBarbersList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [barberName, setBarberName] = useState(localStorage.getItem(`barber_name_${slug}`) || '');
    // الرمز يُستخدم لتسجيل الدخول فقط ولا يُحفظ في المتصفح؛ نحفظ توكن جلسة قصير العمر بدلاً منه
    const [pin, setPin] = useState('');
    const tokenKey = `barber_token_${slug}`;
    const [loginError, setLoginError] = useState('');

    const [selectedDate, setSelectedDate] = useState(getLocalYYYYMMDD());

    const [appointments, setAppointments] = useState([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const clearSession = useCallback(() => {
        localStorage.removeItem(`barber_token_${slug}`);
        localStorage.removeItem(`barber_pin_${slug}`);
        setIsLoggedIn(false);
    }, [slug]);

    // login = { name, pin } لتسجيل الدخول، وبدونه يُستخدم توكن الجلسة المحفوظ
    const fetchQueue = useCallback(async (dateStr, silent = false, login = null) => {
        const token = localStorage.getItem(`barber_token_${slug}`);
        if (!login && !token) return false;

        if (!silent) setIsRefreshing(true);
        try {
            const res = login
                ? await API.post('/appointments/barber-portal/queue', {
                    slug,
                    barberName: login.name,
                    pin: login.pin,
                    date: dateStr
                })
                : await API.post('/appointments/barber-portal/queue',
                    { date: dateStr },
                    { headers: { 'X-Barber-Token': token } }
                );
            if (res.data.token) localStorage.setItem(`barber_token_${slug}`, res.data.token);
            setAppointments(res.data.appointments);
            return true;
        } catch (error) {
            if (!login && error.response?.status === 401) clearSession();
            return false;
        } finally {
            if (!silent) setIsRefreshing(false);
        }
    }, [slug, clearSession]);

    useEffect(() => {
        const fetchTenantAndBarbers = async () => {
            try {
                const res = await API.get(`/tenants/${slug}`);
                setTenantData(res.data.tenant);
                const barbers = res.data.barbers || [];
                setBarbersList(barbers);

                if (barbers.length > 0 && !localStorage.getItem(`barber_name_${slug}`)) {
                    setBarberName(barbers[0].name);
                }
            } catch (error) {
                console.error('Error fetching tenant:', error);
            } finally {
                setIsLoading(false);
            }
        };
        if (slug) fetchTenantAndBarbers();
    }, [slug]);

    useEffect(() => {
        const autoLogin = async () => {
            const savedName = localStorage.getItem(`barber_name_${slug}`);
            const savedToken = localStorage.getItem(`barber_token_${slug}`);
            // ترحيل الأجهزة القديمة التي كانت تحفظ الـ PIN: ندخل به مرة واحدة ثم نحذفه
            const legacyPin = localStorage.getItem(`barber_pin_${slug}`);
            localStorage.removeItem(`barber_pin_${slug}`);

            let success = false;
            if (savedToken) {
                success = await fetchQueue(selectedDate, true);
            } else if (savedName && legacyPin) {
                success = await fetchQueue(selectedDate, true, { name: savedName, pin: legacyPin });
            }
            if (success) setIsLoggedIn(true);
            setIsAutoLoggingIn(false);
        };
        autoLogin();
    // الدخول التلقائي مرة واحدة عند فتح البوابة فقط، لا مع كل تغيير للتاريخ
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, fetchQueue]);

    // التحديث التلقائي (Polling)
    useEffect(() => {
        let interval;
        if (isLoggedIn) {
            interval = setInterval(() => {
                fetchQueue(selectedDate, true);
            }, 30000);
        }
        return () => clearInterval(interval);
    }, [isLoggedIn, selectedDate, fetchQueue]);

    const handleLogin = async (e) => {
        e.preventDefault();

        const selectedBarber = barbersList.find(b => b.name === barberName);
        if (selectedBarber?.hasPin && !pin) {
            return setLoginError('أدخل الرمز السري');
        }

        setIsLoading(true);
        setLoginError('');

        const success = await fetchQueue(selectedDate, false, { name: barberName, pin });

        if (success) {
            localStorage.setItem(`barber_name_${slug}`, barberName);
            setPin('');
            setIsLoggedIn(true);
        } else {
            setLoginError('تأكد من الرمز السري وحاول مجدداً');
        }
        setIsLoading(false);
    };

    const handleLogout = () => {
        if (!window.confirm('هل تريد تسجيل الخروج من البوابة؟')) return;
        localStorage.removeItem(`barber_name_${slug}`);
        clearSession();
        setPin('');
        setAppointments([]);
    };

    const handleUpdateStatus = async (appointmentId, newStatus) => {
        if (!window.confirm(newStatus === 'Completed' ? 'هل أنت متأكد من إنهاء هذه الحلاقة؟ ✂️' : 'هل العميل لم يحضر؟ ❌')) return;

        setIsUpdating(true);
        try {
            const payload = { status: newStatus };
            if (newStatus === 'Cancelled') {
                payload.cancelReason = "العميل لم يحضر (سُجلت بواسطة الحلاق)";
            }

            await API.put(`/appointments/barber-portal/status/${appointmentId}`, payload, {
                headers: { 'X-Barber-Token': localStorage.getItem(tokenKey) || '' }
            });
            setAppointments(prev => prev.map(app => app._id === appointmentId ? { ...app, status: newStatus } : app));
        } catch (error) {
            if (error.response?.status === 401) {
                clearSession();
                alert('انتهت جلسة البوابة، سجّل الدخول مجدداً.');
            } else {
                alert('حدث خطأ أثناء التحديث');
            }
        } finally {
            setIsUpdating(false);
        }
    };

    const changeDateOffset = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        const newDate = getLocalYYYYMMDD(d);
        setSelectedDate(newDate);
        fetchQueue(newDate);
    };

    const handleDateChangeObj = (date) => {
        if (!date) return;
        const offset = date.getTimezoneOffset() * 60000;
        const formattedDate = new Date(date.getTime() - offset).toISOString().split('T')[0];
        setSelectedDate(formattedDate);
        fetchQueue(formattedDate);
    };

    if ((isLoading && !tenantData) || isAutoLoggingIn) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-arabic">
                <Motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="text-4xl mb-4">⏳</Motion.div>
                <p className="text-slate-500 font-bold">جاري تجهيز البوابة...</p>
            </div>
        );
    }

    if (!tenantData) {
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-arabic text-red-500 font-bold text-xl">الصالون غير موجود ✂️</div>;
    }

    // 💡 الألوان والتلوين الديناميكي
    const brandPrimary = tenantData.branding?.primaryColor || '#2563eb';
    const brandSecondary = tenantData.branding?.secondaryColor || '#64748b';
    const activeThemeColor = getSelectedBarberColor(barbersList, barberName, brandPrimary, brandSecondary);

    const todayStr = getLocalYYYYMMDD();
    const yesterdayStr = getLocalYYYYMMDD(new Date(new Date().setDate(new Date().getDate() - 1)));
    const tomorrowStr = getLocalYYYYMMDD(new Date(new Date().setDate(new Date().getDate() + 1)));

    return (
        <div className="min-h-screen bg-slate-50 font-arabic text-right pb-12 selection:bg-slate-200 overflow-x-hidden" dir="rtl">

            {/* ─── الهيدر المدمج ─── */}
            <Motion.header
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white px-5 pt-8 pb-6 rounded-b-[40px] shadow-sm border-b border-slate-100 flex flex-col items-center relative overflow-hidden mb-6 transition-colors duration-500"
            >
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none transition-colors duration-500" style={{ backgroundColor: activeThemeColor, opacity: 0.15 }}></div>
                <div className="absolute top-0 left-0 w-40 h-40 rounded-full blur-3xl -ml-16 -mt-16 pointer-events-none transition-colors duration-500" style={{ backgroundColor: activeThemeColor, opacity: 0.1 }}></div>

                {tenantData.branding?.logoUrl ? (
                    <img src={tenantData.branding.logoUrl} alt="Logo" className="h-16 w-16 rounded-2xl object-cover border border-slate-50 shadow-sm relative z-10 mb-3 bg-white" />
                ) : (
                    <div className="h-16 w-16 bg-slate-800 rounded-2xl flex items-center justify-center text-3xl mb-3 relative z-10 shadow-sm border border-slate-700">✂️</div>
                )}

                <h1 className="text-xl font-black text-slate-800 relative z-10 tracking-tight">بوابة الطاقم</h1>
                <p className="text-xs font-bold text-slate-400 mt-1 relative z-10">{tenantData.salonName}</p>

                {isLoggedIn && (
                    <Motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-3 relative z-10 flex items-center gap-2">
                        <span className="px-4 py-1.5 rounded-xl text-xs font-black shadow-sm transition-colors duration-500" style={{ backgroundColor: `${activeThemeColor}15`, color: activeThemeColor }}>
                            👨🏻‍✈️ الكرسي: {barberName}
                        </span>
                    </Motion.div>
                )}
            </Motion.header>

            <main className="max-w-lg mx-auto px-4 md:px-5">
                <AnimatePresence mode="wait">
                    {!isLoggedIn ? (
                        /* ─── شاشة تسجيل الدخول ─── */
                        <Motion.form key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onSubmit={handleLogin} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 relative z-10">
                            <h2 className="text-xl font-black text-slate-800 mb-6 text-center">تسجيل الدخول 🔐</h2>

                            <div className="space-y-6">
                                {/* 💡 اختيار الحلاق - تصميم الكروت بدلاً من القائمة المنسدلة */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-500 mb-3 px-1">اختر الكرسي (الاسم):</label>
                                    <div className="flex overflow-x-auto hide-scrollbar gap-3 pt-3 pb-3 -mx-2 px-3 snap-x">
                                        {barbersList.length === 0 ? (
                                            <p className="text-xs text-slate-400 font-bold p-4 text-center w-full bg-slate-50 rounded-2xl border border-slate-100">لا يوجد طاقم مسجل</p>
                                        ) : (
                                            barbersList.map((b, index) => {
                                                const isSelected = barberName === b.name;
                                                const chairColor = getBarberColor(b, index, brandPrimary, brandSecondary);

                                                return (
                                                    <button
                                                        key={b._id || b.name}
                                                        type="button"
                                                        onClick={() => {
                                                            setBarberName(b.name);
                                                            setLoginError('');
                                                        }}
                                                        className="relative flex-shrink-0 flex flex-col items-center gap-2 group snap-center outline-none"
                                                    >
                                                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all duration-300
                                                            ${isSelected ? 'border-transparent shadow-md scale-105' : 'border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200'}`}
                                                            style={isSelected ? { backgroundColor: chairColor } : {}}>

                                                            <BarberChairIcon
                                                                className={`w-8 h-8 transition-all duration-300 ${isSelected ? 'text-white' : 'opacity-60 group-hover:opacity-100'}`}
                                                                style={!isSelected ? { color: chairColor } : {}} />

                                                            {isSelected && (
                                                                <Motion.div layoutId="barberLoginCheck" className="absolute -bottom-1.5 -left-1.5 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-[10px] font-black border-2 border-white" style={{ color: chairColor }}>✓</Motion.div>
                                                            )}
                                                        </div>
                                                        <span className={`text-xs font-black transition-colors ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>{b.name}</span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* الرمز السري */}
                                <AnimatePresence mode="popLayout">
                                    {barbersList.find(b => b.name === barberName)?.hasPin && (
                                        <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                            <label className="block text-sm font-bold text-slate-500 mb-2 px-1">الرمز السري (PIN):</label>
                                            <input
                                                type="password"
                                                pattern="[0-9]*"
                                                inputMode="numeric"
                                                required
                                                placeholder="****"
                                                value={pin}
                                                onChange={(e) => setPin(e.target.value)}
                                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-800 text-center tracking-[1em] text-2xl outline-none focus:bg-white transition-all duration-300 focus:ring-4"
                                                style={{ '--tw-ring-color': `${activeThemeColor}30`, borderColor: pin.length > 0 ? activeThemeColor : undefined }}
                                                dir="ltr"
                                            />
                                        </Motion.div>
                                    )}
                                </AnimatePresence>

                                {loginError && <Motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-red-500 text-center bg-red-50 p-3 rounded-xl border border-red-100">{loginError}</Motion.p>}

                                <button type="submit" disabled={isLoading || barbersList.length === 0 || !barberName}
                                    className="w-full py-4 text-white rounded-2xl font-black text-lg transition-all duration-300 active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                                    style={{ backgroundColor: activeThemeColor, boxShadow: `0 10px 25px ${activeThemeColor}40` }}>
                                    {isLoading ? <span className="animate-pulse">جاري التحقق...</span> : <>دخول للبوابة 🚀</>}
                                </button>
                            </div>
                        </Motion.form>
                    ) : (
                        /* ─── سجل المواعيد والبوابة ─── */
                        <Motion.div key="queue" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

                            <div className="flex justify-between items-center mb-5 px-1">
                                <h2 className="text-lg font-black text-slate-800">قائمة المواعيد 📅</h2>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => fetchQueue(selectedDate)} disabled={isRefreshing} className={`w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95 ${isRefreshing ? 'animate-spin border-transparent' : ''}`} style={isRefreshing ? { backgroundColor: `${activeThemeColor}20`, color: activeThemeColor } : {}} title="تحديث القائمة">
                                        🔄
                                    </button>
                                    <button onClick={handleLogout} className="text-xs font-black text-red-500 hover:bg-red-500 hover:text-white bg-red-50 px-4 py-2 rounded-xl transition-all shadow-sm border border-red-100 active:scale-95">
                                        خروج
                                    </button>
                                </div>
                            </div>

                            {/* 💡 شريط التاريخ المطور (Segmented Control + Centered DatePicker) */}
                            <div className="mb-6 bg-white p-1.5 rounded-2xl flex items-center gap-1.5 shadow-sm border border-slate-100 overflow-x-auto hide-scrollbar">
                                <button onClick={() => changeDateOffset(-1)}
                                    className={`flex-1 min-w-[70px] py-2 rounded-xl text-xs font-black transition-all duration-300 ${selectedDate === yesterdayStr ? 'text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                                    style={selectedDate === yesterdayStr ? { backgroundColor: activeThemeColor } : {}}>
                                    أمس
                                </button>
                                <button onClick={() => changeDateOffset(0)}
                                    className={`flex-1 min-w-[70px] py-2 rounded-xl text-xs font-black transition-all duration-300 ${selectedDate === todayStr ? 'text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                                    style={selectedDate === todayStr ? { backgroundColor: activeThemeColor } : {}}>
                                    اليوم
                                </button>
                                <button onClick={() => changeDateOffset(1)}
                                    className={`flex-1 min-w-[70px] py-2 rounded-xl text-xs font-black transition-all duration-300 ${selectedDate === tomorrowStr ? 'text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                                    style={selectedDate === tomorrowStr ? { backgroundColor: activeThemeColor } : {}}>
                                    غداً
                                </button>

                                <div className="h-6 w-px bg-slate-200 shrink-0 mx-1"></div>

                                {/* التقويم المنبثق في المنتصف */}
                                <div className="shrink-0 relative">
                                    <DatePicker
                                        selected={new Date(selectedDate)}
                                        onChange={handleDateChangeObj}
                                        dateFormat="yyyy-MM-dd"
                                        withPortal // 💡 يفتح كـ Modal في المنتصف
                                        customInput={
                                            <button className="h-full px-3 py-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 flex items-center justify-center transition-all active:scale-95">
                                                <span className="text-sm">📅</span>
                                            </button>
                                        }
                                    />
                                </div>
                            </div>

                            {appointments.length === 0 ? (
                                <Motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center">
                                    <span className="text-6xl block mb-4 grayscale opacity-60">🏖️</span>
                                    <p className="text-slate-600 font-black text-base">لا توجد مواعيد مسجلة</p>
                                    <p className="text-[11px] font-bold text-slate-400 mt-1" dir="ltr">{selectedDate}</p>
                                </Motion.div>
                            ) : (
                                <div className="space-y-4">
                                    <AnimatePresence>
                                        {appointments.map(app => (
                                            <Motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} key={app._id}
                                                className={`bg-white p-4 md:p-5 rounded-3xl shadow-sm border-2 transition-all duration-500 
                                                ${app.status === 'Booked' ? 'border-slate-100' : app.status === 'Completed' ? 'border-emerald-100 opacity-60 grayscale-[30%]' : 'border-red-100 opacity-50 grayscale-[50%]'}`}
                                                style={app.status === 'Booked' ? { borderLeftColor: activeThemeColor, borderLeftWidth: '4px' } : {}}
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3 md:gap-4">
                                                        {/* مربع الوقت */}
                                                        <div className="bg-slate-50 text-slate-800 py-2.5 px-3 rounded-2xl flex flex-col items-center justify-center min-w-[70px] border border-slate-100 shadow-inner">
                                                            <span className="font-black text-lg leading-none" dir="ltr">{formatTime12Hour(app.timeSlot)}</span>
                                                            <span className="text-[10px] font-bold text-slate-400 mt-1">{getTimePeriod(app.timeSlot)}</span>
                                                        </div>
                                                        {/* بيانات العميل */}
                                                        <div>
                                                            <p className="font-black text-base text-slate-800 line-clamp-1">{app.childName}</p>
                                                            <p className="text-[11px] font-bold text-slate-400 mt-0.5 flex items-center gap-1" dir="ltr">
                                                                <FaPhone className="text-[9px]" /> {app.customerPhone}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* شارة الحالة والمبلغ */}
                                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                        <span className={`text-[10px] px-2.5 py-1 rounded-xl font-black shadow-sm border
                                                            ${app.status === 'Booked' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                                app.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                                    'bg-red-50 text-red-600 border-red-100'}`}>
                                                            {app.status === 'Booked' ? 'في الانتظار ⏳' : app.status === 'Completed' ? 'مكتمل ✅' : 'لم يحضر ❌'}
                                                        </span>

                                                        {app.status === 'Booked' && app.totalPrice > 0 && (
                                                            <span className="text-[11px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                                                {app.totalPrice} ر.س
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* الخدمات المطلوبة */}
                                                {app.selectedServices && app.selectedServices.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                                        {app.selectedServices.map((srv, idx) => (
                                                            <span key={idx} className="text-[10px] font-bold bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-100">
                                                                {srv.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* أزرار التحكم (تظهر فقط إذا كان الموعد غير منتهي) */}
                                                {app.status === 'Booked' && (
                                                    <div className="flex gap-2 pt-3 border-t border-slate-50">
                                                        <button disabled={isUpdating} onClick={() => handleUpdateStatus(app._id, 'Completed')}
                                                            className="flex-1 bg-emerald-50 text-emerald-600 border border-emerald-100 font-black py-3 rounded-xl hover:bg-emerald-500 hover:text-white transition-all text-sm active:scale-95 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                                                            <span className="text-base">✅</span> إنهاء الحلاقة
                                                        </button>
                                                        <button disabled={isUpdating} onClick={() => handleUpdateStatus(app._id, 'Cancelled')}
                                                            className="px-4 bg-red-50 text-red-500 border border-red-100 font-black rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm active:scale-95 shadow-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                                                            <span>❌</span> لم يحضر
                                                        </button>
                                                    </div>
                                                )}
                                            </Motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </Motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default BarberPortal;