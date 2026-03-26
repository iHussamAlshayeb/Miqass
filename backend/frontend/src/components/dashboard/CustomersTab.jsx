import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import API from '../../services/api';
import * as XLSX from 'xlsx'; // 💡 استيراد مكتبة الإكسل

const CustomersTab = () => {
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isImporting, setIsImporting] = useState(false); // حالة الاستيراد

    const fileInputRef = useRef(null); // مرجع لزر رفع الملف

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            const res = await API.get('/appointments/customers');
            setCustomers(res.data.customers || []);
        } catch (error) {
            console.error("Error fetching customers:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    // 💡 دالة قراءة وإرسال ملف الإكسل
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                // 1. قراءة الملف
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                // 2. تحويله إلى JSON
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    alert("الملف فارغ!");
                    return;
                }

                // 3. الإرسال للباك إند
                const res = await API.post('/appointments/import-customers', { customers: data });

                let alertMsg = res.data.message;
                if (res.data.ignored > 0) {
                    alertMsg += `\n(تم تجاهل ${res.data.ignored} عميل لأنهم مكررين)`;
                }

                alert(alertMsg);
                fetchCustomers(); // تحديث القائمة بعد الاستيراد

            } catch (err) {
                alert("❌ حدث خطأ في قراءة الملف. تأكد من أن الملف بصيغة Excel ويحتوي على أعمدة (الاسم، رقم الجوال).");
                console.error(err);
            } finally {
                setIsImporting(false);
                e.target.value = null; // إعادة تعيين الحقل لكي يقبل نفس الملف لو تم اختياره مجدداً
            }
        };
        reader.readAsBinaryString(file);
    };

    // 💡 تنسيق التاريخ ليصبح مقروءاً
    const formatDate = (dateString) => {
        if (!dateString) return "لم يزر الصالون بعد";
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const filteredCustomers = customers.filter(c =>
        (c.name && c.name.includes(searchTerm)) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        // دعم البحث بأسماء الأطفال إذا كنت ترسلها من الباك إند
        (c.children && c.children.some(child => child.includes(searchTerm)))
    );

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-[35px] shadow-sm border border-slate-100">

                {/* الرأس (Header) */}
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4 border-b border-slate-50 pb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            👥 العملاء والولاء
                        </h2>
                        <p className="text-slate-500 font-bold text-sm mt-1">
                            سجل عملائك وتاريخ زياراتهم ونقاط ولائهم.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-black text-sm flex items-center gap-2">
                            <span>إجمالي العملاء:</span>
                            <span className="text-blue-600 text-lg">{customers.length}</span>
                        </div>

                        {/* 💡 زر الاستيراد المخفي (يُفعل عبر الـ ref) */}
                        <input
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current.click()}
                            disabled={isImporting}
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-4 py-2 rounded-xl font-black text-sm transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm"
                        >
                            {isImporting ? 'جاري الاستيراد...' : '📥 استيراد من Excel'}
                        </button>
                    </div>
                </div>

                {/* 💡 إرشادات الاستيراد */}
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl mb-6 text-xs md:text-sm font-bold text-blue-700 flex gap-3 items-start shadow-sm">
                    <span className="text-xl">💡</span>
                    <p className="leading-relaxed">
                        لاستيراد بياناتك السابقة بنجاح، تأكد أن ملف الإكسل يحتوي على عمودين على الأقل باسم: <strong>"الاسم"</strong> و <strong>"رقم الجوال"</strong> في الصف الأول. (النظام ذكي وسيتجاهل الأرقام المكررة آلياً لمنع تكرار البيانات).
                    </p>
                </div>

                {/* حقل البحث */}
                <div className="mb-6 relative">
                    <input
                        type="text"
                        placeholder="ابحث بالاسم أو رقم الجوال..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white transition-all text-sm font-bold text-slate-700 pr-12 focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': '#3b82f640' }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">🔍</span>
                </div>

                {/* الجدول */}
                {isLoading ? (
                    <div className="text-center py-10 text-slate-400 font-bold animate-pulse text-lg">جاري جلب سجل العملاء... ⏳</div>
                ) : filteredCustomers.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-100 border-dashed">
                        <span className="text-6xl block mb-4 grayscale opacity-50">📭</span>
                        <p className="text-slate-500 font-bold text-lg">لا يوجد عملاء مطابقين للبحث.</p>
                        <p className="text-slate-400 text-sm mt-2">تأكد من الرقم أو الاسم وحاول مجدداً.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto pb-4">
                        <table className="w-full text-right border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="p-4 font-black text-slate-500 text-xs rounded-r-2xl w-1/3">العميل والمرافقين</th>
                                    <th className="p-4 font-black text-slate-500 text-xs">رقم الجوال</th>
                                    <th className="p-4 font-black text-slate-500 text-xs text-center">إجمالي الزيارات</th>
                                    <th className="p-4 font-black text-slate-500 text-xs">آخر زيارة</th>
                                    <th className="p-4 font-black text-slate-500 text-xs rounded-l-2xl text-center">حالة الولاء</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map((customer, index) => (
                                    <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-black text-slate-800 text-base">{customer.name}</div>
                                            {/* 💡 عرض أسماء الأطفال كـ Tags أسفل الاسم الرئيسي */}
                                            {customer.children && customer.children.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {customer.children.filter(child => child !== customer.name).map((child, i) => (
                                                        <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
                                                            {child}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 font-bold text-slate-600 text-sm" dir="ltr">
                                            <a href={`https://wa.me/966${customer.phone.substring(1)}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500 transition-colors flex items-center gap-2">
                                                {customer.phone}
                                                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md">واتساب</span>
                                            </a>
                                        </td>
                                        <td className="p-4 font-black text-blue-600 text-center text-xl bg-blue-50/30 rounded-lg">{customer.totalVisits}</td>
                                        <td className="p-4 font-bold text-slate-400 text-xs">{formatDate(customer.lastVisitDate)}</td>
                                        <td className="p-4 text-center">
                                            {customer.isEligibleForFree ? (
                                                <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-md animate-pulse inline-block">
                                                    يستحق حلاقة مجانية 🎁
                                                </span>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-lg text-[10px] font-bold">
                                                        باقي {customer.remainingForFree} زيارات للهدية
                                                    </span>
                                                    {/* شريط تقدم بسيط */}
                                                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                                        <div
                                                            className="h-full bg-blue-500 rounded-full"
                                                            style={{ width: `${(customer.totalVisits % (customer.remainingForFree + customer.totalVisits)) / (customer.remainingForFree + customer.totalVisits) * 100 || 0}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default CustomersTab;