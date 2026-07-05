import React, { useMemo } from 'react';
import {
    Ban,
    BarChart3,
    CheckCircle2,
    Scissors,
    TrendingDown,
    Trophy,
} from 'lucide-react';

const formatMoney = (value) => Number(value || 0).toLocaleString();

const StatCard = ({ label, value, suffix, icon: Icon, tone = 'slate' }) => {
    const toneClasses = {
        slate: 'bg-slate-50 text-slate-700 border-slate-200',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        red: 'bg-red-50 text-red-700 border-red-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-black text-slate-500">{label}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-950">{value}</span>
                        {suffix && <span className="text-xs font-black text-slate-500">{suffix}</span>}
                    </div>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClasses[tone]}`}>
                    {React.createElement(Icon, { size: 18 })}
                </div>
            </div>
        </div>
    );
};

const StatisticsTab = ({ allAppointments }) => {
    const stats = useMemo(() => {
        if (!allAppointments || allAppointments.length === 0) return null;

        let totalRevenue = 0;
        let completedCount = 0;
        let cancelledCount = 0;
        const barberStats = {};
        const cancelReasons = {};

        allAppointments.forEach((app) => {
            if (app.status === 'Completed') {
                completedCount++;
                const price = Number(app.totalPrice) || 0;
                totalRevenue += price;

                const chair = app.chair || app.barberName || 'غير محدد';
                if (!barberStats[chair]) barberStats[chair] = { revenue: 0, count: 0 };
                barberStats[chair].count++;
                barberStats[chair].revenue += price;
            }

            if (app.status === 'Cancelled') {
                cancelledCount++;
                const reason = app.cancelReason || 'بدون سبب مسجل';
                cancelReasons[reason] = (cancelReasons[reason] || 0) + 1;
            }
        });

        return {
            totalRevenue,
            completedCount,
            cancelledCount,
            totalBookings: allAppointments.length,
            sortedBarbers: Object.entries(barberStats).sort((a, b) => b[1].revenue - a[1].revenue),
            sortedCancelReasons: Object.entries(cancelReasons).sort((a, b) => b[1] - a[1]),
        };
    }, [allAppointments]);

    if (!stats) {
        return (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <BarChart3 size={22} />
                </div>
                <h3 className="text-lg font-black text-slate-700">لا توجد بيانات كافية</h3>
                <p className="mt-2 max-w-md text-sm font-bold text-slate-500">
                    ستظهر مؤشرات الأداء بعد تسجيل الحجوزات وإكمال الخدمات.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <StatCard
                    label="إجمالي المبيعات المحققة"
                    value={formatMoney(stats.totalRevenue)}
                    suffix="ر.س"
                    icon={BarChart3}
                    tone="emerald"
                />
                <StatCard
                    label="الخدمات المكتملة"
                    value={stats.completedCount}
                    suffix="طلب"
                    icon={Scissors}
                    tone="blue"
                />
                <StatCard
                    label="المواعيد الملغية"
                    value={stats.cancelledCount}
                    suffix="طلب"
                    icon={Ban}
                    tone="red"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Trophy size={18} className="text-slate-500" />
                            <h3 className="font-black text-slate-900">أداء الطاقم</h3>
                        </div>
                        <span className="text-xs font-black text-slate-500">حسب الإيراد</span>
                    </div>

                    <div className="space-y-4 p-4">
                        {stats.sortedBarbers.length > 0 ? stats.sortedBarbers.map(([barberName, data], index) => {
                            const maxRevenue = stats.sortedBarbers[0][1].revenue || 1;
                            const percentage = Math.round((data.revenue / maxRevenue) * 100);

                            return (
                                <div key={barberName} className="space-y-2">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-black text-slate-800">{barberName}</p>
                                                <p className="text-xs font-bold text-slate-500">{data.count} خدمة مكتملة</p>
                                            </div>
                                        </div>
                                        <span className="shrink-0 font-black text-slate-900">{formatMoney(data.revenue)} ر.س</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className="h-full rounded-full bg-slate-900"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                                <CheckCircle2 size={18} />
                                لا توجد بيانات أداء للطاقم بعد.
                            </div>
                        )}
                    </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <TrendingDown size={18} className="text-slate-500" />
                            <h3 className="font-black text-slate-900">أسباب الإلغاء</h3>
                        </div>
                        <span className="text-xs font-black text-slate-500">{stats.cancelledCount} عملية</span>
                    </div>

                    <div className="space-y-3 p-4">
                        {stats.sortedCancelReasons.length > 0 ? stats.sortedCancelReasons.map(([reason, count]) => {
                            const percentage = stats.cancelledCount ? Math.round((count / stats.cancelledCount) * 100) : 0;

                            return (
                                <div key={reason} className="rounded-lg border border-slate-200 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-slate-800">{reason}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">تكرر {count} مرات</p>
                                        </div>
                                        <span className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs font-black text-red-700">
                                            {percentage}%
                                        </span>
                                    </div>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-red-500" style={{ width: `${percentage}%` }} />
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                                <CheckCircle2 size={18} />
                                لا توجد مواعيد ملغية.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default StatisticsTab;
