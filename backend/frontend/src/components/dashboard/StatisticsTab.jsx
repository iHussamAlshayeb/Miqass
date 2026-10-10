import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus, RefreshCw } from 'lucide-react';
import API from '../../services/api';

const PERIODS = [
    { key: 'today', label: 'اليوم' },
    { key: '7d', label: '7 أيام' },
    { key: '30d', label: '30 يوم' },
    { key: '90d', label: '90 يوم' },
];

const PREVIOUS_LABEL = { today: 'أمس', '7d': 'الأيام السبعة السابقة', '30d': 'الثلاثين يومًا السابقة', '90d': 'التسعين يومًا السابقة' };
const SOURCE_COLORS = { online: 'bg-slate-900', kiosk: 'bg-slate-500', walk_in: 'bg-slate-300' };

const formatNumber = (value, digits = 0) =>
    Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const formatShortDate = (key) => {
    const [, month, day] = String(key).split('-');
    return day ? `${Number(day)}/${Number(month)}` : key;
};

// نسبة التغير عن الفترة السابقة؛ لا تُعرض إذا لم تكن هناك بيانات سابقة
const changeOf = (current, previous) => {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
};

const Delta = ({ change, invert = false, previousText }) => {
    if (change === null) {
        return <p className="mt-3 text-xs font-bold text-slate-400">لا توجد بيانات للمقارنة</p>;
    }
    const flat = Math.abs(change) < 0.5;
    const good = invert ? change < 0 : change > 0;
    const tone = flat ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-600';
    const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
    return (
        <p className={`mt-3 flex items-center gap-1 text-xs font-bold ${tone}`} title={previousText}>
            <Icon size={14} />
            <span>{flat ? 'بدون تغيير' : `${formatNumber(Math.abs(change), 1)}%`}</span>
            <span className="font-medium text-slate-400">عن {previousText}</span>
        </p>
    );
};

const Kpi = ({ label, value, unit, change, invert, previousText }) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black tabular-nums text-slate-950">{value}</span>
            {unit && <span className="text-sm font-bold text-slate-400">{unit}</span>}
        </p>
        <Delta change={change} invert={invert} previousText={previousText} />
    </div>
);

const Panel = ({ title, aside, children, className = '' }) => (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="font-black text-slate-900">{title}</h3>
            {aside && <span className="text-xs font-bold text-slate-500">{aside}</span>}
        </div>
        <div className="p-4">{children}</div>
    </section>
);

const EmptyLine = ({ children }) => (
    <p className="py-6 text-center text-sm font-bold text-slate-400">{children}</p>
);

const RevenueChart = ({ series, unit }) => {
    const [active, setActive] = useState(null);
    const max = Math.max(...series.map((point) => point.revenue), 0);
    if (!series.length || max === 0) return <EmptyLine>لا يوجد إيراد مسجل في هذه الفترة.</EmptyLine>;

    const labelEvery = series.length > 45 ? 15 : series.length > 14 ? 5 : 1;
    const best = series.reduce((top, point) => (point.revenue > top.revenue ? point : top), series[0]);
    const shown = active ?? best;
    const labelFor = (key) => (unit === 'hour' ? key : formatShortDate(key));

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold text-slate-500">
                    {active ? labelFor(shown.key) : unit === 'hour' ? 'أعلى ساعة' : 'أعلى يوم'}
                    {!active && ` (${labelFor(shown.key)})`}:
                </span>
                <span className="font-black tabular-nums text-slate-900">{formatNumber(shown.revenue)} ر.س</span>
                <span className="font-bold text-slate-400">· {shown.completed} خدمة</span>
            </div>
            <div className="flex h-44 items-end gap-[2px]" dir="ltr" onMouseLeave={() => setActive(null)}>
                {series.map((point) => (
                    <button
                        type="button"
                        key={point.key}
                        onMouseEnter={() => setActive(point)}
                        onFocus={() => setActive(point)}
                        onBlur={() => setActive(null)}
                        aria-label={`${labelFor(point.key)}: ${formatNumber(point.revenue)} ريال`}
                        className="group flex h-full min-w-0 flex-1 items-end"
                    >
                        <span
                            className={`block w-full rounded-t-sm transition-colors ${
                                shown.key === point.key ? 'bg-slate-900' : 'bg-slate-300 group-hover:bg-slate-500'
                            }`}
                            style={{ height: point.revenue ? `${Math.max((point.revenue / max) * 100, 2)}%` : '2px' }}
                        />
                    </button>
                ))}
            </div>
            <div className="mt-2 flex gap-[2px] text-[11px] font-bold text-slate-400" dir="ltr">
                {series.map((point, index) => (
                    <span key={point.key} className="min-w-0 flex-1 text-center">
                        {index % labelEvery === 0 ? labelFor(point.key) : ''}
                    </span>
                ))}
            </div>
        </div>
    );
};

