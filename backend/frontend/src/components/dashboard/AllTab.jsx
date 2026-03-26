import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatBookingTime, formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import CancelAppointmentModal from './CancelAppointmentModal'; // 💡 1. استيراد النافذة

const AllTab = ({ isLoading, allAppointments, exportToExcel, handleStatusChange }) => {
    const [filterStatus, setFilterStatus] = useState('All');

    // 💡 2. حالات النافذة الخاصة بالإلغاء
    const [cancelModalConfig, setCancelModalConfig] = useState({ isOpen: false, appointmentId: null });
    const [isCanceling, setIsCanceling] = useState(false);

    const filteredAppointments = useMemo(() => {
        if (!allAppointments) return [];
        if (filterStatus === 'All') return allAppointments;
        return allAppointments.filter(app => app.status === filterStatus);
    }, [allAppointments, filterStatus]);

    const stats = useMemo(() => {
        if (!allAppointments) return { all: 0, booked: 0, completed: 0, cancelled: 0 };
        return {
            all: allAppointments.length,
            booked: allAppointments.filter(a => a.status === 'Booked').length,
            completed: allAppointments.filter(a => a.status === 'Completed').length,
            cancelled: allAppointments.filter(a => a.status === 'Cancelled').length,
        };
    }, [allAppointments]);

    const filterButtons = [
        { id: 'All', label: 'الكل', count: stats.all, colorClass: 'bg-slate-800 text-white', activeClass: 'ring-slate-800', defaultClass: 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200' },
        { id: 'Booked', label: 'محجوز', count: stats.booked, colorClass: 'bg-blue-500 text-white border-blue-500', activeClass: 'ring-blue-500', defaultClass: 'bg-white text-slate-600 hover:bg-blue-50 border-slate-200' },
        { id: 'Completed', label: 'مكتمل', count: stats.completed, colorClass: 'bg-emerald-500 text-white border-emerald-500', activeClass: 'ring-emerald-500', defaultClass: 'bg-white text-slate-600 hover:bg-emerald-50 border-slate-200' },
        { id: 'Cancelled', label: 'ملغي', count: stats.cancelled, colorClass: 'bg-red-500 text-white border-red-500', activeClass: 'ring-red-500', defaultClass: 'bg-white text-slate-600 hover:bg-red-50 border-slate-200' }
    ];

    // 💡 3. دالة معالجة التغيير من القائمة المنسدلة
    const onSelectStatusChange = (appId, newStatus) => {
        if (newStatus === 'Cancelled') {
            // إذا اختار إلغاء، نفتح النافذة
            setCancelModalConfig({ isOpen: true, appointmentId: appId });
        } else {
            // إذا اختار حالة أخرى، نحدث فوراً
            handleStatusChange(appId, newStatus);
        }
    };

    // 💡 4. دالة تأكيد الإلغاء من النافذة
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

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative">
            <div className="bg-white p-6 md:p-8 rounded-[35px] shadow-sm border border-slate-100">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            🌍 السجل الشامل للحجوزات
                        </h2>
                        <p className="text-xs font-bold text-slate-400 mt-1">
                            عرض وتصفية وتعديل جميع المواعيد المسجلة في النظام.
                        </p>
                    </div>
                    <button
                        onClick={exportToExcel}
                        disabled={!allAppointments || allAppointments.length === 0}
                        className="bg-emerald-50 text-emerald-600 font-black px-5 py-2.5 rounded-xl hover:bg-emerald-500 hover:text-white active:scale-95 transition-all text-sm flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <span>📊</span> تصدير Excel
                    </button>
                </div>

                {!isLoading && allAppointments && allAppointments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-slate-50">
                        {filterButtons.map((btn) => (
                            <button
                                key={btn.id}
                                onClick={() => setFilterStatus(btn.id)}
                                className={`relative px-4 py-2 rounded-xl text-sm font-black transition-all border flex items-center gap-2 
                                    ${filterStatus === btn.id ? `${btn.colorClass} shadow-md ring-2 ring-offset-2 ${btn.activeClass}` : btn.defaultClass}
                                `}
                            >
                                {btn.label}
                                <span className={`text-[10px] px-2 py-0.5 rounded-lg ${filterStatus === btn.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {btn.count}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-20 font-black text-slate-300 flex flex-col items-center">
                        <span className="text-4xl animate-spin block mb-4">⏳</span>
                        جاري تحميل السجل...
                    </div>
                ) : filteredAppointments.length === 0 ? (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <span className="text-5xl block mb-4 grayscale opacity-40">📭</span>
                        <h3 className="text-lg font-black text-slate-500 mb-1">
                            {filterStatus === 'All' ? 'لا توجد حجوزات مسجلة حالياً' : `لا توجد حجوزات بحالة (${filterButtons.find(b => b.id === filterStatus)?.label})`}
                        </h3>
                    </motion.div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm hide-scrollbar">
                        <table className="w-full text-right whitespace-nowrap min-w-[1000px]">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs font-black tracking-wider border-b border-slate-100">
                                    <th className="p-4 rounded-tr-2xl">تاريخ الطلب</th>
                                    <th className="p-4">الحضور</th>
                                    <th className="p-4 text-center">الوقت</th>
                                    <th className="p-4">اسم العميل</th>
                                    <th className="p-4">الكرسي / الحلاق</th>
                                    <th className="p-4">الخدمات المطلوبة</th>
                                    <th className="p-4 text-center">الفاتورة</th>
                                    <th className="p-4 rounded-tl-2xl text-center">الحالة</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm">
                                <AnimatePresence>
                                    {filteredAppointments.map((app, index) => (
                                        <motion.tr key={app._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: index * 0.02 }} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="p-4 text-[11px] font-bold text-slate-400" dir="ltr">{formatBookingTime(app.createdAt)}</td>
                                            <td className="p-4 font-bold text-slate-600 text-xs" dir="ltr">{app.date}</td>
                                            <td className="p-4 font-black text-slate-800 text-center">
                                                <div className="bg-slate-100/50 inline-block px-3 py-1.5 rounded-xl border border-slate-100">
                                                    <span dir="ltr">{formatTime12Hour(app.timeSlot)}</span>{' '}
                                                    <span className="text-[10px] text-slate-400 font-bold">{getTimePeriod(app.timeSlot)}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 font-black text-slate-800">
                                                {app.childName}
                                                <div className="text-[10px] text-slate-400 font-bold mt-0.5" dir="ltr">{app.customerPhone}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">✂️ {app.chair}</span>
                                            </td>

                                            <td className="p-4 max-w-[200px] truncate whitespace-normal">
                                                <div className="flex flex-wrap gap-1">
                                                    {app.selectedServices && app.selectedServices.length > 0 ? (
                                                        app.selectedServices.map((srv, idx) => (
                                                            <span key={idx} className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-100">
                                                                {srv.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-400">حجز مقعد فقط</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="p-4 text-center">
                                                <span className="font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                                                    {app.totalPrice > 0 ? app.totalPrice : '--'} <span className="text-[9px] text-slate-400">ر.س</span>
                                                </span>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    {/* 💡 5. ربط الـ Select بالدالة الذكية الجديدة */}
                                                    <select
                                                        value={app.status}
                                                        onChange={(e) => onSelectStatusChange(app._id, e.target.value)}
                                                        className={`text-xs px-3 py-2 rounded-xl font-black outline-none cursor-pointer shadow-sm text-center transition-all focus:ring-2 appearance-none w-28
                                                            ${app.status === 'Booked' ? 'bg-blue-50 text-blue-600 border border-blue-100 focus:ring-blue-200' :
                                                                app.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 focus:ring-emerald-200' :
                                                                    'bg-red-50 text-red-600 border border-red-100 focus:ring-red-200'
                                                            }`}
                                                    >
                                                        <option value="Booked" className="bg-white text-blue-600">قادم ⏳</option>
                                                        <option value="Completed" className="bg-white text-emerald-600">مكتمل ✅</option>
                                                        <option value="Cancelled" className="bg-white text-red-600">ملغي ❌</option>
                                                    </select>

                                                    {/* عرض سبب الإلغاء إذا وجد تحت القائمة */}
                                                    {app.status === 'Cancelled' && app.cancelReason && (
                                                        <span className="text-[9px] font-bold text-red-400 mt-1 line-clamp-1 max-w-[100px]" title={app.cancelReason}>
                                                            {app.cancelReason}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 💡 6. وضع النافذة أسفل الصفحة */}
            <CancelAppointmentModal
                isOpen={cancelModalConfig.isOpen}
                onClose={() => setCancelModalConfig({ isOpen: false, appointmentId: null })}
                onConfirm={onConfirmCancel}
                isCanceling={isCanceling}
            />

        </motion.div>
    );
};

export default AllTab;