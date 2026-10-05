import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, FileText, RotateCcw, Scissors, XCircle } from 'lucide-react';
import { formatBookingTime, formatTime12Hour, getTimePeriod } from '../../utils/helpers';
import API from '../../services/api';
import CancelAppointmentModal from './CancelAppointmentModal';

const statusLabels = {
    All: 'الكل',
    Booked: 'محجوز',
    Completed: 'مكتمل',
    Cancelled: 'ملغي',
    Pending_Payment: 'بانتظار الدفع',
    Blocked: 'محجوب',
};

const statusClasses = {
    Booked: 'bg-blue-50 text-blue-700 border-blue-200',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const initialFilters = {
    bookingFrom: '', bookingTo: '', visitFrom: '', visitTo: '', time: '',
    customer: '', barber: '', service: '', minPrice: '', maxPrice: '', status: 'All',
};

const SortHeader = ({ field, label, sort, onSort, className = '' }) => {
    const active = sort.sortBy === field;
    const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
        <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 ${className}`}>
            <button type="button" onClick={() => onSort(field)} className="inline-flex min-h-9 w-full items-center gap-1.5 text-right hover:text-slate-900" title={`ترتيب حسب ${label}`}>
                <span>{label}</span><Icon size={14} className={active ? 'text-blue-600' : 'text-slate-400'} />
            </button>
        </th>
    );
};

const AllTab = ({ allAppointments, exportToExcel, handleStatusChange }) => {
    const [filters, setFilters] = useState(initialFilters);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);
    const [sort, setSort] = useState({ sortBy: 'date', direction: 'desc' });
    const [page, setPage] = useState(1);
    const [history, setHistory] = useState({ appointments: [], total: 0 });
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState('');
    const [cancelModalConfig, setCancelModalConfig] = useState({ isOpen: false, appointmentId: null });
    const [isCanceling, setIsCanceling] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setAppliedFilters(filters), 300);
        return () => window.clearTimeout(timer);
    }, [filters]);

    useEffect(() => {
        let cancelled = false;
        const loadHistory = async () => {
            setHistoryLoading(true);
            setHistoryError('');
            try {
                const response = await API.get('/appointments/history', {
                    params: { ...appliedFilters, ...sort, page, limit: 25 },
                });
                if (!cancelled) {
                    setHistory(response.data);
                    const lastPage = Math.max(1, Math.ceil(response.data.total / 25));
                    if (page > lastPage) setPage(lastPage);
                }
            } catch (error) {
                if (!cancelled) setHistoryError(error.response?.data?.message || 'تعذر تحميل سجل الحجوزات.');
            } finally {
                if (!cancelled) setHistoryLoading(false);
            }
        };
        loadHistory();
        return () => { cancelled = true; };
    }, [appliedFilters, sort, page, allAppointments]);

    const updateFilter = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    };

    const changeSort = (field) => {
        setSort((current) => ({
            sortBy: field,
            direction: current.sortBy === field && current.direction === 'asc' ? 'desc' : 'asc',
        }));
        setPage(1);
    };

    const totalPages = Math.max(1, Math.ceil((history.total || 0) / 25));
    const hasFilters = Object.entries(filters).some(([key, value]) => value && !(key === 'status' && value === 'All'));

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
                    <div className="flex flex-wrap items-center gap-2">
                        {Object.keys(statusLabels).map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => updateFilter('status', status)}
                                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black transition-colors ${filters.status === status
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                {statusLabels[status]}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="px-1 text-xs font-bold text-slate-500">{history.total || 0} حجز</span>
                        {hasFilters && (
                            <button type="button" onClick={() => { setFilters(initialFilters); setPage(1); }} className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-slate-600 hover:bg-slate-100">
                                <RotateCcw size={15} /> مسح التصفية
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={exportToExcel}
                            disabled={!allAppointments || allAppointments.length === 0}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                            title="التصدير الحالي يشمل آخر 200 حجز فقط"
                        >
                            <Download size={16} />
                            تصدير آخر 200
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full min-w-[1600px] whitespace-nowrap text-right text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-500">
                                <SortHeader field="createdAt" label="تاريخ الطلب" sort={sort} onSort={changeSort} />
                                <SortHeader field="date" label="الحضور" sort={sort} onSort={changeSort} />
                                <SortHeader field="timeSlot" label="الوقت" sort={sort} onSort={changeSort} />
                                <SortHeader field="childName" label="العميل" sort={sort} onSort={changeSort} />
                                <SortHeader field="barberName" label="الكرسي / الحلاق" sort={sort} onSort={changeSort} />
                                <SortHeader field="services" label="الخدمات" sort={sort} onSort={changeSort} />
                                <SortHeader field="totalPrice" label="الفاتورة" sort={sort} onSort={changeSort} />
                                <SortHeader field="status" label="الحالة" sort={sort} onSort={changeSort} />
                            </tr>
                            <tr className="border-b border-slate-200 bg-white text-xs">
                                <th className="px-2 py-2"><div className="flex flex-col gap-1"><label className="flex items-center gap-1 text-[10px] text-slate-500">من <input type="date" value={filters.bookingFrom} onChange={(e) => updateFilter('bookingFrom', e.target.value)} aria-label="تاريخ الطلب من" className="min-w-0 flex-1 rounded border border-slate-200 p-1" /></label><label className="flex items-center gap-1 text-[10px] text-slate-500">إلى <input type="date" value={filters.bookingTo} onChange={(e) => updateFilter('bookingTo', e.target.value)} aria-label="تاريخ الطلب إلى" className="min-w-0 flex-1 rounded border border-slate-200 p-1" /></label></div></th>
                                <th className="px-2 py-2"><div className="flex flex-col gap-1"><label className="flex items-center gap-1 text-[10px] text-slate-500">من <input type="date" value={filters.visitFrom} onChange={(e) => updateFilter('visitFrom', e.target.value)} aria-label="تاريخ الحضور من" className="min-w-0 flex-1 rounded border border-slate-200 p-1" /></label><label className="flex items-center gap-1 text-[10px] text-slate-500">إلى <input type="date" value={filters.visitTo} onChange={(e) => updateFilter('visitTo', e.target.value)} aria-label="تاريخ الحضور إلى" className="min-w-0 flex-1 rounded border border-slate-200 p-1" /></label></div></th>
                                <th className="px-2 py-2"><input type="time" value={filters.time} onChange={(e) => updateFilter('time', e.target.value)} aria-label="تصفية الوقت" className="w-full rounded border border-slate-200 p-1" /></th>
                                <th className="px-2 py-2"><input type="search" value={filters.customer} onChange={(e) => updateFilter('customer', e.target.value)} maxLength={80} placeholder="الاسم أو الجوال" aria-label="تصفية العميل" className="w-full rounded border border-slate-200 p-1" /></th>
                                <th className="px-2 py-2"><input type="search" value={filters.barber} onChange={(e) => updateFilter('barber', e.target.value)} maxLength={80} placeholder="اسم الحلاق" aria-label="تصفية الحلاق" className="w-full rounded border border-slate-200 p-1" /></th>
                                <th className="px-2 py-2"><input type="search" value={filters.service} onChange={(e) => updateFilter('service', e.target.value)} maxLength={80} placeholder="اسم الخدمة" aria-label="تصفية الخدمة" className="w-full rounded border border-slate-200 p-1" /></th>
                                <th className="px-2 py-2"><div className="flex gap-1"><input type="number" min="0" value={filters.minPrice} onChange={(e) => updateFilter('minPrice', e.target.value)} placeholder="من" aria-label="المبلغ من" className="min-w-0 w-1/2 rounded border border-slate-200 p-1" /><input type="number" min="0" value={filters.maxPrice} onChange={(e) => updateFilter('maxPrice', e.target.value)} placeholder="إلى" aria-label="المبلغ إلى" className="min-w-0 w-1/2 rounded border border-slate-200 p-1" /></div></th>
                                <th className="px-2 py-2"><select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} aria-label="تصفية الحالة" className="w-full rounded border border-slate-200 p-1">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {historyLoading || historyError || history.appointments.length === 0 ? (
                                <tr><td colSpan={8} className="h-48 px-4 text-center text-sm font-bold text-slate-500">
                                    {historyLoading ? 'جار تحميل الحجوزات...' : historyError ? historyError : (
                                        <span className="inline-flex items-center gap-2"><FileText size={18} />{hasFilters ? 'لا توجد حجوزات مطابقة للتصفية' : 'لا توجد حجوزات مسجلة حالياً'}</span>
                                    )}
                                </td></tr>
                            ) : history.appointments.map((app) => (
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
                                                {!['Booked', 'Completed', 'Cancelled'].includes(app.status) && <option value={app.status} disabled>{statusLabels[app.status] || app.status}</option>}
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

            {!historyLoading && !historyError && history.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-600">
                    <span>صفحة {page} من {totalPages} · {history.total} حجز</span>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 disabled:opacity-40"><ChevronRight size={15} /> السابق</button>
                        <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 disabled:opacity-40">التالي <ChevronLeft size={15} /></button>
                    </div>
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