const RankedList = ({ items, valueOf, labelOf, metaOf }) => {
    const max = Math.max(...items.map(valueOf), 1);
    return (
        <ul className="space-y-3">
            {items.map((item) => (
                <li key={labelOf(item)}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-bold text-slate-800">{labelOf(item)}</span>
                        <span className="shrink-0 font-black tabular-nums text-slate-900">{metaOf(item)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-400" style={{ width: `${(valueOf(item) / max) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
};

const StatisticsTab = () => {
    const [period, setPeriod] = useState('30d');
    const [reloadCount, setReloadCount] = useState(0);
    const [result, setResult] = useState({ key: null, data: null, error: false });
    const requestKey = `${period}:${reloadCount}`;
    const isLoading = result.key !== requestKey;

    useEffect(() => {
        let cancelled = false;
        API.get(`/appointments/performance?period=${period}`)
            .then((res) => !cancelled && setResult({ key: requestKey, data: res.data, error: false }))
            .catch(() => !cancelled && setResult((prev) => ({ key: requestKey, data: prev.data, error: true })));
        return () => { cancelled = true; };
    }, [period, requestKey]);

    const data = result.data;
    const current = data?.current;
    const previous = data?.previous;
    const previousText = PREVIOUS_LABEL[data?.range?.period || period];
    const sourcesTotal = data?.sources?.reduce((sum, item) => sum + item.count, 0) || 0;
    const hasActivity = current && current.total > 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    {PERIODS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setPeriod(item.key)}
                            className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
                                period === item.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                    {data?.range && (
                        <span dir="ltr">
                            {data.range.from === data.range.to ? data.range.to : `${data.range.from} → ${data.range.to}`}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setReloadCount((n) => n + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        aria-label="تحديث"
                    >
                        <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {result.error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    تعذر تحميل المؤشرات. حاول التحديث.
                </p>
            )}

            {!data && isLoading && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-100" />)}
                </div>
            )}

            {data && (
                <div className={`space-y-4 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Kpi label="الإيراد" value={formatNumber(current.revenue)} unit="ر.س"
                            change={changeOf(current.revenue, previous.revenue)} previousText={previousText} />
                        <Kpi label="الخدمات المكتملة" value={formatNumber(current.completed)}
                            change={changeOf(current.completed, previous.completed)} previousText={previousText} />
                        <Kpi label="متوسط الفاتورة" value={formatNumber(current.avgTicket, 1)} unit="ر.س"
                            change={changeOf(current.avgTicket, previous.avgTicket)} previousText={previousText} />
                        <Kpi label="نسبة الإلغاء" value={`${formatNumber(current.cancelRate, 1)}%`}
                            change={previous.total ? Math.round((current.cancelRate - previous.cancelRate) * 10) / 10 : null}
                            invert previousText={previousText} />
                    </div>

                    {!hasActivity ? (
                        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                            <BarChart3 size={22} className="mb-3 text-slate-400" />
                            <h3 className="font-black text-slate-700">لا توجد حجوزات في هذه الفترة</h3>
                            <p className="mt-1 text-sm font-bold text-slate-500">اختر فترة أطول أو انتظر تسجيل حجوزات جديدة.</p>
                        </div>
                    ) : (
                        <>
                            <Panel
                                title={data.seriesUnit === 'hour' ? 'الإيراد حسب الساعة' : 'الإيراد اليومي'}
                                aside={current.upcoming ? `${current.upcoming} موعد لم يكتمل بعد` : null}
                            >
                                <RevenueChart series={data.series} unit={data.seriesUnit} />
                            </Panel>

                            <Panel title="أداء الحلاقين" aside="مرتب حسب الإيراد">
                                {data.barbers.length ? (
                                    <div className="-mx-4">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-right text-xs font-bold text-slate-400">
                                                    <th className="px-4 pb-2 font-bold">الحلاق</th>
                                                    <th className="px-4 pb-2 font-bold">الخدمات</th>
                                                    <th className="px-4 pb-2 font-bold">الإيراد</th>
                                                    <th className="px-4 pb-2 font-bold sm:w-2/5">الحصة</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {data.barbers.map((barber) => (
                                                    <tr key={barber.name}>
                                                        <td className="px-4 py-3 font-bold text-slate-800">{barber.name}</td>
                                                        <td className="px-4 py-3 tabular-nums text-slate-600">{formatNumber(barber.count)}</td>
                                                        <td className="whitespace-nowrap px-4 py-3 font-black tabular-nums text-slate-900">{formatNumber(barber.revenue)} ر.س</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="hidden h-2 flex-1 rounded-full bg-slate-100 sm:block">
                                                                    <div className="h-full rounded-full bg-slate-900" style={{ width: `${barber.share}%` }} />
                                                                </div>
                                                                <span className="w-12 shrink-0 text-left text-xs font-bold tabular-nums text-slate-500">
                                                                    {formatNumber(barber.share, 1)}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyLine>لا توجد خدمات مكتملة في هذه الفترة.</EmptyLine>
                                )}
                            </Panel>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                <Panel title="الخدمات الأكثر طلبًا">
                                    {data.services.length ? (
                                        <RankedList
                                            items={data.services}
                                            valueOf={(s) => s.count}
                                            labelOf={(s) => s.name}
                                            metaOf={(s) => `${formatNumber(s.count)} مرة`}
                                        />
                                    ) : <EmptyLine>لا توجد خدمات مكتملة.</EmptyLine>}
                                </Panel>

                                <Panel title="مصدر الحجوزات" aside={`${formatNumber(sourcesTotal)} حجز`}>
                                    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                                        {data.sources.filter((s) => s.count).map((s) => (
                                            <div key={s.key} className={SOURCE_COLORS[s.key]} style={{ width: `${(s.count / (sourcesTotal || 1)) * 100}%` }} />
                                        ))}
                                    </div>
                                    <ul className="mt-4 space-y-2.5 text-sm">
                                        {data.sources.map((s) => (
                                            <li key={s.key} className="flex items-center justify-between gap-3">
                                                <span className="flex items-center gap-2 font-bold text-slate-700">
                                                    <span className={`h-2.5 w-2.5 rounded-sm ${SOURCE_COLORS[s.key]}`} />
                                                    {s.label}
                                                </span>
                                                <span className="flex items-baseline gap-2 tabular-nums">
                                                    <span className="font-black text-slate-900">{formatNumber(s.count)}</span>
                                                    <span className="w-9 text-left text-xs font-bold text-slate-400">
                                                        {sourcesTotal ? `${Math.round((s.count / sourcesTotal) * 100)}%` : '0%'}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </Panel>

                                <Panel title="أسباب الإلغاء" aside={`${formatNumber(current.cancelled)} إلغاء`}>
                                    {data.cancelReasons.length ? (
                                        <RankedList
                                            items={data.cancelReasons}
                                            valueOf={(r) => r.count}
                                            labelOf={(r) => r.label}
                                            metaOf={(r) => formatNumber(r.count)}
                                        />
                                    ) : <EmptyLine>لا توجد مواعيد ملغية في هذه الفترة.</EmptyLine>}
                                </Panel>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default StatisticsTab;
