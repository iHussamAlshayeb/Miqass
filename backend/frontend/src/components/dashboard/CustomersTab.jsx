import React, { useEffect, useRef, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Download, FileDown, Gift, Info, Search, Upload, UserPlus, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000; // يطابق حد السيرفر في importCustomers
import API from '../../services/api';

const bookingFilterOptions = [
    { value: 'all', label: 'الكل', icon: Users },
    { value: 'booked', label: 'سبق له الحجز', icon: CalendarCheck },
    { value: 'never', label: 'لم يسبق له الحجز', icon: UserPlus },
];

const CustomersTab = () => {
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [bookingFilter, setBookingFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);
    const [customerCounts, setCustomerCounts] = useState({ all: 0, booked: 0, never: 0 });
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setCurrentPage(1);
            setDebouncedSearchTerm(searchTerm.trim());
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        let isMounted = true;

        const fetchCustomers = async () => {
            setIsLoading(true);
            try {
                const res = await API.get('/appointments/customers', {
                    params: {
                        page: currentPage,
                        limit: 100,
                        bookingHistory: bookingFilter,
                        search: debouncedSearchTerm,
                    },
                });

                if (!isMounted) return;
                setCustomers(res.data.customers || []);
                setCustomerCounts(res.data.counts || { all: 0, booked: 0, never: 0 });
                setPagination(res.data.pagination || { page: 1, total: 0, totalPages: 1 });
            } catch (error) {
                if (isMounted) console.error('Error fetching customers:', error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchCustomers();

        return () => {
            isMounted = false;
        };
    }, [bookingFilter, currentPage, debouncedSearchTerm, refreshKey]);

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // حماية إضافية: لا نقرأ ملفات ضخمة داخل المتصفح
        if (file.size > MAX_IMPORT_FILE_BYTES) {
            alert('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت.');
            event.target.value = null;
            return;
        }

        setIsImporting(true);
        const reader = new FileReader();
        // ملفات CSV تُقرأ كنص UTF-8 حتى لا تتشوه الحروف العربية
        const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';

        reader.onload = async (readerEvent) => {
            try {
                // sheetRows يوقف التحليل بعد الحد المسموح بدل قراءة الملف كاملاً
                // (+1 لصف العناوين، +1 لاكتشاف تجاوز الحد بدل القص الصامت)
                const workbook = XLSX.read(readerEvent.target.result, {
                    type: isCsv ? 'string' : 'array',
                    sheetRows: MAX_IMPORT_ROWS + 2,
                });
                const worksheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[worksheetName];
                const data = XLSX.utils.sheet_to_json(worksheet);

                if (data.length === 0) {
                    alert('الملف فارغ.');
                    return;
                }
                if (data.length > MAX_IMPORT_ROWS) {
                    alert(`الحد الأقصى ${MAX_IMPORT_ROWS} عميل في الملف الواحد. قسّم الملف وحاول مجدداً.`);
                    return;
                }

                const res = await API.post('/appointments/import-customers', { customers: data });
                let alertMsg = res.data.message;
                if (res.data.ignored > 0) {
                    alertMsg += `\nتم تجاهل ${res.data.ignored} عميل لأنهم مكررين.`;
                }
                if (res.data.invalid > 0) {
                    alertMsg += `\nيوجد ${res.data.invalid} صف غير صالح لم يتم استيراده.`;
                }

                alert(alertMsg);
                setSearchTerm('');
                setBookingFilter('never');
                setCurrentPage(1);
                setRefreshKey((value) => value + 1);
            } catch (error) {
                alert(error.response?.data?.message || 'حدث خطأ في قراءة الملف. تأكد من أن الملف بصيغة Excel ويحتوي على أعمدة الاسم ورقم الجوال.');
                console.error(error);
            } finally {
                setIsImporting(false);
                event.target.value = null;
            }
        };

        reader.onerror = () => {
            alert('تعذر قراءة الملف.');
            setIsImporting(false);
            event.target.value = null;
        };

        if (isCsv) reader.readAsText(file, 'UTF-8');
        else reader.readAsArrayBuffer(file);
    };

    const handleDownloadImportTemplate = () => {
        const customersSheet = XLSX.utils.aoa_to_sheet([
            ['الاسم', 'رقم الجوال'],
            ['', ''],
            ['', ''],
            ['', ''],
        ]);
        customersSheet['!cols'] = [{ wch: 30 }, { wch: 20 }];

        const instructionsSheet = XLSX.utils.aoa_to_sheet([
            ['تعليمات استيراد العملاء'],
            ['اكتب اسم العميل ورقم جواله في ورقة العملاء.'],
            ['رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.'],
            ['يمكن أيضاً استخدام الصيغة الدولية مثل +9665XXXXXXXX.'],
            ['لا تغيّر أسماء الأعمدة ولا تضف بيانات في ورقة التعليمات.'],
        ]);
        instructionsSheet['!cols'] = [{ wch: 70 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, customersSheet, 'العملاء');
        XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'التعليمات');
        XLSX.writeFile(workbook, 'قالب-استيراد-العملاء.xlsx');
    };

    const handleExportCustomers = async () => {
        setIsExporting(true);

        try {
            const res = await API.get('/appointments/customers/export');
            const exportCustomers = res.data.customers || [];

            if (exportCustomers.length === 0) {
                alert('لا يوجد عملاء لتصديرهم.');
                return;
            }

            const customerTypeLabels = {
                New: 'جديد',
                Regular: 'منتظم',
                VIP: 'مميز',
                Blacklisted: 'محظور',
            };

            const rows = exportCustomers.map((customer) => ({
                'الاسم': customer.name || '',
                'رقم الجوال': String(customer.phone || ''),
                'المرافقون': (customer.children || []).join('، '),
                'إجمالي الزيارات': Number(customer.totalVisits || 0),
                'آخر زيارة': customer.lastVisitDate ? new Date(customer.lastVisitDate).toLocaleDateString('ar-SA') : '',
                'نوع العميل': customerTypeLabels[customer.customerType] || customer.customerType || '',
                'تاريخ الإضافة': customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('ar-SA') : '',
            }));

            const worksheet = XLSX.utils.json_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 24 },
                { wch: 18 },
                { wch: 35 },
                { wch: 16 },
                { wch: 18 },
                { wch: 16 },
                { wch: 18 },
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'العملاء');
            XLSX.writeFile(workbook, `عملاء-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (error) {
            console.error('Error exporting customers:', error);
            alert(error.response?.data?.message || 'تعذر تصدير العملاء. حاول مرة أخرى.');
        } finally {
            setIsExporting(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'لم يزر الصالون بعد';
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="space-y-6">
            <section className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-5 gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                            <Users size={18} />
                            <span className="text-xs font-black">إدارة العملاء</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800">العملاء والولاء</h2>
                        <p className="text-slate-500 font-bold text-sm mt-1">
                            سجل العملاء وتاريخ الزيارات وحالة مكافآت الولاء.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-black text-sm flex items-center justify-between sm:justify-center gap-2">
                            <span>إجمالي العملاء</span>
                            <span className="text-blue-700 text-lg">{customerCounts.all.toLocaleString('ar-SA')}</span>
                        </div>

                        <input
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current.click()}
                            disabled={isImporting}
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-lg font-black text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Upload size={16} />
                            {isImporting ? 'جاري الاستيراد...' : 'استيراد Excel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadImportTemplate}
                            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-lg font-black text-sm transition-all flex items-center justify-center gap-2"
                        >
                            <FileDown size={16} />
                            تحميل قالب الاستيراد
                        </button>
                        <button
                            type="button"
                            onClick={handleExportCustomers}
                            disabled={isExporting}
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg font-black text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Download size={16} />
                            {isExporting ? 'جاري التصدير...' : 'تصدير جميع العملاء'}
                        </button>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-5 text-xs md:text-sm font-bold text-blue-700 flex gap-3 items-start">
                    <Info size={18} className="shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                        حمّل القالب الجاهز، ثم عبّئ عمودي <strong>الاسم</strong> و <strong>رقم الجوال</strong> وارفع الملف. سيتم تجاهل الأرقام المكررة تلقائياً.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5" role="tablist" aria-label="تصفية العملاء حسب سجل الحجز">
                    {bookingFilterOptions.map((option) => {
                        const Icon = option.icon;
                        const isActive = bookingFilter === option.value;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => {
                                    setBookingFilter(option.value);
                                    setCurrentPage(1);
                                }}
                                className={`min-h-12 px-4 py-3 rounded-lg border text-sm font-black flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'}`}
                            >
                                <span className="flex items-center gap-2">
                                    <Icon size={17} />
                                    {option.label}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                    {Number(customerCounts[option.value] || 0).toLocaleString('ar-SA')}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mb-5 relative">
                    <input
                        type="text"
                        placeholder="ابحث بالاسم أو رقم الجوال..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white transition-all text-sm font-bold text-slate-700 pr-12 focus:ring-2 focus:ring-blue-50 focus:border-blue-400"
                    />
                    <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                {isLoading ? (
                    <div className="text-center py-10 text-slate-400 font-bold animate-pulse text-lg">جاري جلب سجل العملاء...</div>
                ) : customers.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
                        <Users size={42} className="text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 font-bold text-lg">لا يوجد عملاء مطابقين للبحث.</p>
                        <p className="text-slate-400 text-sm mt-2">تأكد من الرقم أو الاسم وحاول مجدداً.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto pb-4">
                        <table className="w-full text-right border-collapse min-w-[940px] text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="p-4 font-black text-slate-500 text-xs w-1/3">العميل والمرافقين</th>
                                    <th className="p-4 font-black text-slate-500 text-xs">رقم الجوال</th>
                                    <th className="p-4 font-black text-slate-500 text-xs text-center">إجمالي الزيارات</th>
                                    <th className="p-4 font-black text-slate-500 text-xs">آخر زيارة</th>
                                    <th className="p-4 font-black text-slate-500 text-xs text-center">سجل الحجز</th>
                                    <th className="p-4 font-black text-slate-500 text-xs text-center">حالة الولاء</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map((customer, index) => {
                                    const progressBase = Number(customer.totalVisits || 0) + Number(customer.remainingForFree || 0);
                                    const progress = progressBase > 0 ? Math.min((Number(customer.totalVisits || 0) / progressBase) * 100, 100) : 0;

                                    return (
                                        <tr key={`${customer.phone || customer.name}-${index}`} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-black text-slate-800 text-base">{customer.name}</div>
                                                {customer.children && customer.children.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {customer.children.filter((child) => child !== customer.name).map((child, childIndex) => (
                                                            <span key={`${child}-${childIndex}`} className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
                                                                {child}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 font-bold text-slate-600" dir="ltr">
                                                <a href={`https://wa.me/966${customer.phone.substring(1)}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-600 transition-colors flex items-center gap-2">
                                                    {customer.phone}
                                                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">واتساب</span>
                                                </a>
                                            </td>
                                            <td className="p-4 font-black text-blue-700 text-center text-lg">{customer.totalVisits}</td>
                                            <td className="p-4 font-bold text-slate-400 text-xs">{formatDate(customer.lastVisitDate)}</td>
                                            <td className="p-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border ${customer.hasBooked ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    {customer.hasBooked ? <CalendarCheck size={13} /> : <UserPlus size={13} />}
                                                    {customer.hasBooked ? 'سبق له الحجز' : 'لم يسبق له الحجز'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {customer.isEligibleForFree ? (
                                                    <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1.5 rounded-lg text-xs font-black">
                                                        <Gift size={13} />
                                                        يستحق حلاقة مجانية
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-lg text-[10px] font-bold">
                                                            باقي {customer.remainingForFree} زيارات للهدية
                                                        </span>
                                                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {!isLoading && pagination.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
                        <span className="text-xs font-bold text-slate-500">
                            عرض {customers.length.toLocaleString('ar-SA')} من أصل {pagination.total.toLocaleString('ar-SA')} عميل
                        </span>
                        <div className="flex items-center gap-2" dir="rtl">
                            <button
                                type="button"
                                title="الصفحة السابقة"
                                aria-label="الصفحة السابقة"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                                className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                <ChevronRight size={18} />
                            </button>
                            <span className="min-w-28 text-center text-sm font-black text-slate-700">
                                صفحة {currentPage.toLocaleString('ar-SA')} من {pagination.totalPages.toLocaleString('ar-SA')}
                            </span>
                            <button
                                type="button"
                                title="الصفحة التالية"
                                aria-label="الصفحة التالية"
                                disabled={currentPage >= pagination.totalPages}
                                onClick={() => setCurrentPage((page) => Math.min(page + 1, pagination.totalPages))}
                                className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                <ChevronLeft size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default CustomersTab;
