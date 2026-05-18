import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../services/api';
import { formatTime12Hour, getTimePeriod } from '../utils/helpers';

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
    const [pin, setPin] = useState(localStorage.getItem(`barber_pin_${slug}`) || '');
    const [loginError, setLoginError] = useState('');

    // 💡 حالة جديدة لتخزين التاريخ المحدد (الافتراضي هو اليوم)
    const [selectedDate, setSelectedDate] = useState(getLocalYYYYMMDD());

    const [appointments, setAppointments] = useState([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 💡 تم إضافة dateStr كمعامل للدالة ليتم إرساله للباك إند
    const fetchQueue = useCallback(async (bName, bPin, dateStr, silent = false) => {
        if (!silent) setIsRefreshing(true);
        try {
            const res = await API.post('/appointments/barber-portal/queue', {
                slug,
                barberName: bName,
                pin: bPin,
                date: dateStr // إرسال التاريخ هنا
            });
            setAppointments(res.data.appointments);
            return true;
        } catch (error) {
            return false;
        } finally {
            if (!silent) setIsRefreshing(false);
        }
    }, [slug]);

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
            const savedPin = localStorage.getItem(`barber_pin_${slug}`);

            if (savedName && savedPin) {
                // 💡 إرسال selectedDate عند الدخول التلقائي
                const success = await fetchQueue(savedName, savedPin, selectedDate, true);
                if (success) setIsLoggedIn(true);
                else handleLogout();
            }
            setIsAutoLoggingIn(false);
        };
        autoLogin();
    }, [slug, fetchQueue]); // تم إزالة selectedDate لمنع التكرار غير المرغوب

    // التحديث التلقائي (Polling)
    useEffect(() => {
        let interval;
        if (isLoggedIn && barberName && pin) {
            interval = setInterval(() => {
                fetchQueue(barberName, pin, selectedDate, true);
            }, 30000);
        }
        return () => clearInterval(interval);
    }, [isLoggedIn, barberName, pin, selectedDate, fetchQueue]); // 💡 إضافة selectedDate

    const handleLogin = async (e) => {
        e.preventDefault();

        const selectedBarber = barbersList.find(b => b.name === barberName);
        if (selectedBarber?.hasPin && pin.length < 3) {
            return setLoginError('الرمز السري قصير جداً');
        }

        setIsLoading(true);
        setLoginError('');

        // 💡 إرسال التاريخ عند الدخول اليدوي
        const success = await fetchQueue(barberName, pin, selectedDate);

        if (success) {
            localStorage.setItem(`barber_name_${slug}`, barberName);
            localStorage.setItem(`barber_pin_${slug}`, pin);
            setIsLoggedIn(true);
        } else {
            setLoginError('تأكد من الرمز السري وحاول مجدداً');
        }
        setIsLoading(false);
    };

    const handleLogout = () => {
        if (!window.confirm('هل تريد تسجيل الخروج من البوابة؟')) return;
        localStorage.removeItem(`barber_name_${slug}`);
        localStorage.removeItem(`barber_pin_${slug}`);
        setIsLoggedIn(false);
        setPin('');
        setAppointments([]);
    };

    const handleUpdateStatus = async (appointmentId, newStatus) => {
        if (!window.confirm(newStatus === 'Completed' ? 'هل أنت متأكد من إنهاء هذه الحلاقة؟ ✂️' : 'هل العميل لم يحضر؟ ❌')) return;

        setIsUpdating(true);
        try {
            const payload = { status: newStatus, slug, barberName, pin };
            if (newStatus === 'Cancelled') {
                payload.cancelReason = "العميل لم يحضر (سُجلت بواسطة الحلاق)";
            }

            await API.put(`/appointments/barber-portal/status/${appointmentId}`, payload);
            setAppointments(prev => prev.map(app => app._id === appointmentId ? { ...app, status: newStatus } : app));
        } catch (error) {
            alert('حدث خطأ أثناء التحديث');
        } finally {
            setIsUpdating(false);
        }
    };

    // 💡 دالة لتغيير التاريخ بسرعة (أمس، اليوم، غداً) وجلب المواعيد
    const changeDateOffset = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        const newDate = getLocalYYYYMMDD(d);
        setSelectedDate(newDate);
        fetchQueue(barberName, pin, newDate);
    };

    // 💡 دالة لتغيير التاريخ من التقويم وجلب المواعيد
    const handleDateChange = (e) => {
        const newDate = e.target.value;
        setSelectedDate(newDate);
        fetchQueue(barberName, pin, newDate);
    };

    if ((isLoading && !tenantData) || isAutoLoggingIn) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-arabic text-xl font-bold animate-pulse">جاري التجهيز... ⏳</div>;
    }

    if (!tenantData) {
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-arabic text-red-500 font-bold text-xl">الصالون غير موجود ✂️</div>;
    }

    const primaryColor = tenantData.branding?.primaryColor || '#2563eb';
    const todayStr = getLocalYYYYMMDD();

    return (
        <div className="min-h-screen bg-slate-50 font-arabic text-right pb-10 selection:bg-slate-200" dir="rtl">
            <div className="bg-white px-6 py-8 rounded-b-[40px] shadow-sm border-b border-slate-100 flex flex-col items-center relative overflow-hidden mb-6">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-10 -mt-10" style={{ backgroundColor: primaryColor, opacity: 0.1 }}></div>
                {tenantData.branding?.logoUrl ? (
                    <img src={tenantData.branding.logoUrl} alt="Logo" className="h-16 w-16 object-contain drop-shadow-md relative z-10 mb-3" />
                ) : (
                    <div className="h-16 w-16 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl mb-3 relative z-10">✂️</div>
                )}
                <h1 className="text-xl font-black text-slate-800 relative z-10">بوابة الطاقم | {tenantData.salonName}</h1>
                {isLoggedIn && (
                    <span className="mt-2 bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm border border-slate-200">
                        مرحباً بك: {barberName} 👋
                    </span>
                )}
            </div>

            <main className="max-w-lg mx-auto px-4 md:px-5">
                <AnimatePresence mode="wait">
                    {!isLoggedIn ? (
                        <motion.form key="login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} onSubmit={handleLogin} className="bg-white p-6 md:p-8 rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100">
                            <h2 className="text-2xl font-black text-slate-800 mb-6 text-center">تسجيل الدخول 🔐</h2>
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-bold text-slate-500 mb-2">اختر اسمك (الكرسي):</label>
                                    <select value={barberName} onChange={(e) => setBarberName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-700 outline-none focus:ring-2 appearance-none cursor-pointer" style={{ '--tw-ring-color': `${primaryColor}50` }}>
                                        {barbersList.length === 0 ? (
                                            <option disabled>لا يوجد حلاقين مسجلين</option>
                                        ) : (
                                            barbersList.map(b => (
                                                <option key={b._id || b.name} value={b.name}>{b.name}</option>
                                            ))
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-500 mb-2">الرمز السري (PIN):</label>
                                    <input
                                        type="number"
                                        required={barbersList.find(b => b.name === barberName)?.hasPin ? true : false}
                                        placeholder="****"
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        disabled={!barbersList.find(b => b.name === barberName)?.hasPin}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-800 text-center tracking-[1em] text-2xl outline-none focus:ring-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ '--tw-ring-color': `${primaryColor}50` }}
                                        dir="ltr"
                                    />
                                    {!barbersList.find(b => b.name === barberName)?.hasPin && (
                                        <p className="text-xs font-bold text-emerald-500 text-center mt-2">هذا الكرسي لا يتطلب رمز سري.</p>
                                    )}
                                </div>
                                {loginError && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-red-500 text-center bg-red-50 p-3 rounded-xl border border-red-100">{loginError}</motion.p>}
                                <button type="submit" disabled={isLoading || barbersList.length === 0} className="w-full py-4 text-white rounded-2xl font-black text-lg transition-all active:scale-95 shadow-lg mt-2 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: primaryColor, boxShadow: `0 10px 25px ${primaryColor}40` }}>
                                    {isLoading ? <span className="animate-pulse">جاري التحقق...</span> : <>دخول للجدول 🚀</>}
                                </button>
                            </div>
                        </motion.form>
                    ) : (
                        <motion.div key="queue" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                            <div className="flex justify-between items-center mb-4 px-1">
                                <h2 className="text-lg font-black text-slate-800">سجل المواعيد 📅</h2>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => fetchQueue(barberName, pin, selectedDate)} disabled={isRefreshing} className={`text-xs bg-slate-100 text-slate-500 p-2 rounded-full hover:bg-slate-200 transition-all ${isRefreshing ? 'animate-spin' : ''}`} title="تحديث القائمة">
                                        🔄
                                    </button>
                                    <button onClick={handleLogout} className="text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white bg-red-50 px-4 py-2 rounded-xl transition-all shadow-sm">خروج 🚪</button>
                                </div>
                            </div>

                            {/* 💡 شريط اختيار التاريخ الجديد */}
                            <div className="mb-6 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                                <button
                                    onClick={() => changeDateOffset(-1)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${selectedDate === getLocalYYYYMMDD(new Date(new Date().setDate(new Date().getDate() - 1))) ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    أمس
                                </button>
                                <button
                                    onClick={() => changeDateOffset(0)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${selectedDate === todayStr ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    اليوم
                                </button>
                                <button
                                    onClick={() => changeDateOffset(1)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${selectedDate === getLocalYYYYMMDD(new Date(new Date().setDate(new Date().getDate() + 1))) ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    غداً
                                </button>
                                <div className="relative flex-1 min-w-[120px]">
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={handleDateChange}
                                        className="w-full bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-3 py-2 outline-none focus:border-slate-400 h-full"
                                    />
                                </div>
                            </div>

                            {appointments.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center">
                                    <span className="text-6xl block mb-4 grayscale opacity-60">🏖️</span>
                                    <p className="text-slate-500 font-bold text-lg">لا توجد مواعيد في هذا اليوم!</p>
                                    <p className="text-xs font-bold text-slate-400 mt-2">({selectedDate})</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {appointments.map(app => (
                                        <motion.div layout key={app._id} className={`bg-white p-4 md:p-5 rounded-3xl shadow-sm border-2 transition-all ${app.status === 'Booked' ? 'border-slate-100 hover:border-blue-200' : app.status === 'Completed' ? 'border-emerald-100 opacity-70' : 'border-red-100 opacity-50'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-3 md:gap-4">
                                                    <div className="bg-slate-50 text-slate-800 p-2 md:p-3 rounded-2xl flex flex-col items-center justify-center min-w-[65px] md:min-w-[75px] border border-slate-100 shadow-inner">
                                                        <span className="font-black text-lg md:text-xl" dir="ltr">{formatTime12Hour(app.timeSlot)}</span>
                                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-400">{getTimePeriod(app.timeSlot)}</span>
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-base md:text-lg text-slate-800 line-clamp-1">{app.childName}</p>
                                                        <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-0.5" dir="ltr">{app.customerPhone}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`text-[9px] md:text-[10px] px-3 py-1 rounded-full font-black shadow-sm ${app.status === 'Booked' ? 'bg-blue-50 text-blue-600 border border-blue-100' : app.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                        {app.status === 'Booked' ? 'قادم ⏳' : app.status === 'Completed' ? 'مكتمل ✅' : 'لم يحضر ❌'}
                                                    </span>
                                                    {app.status === 'Booked' && app.totalPrice > 0 && (
                                                        <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-lg mt-1">
                                                            {app.totalPrice} ر.س
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {app.selectedServices && app.selectedServices.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mb-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                    {app.selectedServices.map((srv, idx) => (
                                                        <span key={idx} className="text-[10px] font-bold bg-white text-slate-600 px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                                                            {srv.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {app.status === 'Booked' && (
                                                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                                    <button disabled={isUpdating} onClick={() => handleUpdateStatus(app._id, 'Completed')} className="flex-1 bg-emerald-50 text-emerald-600 font-black py-3 rounded-xl hover:bg-emerald-500 hover:text-white transition-all text-sm active:scale-95 shadow-sm">
                                                        إنهاء الحلاقة ✅
                                                    </button>
                                                    <button disabled={isUpdating} onClick={() => handleUpdateStatus(app._id, 'Cancelled')} className="px-4 bg-red-50 text-red-500 font-black rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm active:scale-95 shadow-sm">
                                                        لم يحضر
                                                    </button>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default BarberPortal;