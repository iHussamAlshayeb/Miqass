import React, { useEffect, useRef, useState } from 'react';
import { Download, Gift, Info, Search, Upload, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import API from '../../services/api';

const CustomersTab = () => {
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const fileInputRef = useRef(null);

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            const res = await API.get('/appointments/customers');
            setCustomers(res.data.customers || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (readerEvent) => {
            try {
                const workbook = XLSX.read(readerEvent.target.result, { type: 'binary' });
                const worksheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[worksheetName];
                const data = XLSX.utils.sheet_to_json(worksheet);

                if (data.length === 0) {
                    alert('الملف فارغ.');
                    return;
                }

                const res = await API.post('/appointments/import-customers', { customers: data });
                let alertMsg = res.data.message;
                if (res.data.ignored > 0) {
                    alertMsg += `\nتم تجاهل ${res.data.ignored} عميل لأنهم مكررين.`;
                }

                alert(alertMsg);
                fetchCustomers();
            } catch (error) {
                alert('حدث خطأ في قراءة الملف. تأكد من أن الملف بصيغة Excel ويحتوي على أعمدة الاسم ورقم الجوال.');
                console.error(error);
            } finally {
                setIsImporting(false);
                event.target.value = null;
            }
        };

        reader.readAsBinaryString(file);
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

    const filteredCustomers = customers.filter((customer) =>
        (customer.name && customer.name.includes(searchTerm)) ||
        (customer.phone && customer.phone.includes(searchTerm)) ||
        (customer.children && customer.children.some((child) => child.includes(searchTerm)))
    );

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
                            <span className="text-blue-700 text-lg">{customers.length}</span>
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
                        للاستيراد، يجب أن يحتوي ملف الإكسل على عمودين على الأقل باسم: <strong>الاسم</strong> و <strong>رقم الجوال</strong>. سيتم تجاهل الأرقام المكررة تلقائياً.
                    </p>
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
                ) : filteredCustomers.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
                        <Users size={42} className="text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 font-bold text-lg">لا يوجد عملاء مطابقين للبحث.</p>
                        <p className="text-slate-400 text-sm mt-2">تأكد من الرقم أو الاسم وحاول مجدداً.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto pb-4">
                        <table className="w-full text-right border-collapse min-w-[820px] text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="p-4 font-black text-slate-500 text-xs w-1/3">العميل والمرافقين</th>
                                    <th className="p-4 font-black text-slate-500 text-xs">رقم الجوال</th>
                                    <th className="p-4 font-black text-slate-500 text-xs text-center">إجمالي الزيارات</th>
                                    <th className="p-4 font-black text-slate-500 text-xs">آخر زيارة</th>
                                    <th className="p-4 font-black text-slate-500 text-xs text-center">حالة الولاء</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map((customer, index) => {
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
            </section>
        </div>
    );
};

export default CustomersTab;
