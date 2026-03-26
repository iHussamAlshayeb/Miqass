import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const StatisticsTab = ({ allAppointments }) => {

    // 💡 1. حساب الإحصائيات الأساسية بذكاء (useMemo) لضمان السرعة
    const stats = useMemo(() => {
        if (!allAppointments || allAppointments.length === 0) return null;

        let totalRevenue = 0;
        let completedCount = 0;
        let cancelledCount = 0;
        let barberStats = {}; // { 'كرسي 1': { revenue: 100, count: 5 }, ... }
        let cancelReasons = {}; // { 'تأخير': 3, ... }

        allAppointments.forEach(app => {
            // حساب الإيرادات والمكتملة
            if (app.status === 'Completed') {
                completedCount++;
                const price = Number(app.totalPrice) || 0;
                totalRevenue += price;

                // أداء الحلاقين
                if (!barberStats[app.chair]) barberStats[app.chair] = { revenue: 0, count: 0 };
                barberStats[app.chair].count++;
                barberStats[app.chair].revenue += price;
            }

            // حساب الإلغاء وأسبابه
            if (app.status === 'Cancelled') {
                cancelledCount++;
                const reason = app.cancelReason || 'بدون سبب مسجل';
                cancelReasons[reason] = (cancelReasons[reason] || 0) + 1;
            }
        });

        // ترتيب الحلاقين والأسباب من الأكبر للأصغر
        const sortedBarbers = Object.entries(barberStats).sort((a, b) => b[1].revenue - a[1].revenue);
        const sortedCancelReasons = Object.entries(cancelReasons).sort((a, b) => b[1] - a[1]);

        return {
            totalRevenue,
            completedCount,
            cancelledCount,
            totalBookings: allAppointments.length,
            sortedBarbers,
            sortedCancelReasons
        };

    }, [allAppointments]);

    if (!stats) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-10 rounded-[35px] shadow-sm border border-slate-100 text-center flex flex-col items-center justify-center min-h-[400px]">
                <span className="text-6xl mb-4 grayscale opacity-30">📊</span>
                <h3 className="text-xl font-black text-slate-500">لا توجد بيانات كافية لعرض الإحصائيات</h3>
                <p className="text-sm font-bold text-slate-400 mt-2">ستبدأ الأرقام بالظهور هنا بمجرد تسجيل مواعيد جديدة وإكمالها.</p>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* 1. الكروت السريعة العلوية */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-[30px] text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <p className="text-sm font-bold text-emerald-100 mb-1 relative z-10">إجمالي المبيعات المحققة</p>
                    <h3 className="text-4xl font-black relative z-10 flex items-baseline gap-2">
                        {stats.totalRevenue.toLocaleString()} <span className="text-sm font-bold text-emerald-200">ر.س</span>
                    </h3>
                </div>

                <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-400 mb-1">الخدمات المكتملة</p>
                        <h3 className="text-3xl font-black text-slate-800">{stats.completedCount} <span className="text-xs text-slate-400">طلب</span></h3>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center text-2xl">✂️</div>
                </div>

                <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-400 mb-1">المواعيد الملغية</p>
                        <h3 className="text-3xl font-black text-red-500">{stats.cancelledCount} <span className="text-xs text-slate-400">طلب</span></h3>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center text-2xl">🚫</div>
                </div>
            </div>

            {/* 2. قسم الرسوم البيانية والأداء */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* أداء الطاقم (الحلاقين) */}
                <div className="bg-white p-6 md:p-8 rounded-[35px] border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <span className="text-2xl">🏆</span> أداء الطاقم (الأعلى دخلاً)
                    </h3>

                    <div className="space-y-5">
                        {stats.sortedBarbers.length > 0 ? stats.sortedBarbers.map(([barberName, data], index) => {
                            // حساب النسبة المئوية لشريط التقدم بناءً على الأعلى دخلاً
                            const maxRevenue = stats.sortedBarbers[0][1].revenue || 1;
                            const percentage = (data.revenue / maxRevenue) * 100;

                            return (
                                <div key={barberName}>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="font-black text-slate-700 flex items-center gap-2">
                                            {index === 0 && <span className="text-amber-400">👑</span>}
                                            {barberName} <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md">{data.count} خدمة</span>
                                        </span>
                                        <span className="font-black text-emerald-600">{data.revenue} ر.س</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${percentage}%` }}
                                            transition={{ duration: 1, delay: 0.2 }}
                                            className={`h-2.5 rounded-full ${index === 0 ? 'bg-amber-400' : 'bg-blue-500'}`}
                                        ></motion.div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <p className="text-sm font-bold text-slate-400 text-center py-4">لا توجد بيانات للموظفين بعد.</p>
                        )}
                    </div>
                </div>

                {/* تحليل أسباب الإلغاء */}
                <div className="bg-white p-6 md:p-8 rounded-[35px] border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <span className="text-2xl">📉</span> تحليل أسباب الإلغاء
                    </h3>

                    <div className="space-y-4">
                        {stats.sortedCancelReasons.length > 0 ? stats.sortedCancelReasons.map(([reason, count], index) => {
                            // حساب النسبة المئوية من إجمالي الإلغاءات
                            const percentage = Math.round((count / stats.cancelledCount) * 100);

                            return (
                                <div key={reason} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-red-100 text-red-500 flex items-center justify-center font-black text-sm">
                                            {percentage}%
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-700 text-sm">{reason}</p>
                                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">تكرر {count} مرات</p>
                                        </div>
                                    </div>
                                    <div className="w-1/3 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${percentage}%` }}
                                            transition={{ duration: 1, delay: 0.4 }}
                                            className="bg-red-400 h-1.5 rounded-full"
                                        ></motion.div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-10 bg-emerald-50 rounded-2xl border border-emerald-100">
                                <span className="text-3xl mb-2 block">🎉</span>
                                <p className="text-sm font-black text-emerald-600">أداء مثالي! لا توجد مواعيد ملغية.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </motion.div>
    );
};

export default StatisticsTab;