import React, { useMemo, useState } from 'react';
import { Download, FileText, Scissors, XCircle } from 'lucide-react';
import { formatBookingTime, formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import CancelAppointmentModal from './CancelAppointmentModal';

const statusLabels = {
    All: 'الكل',
    Booked: 'محجوز',
    Completed: 'مكتمل',
    Cancelled: 'ملغي',
};

const statusClasses = {
    Booked: 'bg-blue-50 text-blue-700 border-blue-200',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const AllTab = ({ isLoading, allAppointments, exportToExcel, handleStatusChange }) => {
    const [filterStatus, setFilterStatus] = useState('All');
    const [cancelModalConfig, setCancelModalConfig] = useState({ isOpen: false, appointmentId: null });
    const [isCanceling, setIsCanceling] = useState(false);

    const filteredAppointments = useMemo(() => {
        if (!allAppointments) return [];
        if (filterStatus === 'All') return allAppointments;
        return allAppointments.filter((app) => app.status === filterStatus);
    }, [allAppointments, filterStatus]);

    const stats = useMemo(() => {
        if (!allAppointments) return { All: 0, Booked: 0, Completed: 0, Cancelled: 0 };
        return {
            All: allAppointments.length,
            Booked: allAppointments.filter((appointment) => appointment.status === 'Booked').length,
            Completed: allAppointments.filter((appointment) => appointment.status === 'Completed').length,
            Cancelled: allAppointments.filter((appointment) => appointment.status === 'Cancelled').length,
        };
    }, [allAppointments]);

    const onSelectStatusChange = (appId, newStatus) => {
        if (newStatus === 'Cancelled') {
            setCancelModalConfig({ isOpen: true, appointmentId: appId });
            return;
        }

        handleStatusChange(appId, newStatus);
    };

    const onConfirmCancel = async (reason) => {
        setIsCanceling(true);
        try {
            await handleStatusChange(cancelModalConfig.appointmentId, 'Cancelled', reason);
            setCancelModalConfig({ isOpen: false, appointmentId: null });
        } catch (error) {
            console.error('خطأ في الإلغاء', error);
        } finally {
            setIsCanceling(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {Object.keys(statusLabels).map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setFilterStatus(status)}
                                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black transition-colors ${filterStatus === status
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                {statusLabels[status]}
                                <span className={`rounded-md px-2 py-0.5 text-[11px] ${filterStatus === status ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {stats[status]}
                                </span>
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={exportToExcel}
                        disabled={!allAppointments || allAppointments.length === 0}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                        <Download size={16} />
                        تصدير Excel
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="space-y-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                        ))}
                    </div>
                </div>
            ) : filteredAppointments.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                    <FileText size={28} className="mb-3 text-slate-400" />
                    <h3 className="font-black text-slate-600">
                        {filterStatus === 'All' ? 'لا توجد حجوزات مسجلة حالياً' : `لا توجد حجوزات بحالة ${statusLabels[filterStatus]}`}
                    </h3>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full min-w-[980px] whitespace-nowrap text-right text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-500">
                                <th className="px-4 py-3">تاريخ الطلب</th>
                                <th className="px-4 py-3">الحضور</th>
                                <th className="px-4 py-3">الوقت</th>
                                <th className="px-4 py-3">العميل</th>
                                <th className="px-4 py-3">الكرسي / الحلاق</th>
                                <th className="px-4 py-3">الخدمات</th>
                                <th className="px-4 py-3 text-left">الفاتورة</th>
                                <th className="px-4 py-3 text-center">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAppointments.map((app) => (
                                <tr key={app._id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-xs font-bold text-slate-500" dir="ltr">{formatBookingTime(app.createdAt)}</td>
                                    <td className="px-4 py-3 font-bold text-slate-600" dir="ltr">{app.date}</td>
                                    <td className="px-4 py-3 font-black text-slate-900">
                                        <span dir="ltr">{formatTime12Hour(app.timeSlot)}</span>{' '}
                                        <span className="text-xs font-bold text-slate-500">{getTimePeriod(app.timeSlot)}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-black text-slate-900">{app.childName}</div>
                                        <div className="mt-0.5 text-xs font-bold text-slate-500" dir="ltr">{app.customerPhone}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600">
                                            <Scissors size={13} />
                                            {app.chair}
                                        </span>
                                    </td>
                                    <td className="max-w-56 whitespace-normal px-4 py-3">
                                        <div className="flex flex-wrap gap-1.5">
                                            {app.selectedServices && app.selectedServices.length > 0 ? (
                                                app.selectedServices.map((srv, idx) => (
                                                    <span key={idx} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                                                        {srv.name}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs font-bold text-slate-400">حجز مقعد فقط</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-left font-black text-slate-900">
                                        {app.totalPrice > 0 ? app.totalPrice : '--'} <span className="text-[10px] text-slate-500">ر.س</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center justify-center gap-1">
                                            <select
                                                value={app.status}
                                                onChange={(e) => onSelectStatusChange(app._id, e.target.value)}
                                                className={`h-9 w-28 rounded-lg border px-2 text-center text-xs font-black outline-none ${statusClasses[app.status] || statusClasses.Booked}`}
                                            >
                                                <option value="Booked">قادم</option>
                                                <option value="Completed">مكتمل</option>
                                                <option value="Cancelled">ملغي</option>
                                            </select>

                                            {app.status === 'Cancelled' && app.cancelReason && (
                                                <span className="inline-flex max-w-28 items-center gap-1 truncate text-[10px] font-bold text-red-500" title={app.cancelReason}>
                                                    <XCircle size={12} />
                                                    {app.cancelReason}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CancelAppointmentModal
                isOpen={cancelModalConfig.isOpen}
                onClose={() => setCancelModalConfig({ isOpen: false, appointmentId: null })}
                onConfirm={onConfirmCancel}
                isCanceling={isCanceling}
            />
        </div>
    );
};

export default AllTab;
