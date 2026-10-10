const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePeriod, buildPerformanceSummary } = require("../src/utils/performanceSummary");

test("period resolves to equal current and previous windows", () => {
  const r = resolvePeriod("7d", "2026-10-10");
  assert.deepEqual(r, { period: "7d", days: 7, from: "2026-10-04", to: "2026-10-10", prevFrom: "2026-09-27", prevTo: "2026-10-03" });
  assert.equal(resolvePeriod("bogus", "2026-10-10").period, "30d");
  assert.equal(resolvePeriod("today", "2026-03-01").prevTo, "2026-02-28");
});

test("summary separates periods and ignores blocked slots", () => {
  const range = resolvePeriod("7d", "2026-10-10");
  const s = buildPerformanceSummary([
    { date: "2026-10-10", timeSlot: "10:00", status: "Completed", totalPrice: 50, barberName: "A", selectedServices: [{ name: "قص", price: 50 }] },
    { date: "2026-10-09", timeSlot: "11:00", status: "Completed", totalPrice: 30, barberName: "B", bookingSource: "kiosk", selectedServices: [{ name: "قص", price: 30 }] },
    { date: "2026-10-08", timeSlot: "12:00", status: "Cancelled", cancelReason: "تأخر", isWalkIn: false },
    { date: "2026-10-08", timeSlot: "13:00", status: "Blocked" },
    { date: "2026-10-01", timeSlot: "10:00", status: "Completed", totalPrice: 40, barberName: "A" },
  ], range);

  assert.equal(s.current.revenue, 80);
  assert.equal(s.current.completed, 2);
  assert.equal(s.current.avgTicket, 40);
  assert.equal(s.current.cancelRate, 33.3);
  assert.equal(s.previous.revenue, 40);
  assert.equal(s.series.length, 7);
  assert.equal(s.series.at(-1).revenue, 50);
  assert.equal(s.barbers[0].name, "A");
  assert.equal(s.barbers[0].share, 62.5);
  assert.deepEqual(s.services[0], { name: "قص", count: 2, revenue: 80 });
  assert.equal(s.sources.find((x) => x.key === "kiosk").count, 1);
  assert.deepEqual(s.cancelReasons, [{ label: "تأخر", count: 1 }]);
});

test("today groups the series by hour", () => {
  const s = buildPerformanceSummary([
    { date: "2026-10-10", timeSlot: "09:30", status: "Completed", totalPrice: 20 },
    { date: "2026-10-10", timeSlot: "09:00", status: "Completed", totalPrice: 20 },
  ], resolvePeriod("today", "2026-10-10"));
  assert.equal(s.seriesUnit, "hour");
  assert.deepEqual(s.series, [{ key: "09:00", revenue: 40, completed: 2 }]);
});
