import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import API from '../../services/api';
import InvoiceModal from './InvoiceModal';
import CancelAppointmentModal from './CancelAppointmentModal';

const DailyTab = ({
    selectedDate,
    setSelectedDate,
    isLoading,
    appointments,
    handleStatusChange,
    handleSingleWhatsApp,
    whatsappSettings,
    refreshAppointments // 💡 1. استلام دالة التحديث من المكون الأب
}) => {

    const [invoiceData, setInvoiceData] = useState(null);
    const [cancelModalConfig, setCancelModalConfig] = useState({ isOpen: false, appointmentId: null });
    const [isCanceling, setIsCanceling] = useState(false);

    // 💡 حالة التحديث الصامت (لكي ندور أيقونة التحديث بدون إخفاء الشاشة)
    const [isSilentRefreshing, setIsSilentRefreshing] = useState(false);

    // ==========================================
    // 💡 2. سحر التحديث التلقائي الصامت (Auto-Refresh)
    // ==========================================
    useEffect(() => {
        // إذا لم يمرر الأب الدالة، لا تفعل شيئاً
        if (!refreshAppointments) return;

        // إعداد مؤقت يشتغل كل 30 ثانية
        const interval = setInterval(async () => {
            setIsSilentRefreshing(true);
            try {
                // نمرر true للدالة (إذا برمجناها في الأب) لتعني "تحديث صامت"
                await refreshAppointments(true);
            } catch (error) {
                console.error("خطأ في التحديث التلقائي", error);
            } finally {
                setIsSilentRefreshing(false);
            }
        }, 30000); // 30,000 ملي ثانية = 30 ثانية

        // تنظيف المؤقت عند إغلاق المكون أو تغيير التاريخ
        return () => clearInterval(interval);
    }, [refreshAppointments, selectedDate]);

    // دالة تجلب بيانات الفاتورة
    const fetchAndShowInvoice = async (appointmentId) => {
        try {
            const res = await API.get(`/appointments/invoice/${appointmentId}`);
            setInvoiceData(res.data.invoice);
        } catch (error) {
            alert("خطأ في جلب الفاتورة");
        }
    };

    // دالة تأكيد الإلغاء من النافذة
    const onConfirmCancel = async (reason) => {
        setIsCanceling(true);
        try {
            await handleStatusChange(cancelModalConfig.appointmentId, 'Cancelled', reason);
            setCancelModalConfig({ isOpen: false, appointmentId: null });
        } catch (error) {
            console.error("خطأ في الإلغاء", error);
        } finally {
            setIsCanceling(false);
        }
    };

    // إعدادات الحركة (Framer Motion)
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-[35px] shadow-sm border border-slate-100 relative"
        >
            {/* 1. ترويسة القسم واختيار التاريخ ومؤشر التحديث */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    📋 قائمة أبطال اليوم:
                </h2>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* 💡 3. مؤشر البث المباشر (Pulse) */}
                    <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100 shadow-sm" title="يتم تحديث المواعيد تلقائياً">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        مباشر
                    </span>

                    {/* زر التحديث اليدوي (اختياري لو أراد التحديث فوراً) */}
                    <button
                        onClick={() => refreshAppointments && refreshAppointments(true)}
                        className={`p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors shadow-sm flex items-center justify-center ${isSilentRefreshing ? 'animate-spin border-blue-200 text-blue-500' : ''}`}
                        title="تحديث القائمة الآن"
                    >
                        🔄
                    </button>

                    {/* حقل التاريخ */}
                    <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 flex-1 md:flex-none hover:border-blue-400 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50">
                        <span className="text-slate-400">📅</span>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent border-none font-black text-slate-700 outline-none cursor-pointer text-sm w-full py-0.5"
                        />
                    </div>
                </div>
            </div>

            {/* 2. حالات العرض */}
            {isLoading && !isSilentRefreshing ? (
                <div className="flex flex-col justify-center items-center h-64 font-black text-slate-300">
                    <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity }} className="text-4xl mb-4">🎈</motion.div>
                    جاري جلب القائمة...
                </div>
            ) : appointments?.length === 0 ? (
                <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-slate-50 rounded-3xl p-20 text-center border border-slate-100 border-dashed">
                    <p className="text-5xl mb-4 grayscale opacity-30">🎈</p>
                    <p className="text-slate-400 font-bold text-lg">الجدول فارغ لهذا اليوم.</p>
                </motion.div>
            ) : (
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <AnimatePresence>
                        {appointments.map((app) => (
                            <motion.div
                                variants={itemVariants}
                                layout
                                key={app._id}
                                className={`relative p-5 rounded-3xl border transition-all flex flex-col justify-between ${app.status === 'Completed' ? 'bg-emerald-50/30 border-emerald-100 opacity-75' :
                                    app.status === 'Cancelled' ? 'bg-red-50/30 border-red-100 opacity-50' :
                                        'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200'
                                    }`}
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="flex items-baseline gap-1.5 mb-1">
                                                <span className="text-2xl font-black text-slate-800" dir="ltr">
                                                    {formatTime12Hour(app.timeSlot)}
                                                </span>
                                                <span className="text-xs font-bold text-slate-400">
                                                    {getTimePeriod(app.timeSlot)}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                                {app.childName}
                                                <span className={`text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-600`}>
                                                    {app.chair}
                                                </span>
                                            </h3>

                                            <div className="flex items-center gap-3 mt-1">
                                                <p className="text-slate-500 font-bold text-sm" dir="ltr">{app.customerPhone}</p>
                                                {app.status === 'Booked' && whatsappSettings?.isEnabled && (
                                                    <button
                                                        onClick={() => handleSingleWhatsApp(app)}
                                                        className="text-slate-400 hover:text-emerald-500 bg-slate-50 hover:bg-emerald-50 px-2 py-1 rounded-lg text-xs font-black transition-colors"
                                                        title="تذكير واتساب"
                                                    >
                                                        💬
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-left bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl flex flex-col items-center justify-center">
                                            <span className="text-[10px] font-bold text-slate-400 mb-0.5">الفاتورة</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="font-black text-xl text-slate-800">{app.totalPrice > 0 ? app.totalPrice : '--'}</span>
                                                <span className="text-[10px] font-bold text-slate-500">ر.س</span>
                                            </div>
                                        </div>
                                    </div>

                                    {app.selectedServices && app.selectedServices.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mb-4 mt-2">
                                            {app.selectedServices.map((srv, idx) => (
                                                <span key={idx} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md border border-slate-200">
                                                    {srv.name}
                                                </span>
                                            ))}
                                            {app.totalDuration && (
                                                <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-1 rounded-md border border-amber-100">
                                                    ⏱️ {app.totalDuration} دقيقة
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 3. أزرار التحكم وحالة الموعد */}
                                <div className="flex items-center gap-2 border-t border-slate-100 pt-3 mt-auto">
                                    {app.status === 'Booked' && (
                                        <>
                                            <button
                                                onClick={() => handleStatusChange(app._id, 'Completed')}
                                                className="flex-1 bg-emerald-500 text-white px-3 py-2 rounded-xl font-bold text-sm hover:bg-emerald-600 active:scale-95 transition-all"
                                            >
                                                تمت الحلاقة ✔️
                                            </button>

                                            <button
                                                onClick={() => setCancelModalConfig({ isOpen: true, appointmentId: app._id })}
                                                className="bg-red-50 text-red-500 px-3 py-2 rounded-xl font-bold text-sm hover:bg-red-100 active:scale-95 transition-all"
                                            >
                                                إلغاء ✖️
                                            </button>
                                        </>
                                    )}

                                    {app.status === 'Completed' && (
                                        <>
                                            <span className="text-emerald-600 font-black text-sm w-full text-center bg-emerald-50 py-2 rounded-xl">
                                                مكتمل ✨
                                            </span>
                                            <button
                                                onClick={() => fetchAndShowInvoice(app._id)}
                                                className="ml-2 bg-slate-800 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
                                                title="طباعة الفاتورة"
                                            >
                                                <span>🖨️</span> فاتورة
                                            </button>
                                        </>
                                    )}

                                    {app.status === 'Cancelled' && (
                                        <div className="w-full bg-red-50 py-2 px-3 rounded-xl flex flex-col justify-center items-center">
                                            <span className="text-red-500 font-black text-sm">
                                                ملغي 🚫
                                            </span>
                                            {app.cancelReason && (
                                                <span className="text-[10px] font-bold text-red-400 mt-0.5 text-center line-clamp-1" title={app.cancelReason}>
                                                    السبب: {app.cancelReason}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}

            {invoiceData && (
                <InvoiceModal
                    invoice={invoiceData}
                    onClose={() => setInvoiceData(null)}
                />
            )}

            <CancelAppointmentModal
                isOpen={cancelModalConfig.isOpen}
                onClose={() => setCancelModalConfig({ isOpen: false, appointmentId: null })}
                onConfirm={onConfirmCancel}
                isCanceling={isCanceling}
            />

        </motion.div>
    );
};

export default DailyTab;