import React, { useEffect, useState } from 'react';
import {
    CalendarDays,
    CheckCircle2,
    Clock,
    MessageCircle,
    Printer,
    ShoppingCart,
    RefreshCw,
    Scissors,
    XCircle,
} from 'lucide-react';
import { formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import API from '../../services/api';
import InvoiceModal from './InvoiceModal';
import CancelAppointmentModal from './CancelAppointmentModal';

const statusStyles = {
    Booked: 'border-slate-200 bg-white',
    Completed: 'border-emerald-200 bg-emerald-50/50',
    Cancelled: 'border-red-200 bg-red-50/50 opacity-80',
};

const DailyTab = ({
    selectedDate,
    setSelectedDate,
    isLoading,
    appointments,
    handleStatusChange,
    handleSingleWhatsApp,
    whatsappSettings,
    reviewEnabled,
    refreshAppointments,
    onOpenCheckout,
}) => {
    const [invoiceData, setInvoiceData] = useState(null);
    const [cancelModalConfig, setCancelModalConfig] = useState({ isOpen: false, appointmentId: null });
    const [isCanceling, setIsCanceling] = useState(false);
    const [reviewSendingId, setReviewSendingId] = useState(null);

    const retryWalkInReview = async (appointmentId) => {
        setReviewSendingId(appointmentId);
        try {
            await handleStatusChange(appointmentId, 'Completed');
        } finally {
            setReviewSendingId(null);
        }
    };
    const [isSilentRefreshing, setIsSilentRefreshing] = useState(false);

    useEffect(() => {
        if (!refreshAppointments) return undefined;

        const interval = setInterval(async () => {
            setIsSilentRefreshing(true);
            try {
                await refreshAppointments(true);
            } catch (error) {
                console.error('خطأ في التحديث التلقائي', error);
            } finally {
                setIsSilentRefreshing(false);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [refreshAppointments, selectedDate]);

    const fetchAndShowInvoice = async (appointment) => {
        try {
            const endpoint = appointment.saleId
                ? `/sales/${appointment.saleId?._id || appointment.saleId}/invoice`
                : `/appointments/invoice/${appointment._id}`;
            const res = await API.get(endpoint);
            setInvoiceData(res.data.invoice);
        } catch {
            alert('خطأ في جلب الفاتورة');
        }
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

    const bookedCount = appointments?.filter((appointment) => appointment.status === 'Booked').length || 0;
    const completedCount = appointments?.filter((appointment) => appointment.status === 'Completed').length || 0;

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">
                            <Clock size={15} />
                            بانتظار الخدمة: {bookedCount}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                            <CheckCircle2 size={15} />
                            مكتمل: {completedCount}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            تحديث تلقائي
                        </span>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <button
                            type="button"
                            onClick={() => refreshAppointments && refreshAppointments(true)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                            title="تحديث القائمة الآن"
                        >
                            <RefreshCw size={16} className={isSilentRefreshing ? 'animate-spin' : ''} />
                            تحديث
                        </button>

                        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                            <CalendarDays size={16} className="text-slate-500" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full bg-transparent text-sm font-black text-slate-700 outline-none sm:w-36"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {isLoading && !isSilentRefreshing ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-44 animate-pulse rounded-lg border border-slate-200 bg-white" />
                    ))}
                </div>
            ) : appointments?.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                    <CalendarDays size={28} className="mb-3 text-slate-400" />
                    <p className="font-black text-slate-600">الجدول فارغ لهذا اليوم.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {appointments.map((app) => (
                        <article
                            key={app._id}
                            className={`flex min-h-44 flex-col justify-between rounded-lg border p-4 ${statusStyles[app.status] || statusStyles.Booked}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-black text-slate-950" dir="ltr">
                                            {formatTime12Hour(app.timeSlot)}
                                        </span>
                                        <span className="text-xs font-black text-slate-500">{getTimePeriod(app.timeSlot)}</span>
                                    </div>
                                    <h3 className="mt-2 truncate text-base font-black text-slate-900">{app.childName}</h3>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                                        <span dir="ltr">{app.customerPhone}</span>
                                        <span className="rounded-md border border-slate-200 bg-white px-2 py-1">{app.chair}</span>
                                    </div>
                                </div>

                                <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left">
                                    <p className="text-[11px] font-black text-slate-500">الإجمالي</p>
                                    <p className="mt-1 font-black text-slate-950">
                                        {app.totalPrice > 0 ? app.totalPrice : '--'}
                                        <span className="mr-1 text-[10px] text-slate-500">ر.س</span>
                                    </p>
                                </div>
                            </div>

                            {app.selectedServices && app.selectedServices.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {app.selectedServices.map((srv, idx) => (
                                        <span key={idx} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">
                                            {srv.name}
                                        </span>
                                    ))}
                                    {app.totalDuration && (
                                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                                            {app.totalDuration} دقيقة
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                                {app.status === 'Booked' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => handleStatusChange(app._id, 'Completed')}
                                            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-black text-white hover:bg-emerald-700"
                                        >
                                            <Scissors size={16} />
                                            تمت الخدمة
                                        </button>

                                        {whatsappSettings?.isEnabled && (
                                            <button
                                                type="button"
                                                onClick={() => handleSingleWhatsApp(app)}
                                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                                title="تذكير واتساب"
                                            >
                                                <MessageCircle size={17} />
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => setCancelModalConfig({ isOpen: true, appointmentId: app._id })}
                                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                            title="إلغاء"
                                        >
                                            <XCircle size={17} />
                                        </button>
                                    </>
                                )}

                                {app.status === 'Completed' && (
                                    <>
                                        <span className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white text-sm font-black text-emerald-700">
                                            <CheckCircle2 size={16} />
                                            مكتمل
                                        </span>
                                        {app.bookingSource === 'kiosk_walk_in' && !app.isReviewRequested && reviewEnabled && whatsappSettings?.isEnabled && (
                                            <button
                                                type="button"
                                                onClick={() => retryWalkInReview(app._id)}
                                                disabled={reviewSendingId === app._id}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                            >
                                                <MessageCircle size={16} />
                                                {reviewSendingId === app._id ? 'جار الإرسال...' : 'إرسال التقييم'}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onOpenCheckout(app)}
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-black text-white hover:bg-emerald-700"
                                        >
                                            <ShoppingCart size={16} />
                                            نقطة البيع
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => fetchAndShowInvoice(app)}
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-800"
                                        >
                                            <Printer size={16} />
                                            فاتورة
                                        </button>
                                    </>
                                )}

                                {app.status === 'Cancelled' && (
                                    <div className="flex min-h-10 w-full flex-col justify-center rounded-lg border border-red-200 bg-white px-3 text-center">
                                        <span className="text-sm font-black text-red-700">ملغي</span>
                                        {app.cancelReason && (
                                            <span className="truncate text-[11px] font-bold text-red-500" title={app.cancelReason}>
                                                {app.cancelReason}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
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
        </div>
    );
};

export default DailyTab;
