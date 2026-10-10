// ملخص لوحة الأداء: حسابات نقية بدون قاعدة بيانات حتى يسهل اختبارها
const PERIODS = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const DEFAULT_PERIOD = "30d";

const pad = (n) => String(n).padStart(2, "0");
const toDateString = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (s, n) => {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateString(d);
};

// الفترة الحالية تنتهي اليوم، والفترة السابقة بنفس الطول قبلها مباشرة
const resolvePeriod = (period, today) => {
  const key = Object.prototype.hasOwnProperty.call(PERIODS, period) ? period : DEFAULT_PERIOD;
  const days = PERIODS[key];
  const from = addDays(today, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { period: key, days, from, to: today, prevFrom, prevTo };
};

const SOURCE_LABELS = { online: "حجز إلكتروني", kiosk: "الكشك", walk_in: "حضور مباشر" };
const sourceOf = (app) => {
  if (app.isWalkIn || app.bookingSource === "kiosk_walk_in") return "walk_in";
  if (app.bookingSource === "kiosk") return "kiosk";
  return "online";
};

const emptyTotals = () => ({ revenue: 0, completed: 0, cancelled: 0, upcoming: 0, total: 0 });

const addToTotals = (totals, app) => {
  if (app.status === "Blocked" || app.status === "Pending_Payment") return;
  totals.total += 1;
  if (app.status === "Completed") {
    totals.completed += 1;
    totals.revenue += Number(app.totalPrice) || 0;
  } else if (app.status === "Cancelled") {
    totals.cancelled += 1;
  } else if (app.status === "Booked") {
    totals.upcoming += 1;
  }
};

const finishTotals = (t) => ({
  ...t,
  revenue: Math.round(t.revenue * 100) / 100,
  avgTicket: t.completed ? Math.round((t.revenue / t.completed) * 100) / 100 : 0,
  cancelRate: t.total ? Math.round((t.cancelled / t.total) * 1000) / 10 : 0,
});

const topEntries = (map, limit) =>
  Object.values(map).sort((a, b) => b.revenue - a.revenue || b.count - a.count).slice(0, limit);

const buildPerformanceSummary = (appointments, range) => {
  const current = emptyTotals();
  const previous = emptyTotals();
  const barbers = {};
  const services = {};
  const sources = { online: 0, kiosk: 0, walk_in: 0 };
  const reasons = {};

  // سلسلة الإيراد: بالساعة لليوم الواحد، وباليوم لبقية الفترات
  const byHour = range.days === 1;
  const series = {};
  if (!byHour) {
    for (let i = 0; i < range.days; i += 1) {
      const key = addDays(range.from, i);
      series[key] = { key, revenue: 0, completed: 0 };
    }
  }

  for (const app of appointments) {
    if (!app || !app.date) continue;
    if (app.date >= range.prevFrom && app.date <= range.prevTo) {
      addToTotals(previous, app);
      continue;
    }
    if (app.date < range.from || app.date > range.to) continue;

    addToTotals(current, app);
    if (app.status === "Blocked" || app.status === "Pending_Payment") continue;
    sources[sourceOf(app)] += 1;

    if (app.status === "Cancelled") {
      const reason = (app.cancelReason || "").trim() || "بدون سبب مسجل";
      reasons[reason] = reasons[reason] || { label: reason, count: 0, revenue: 0 };
      reasons[reason].count += 1;
      continue;
    }
    if (app.status !== "Completed") continue;

    const price = Number(app.totalPrice) || 0;
    const barber = app.barberName || "غير محدد";
    barbers[barber] = barbers[barber] || { name: barber, count: 0, revenue: 0 };
    barbers[barber].count += 1;
    barbers[barber].revenue += price;

    for (const svc of app.selectedServices || []) {
      const name = svc?.name || "خدمة";
      services[name] = services[name] || { name, count: 0, revenue: 0 };
      services[name].count += 1;
      services[name].revenue += Number(svc.price) || 0;
    }

    const key = byHour ? `${String(app.timeSlot || "00").slice(0, 2)}:00` : app.date;
    series[key] = series[key] || { key, revenue: 0, completed: 0 };
    series[key].revenue += price;
    series[key].completed += 1;
  }

  const cur = finishTotals(current);
  const barberList = topEntries(barbers, 20).map((b) => ({
    ...b,
    share: cur.revenue ? Math.round((b.revenue / cur.revenue) * 1000) / 10 : 0,
  }));

  return {
    range,
    current: cur,
    previous: finishTotals(previous),
    series: Object.values(series).sort((a, b) => a.key.localeCompare(b.key)),
    seriesUnit: byHour ? "hour" : "day",
    barbers: barberList,
    services: Object.values(services).sort((a, b) => b.count - a.count || b.revenue - a.revenue).slice(0, 5),
    sources: Object.entries(sources).map(([key, count]) => ({ key, label: SOURCE_LABELS[key], count })),
    cancelReasons: Object.values(reasons).sort((a, b) => b.count - a.count).slice(0, 5)
      .map(({ label, count }) => ({ label, count })),
  };
};

module.exports = { PERIODS, DEFAULT_PERIOD, resolvePeriod, buildPerformanceSummary, addDays };
