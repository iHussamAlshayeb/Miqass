const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAppointmentHistoryParams } = require("../src/utils/appointmentHistory");

test("history filters stay tenant-scoped and treat search text literally", () => {
  const result = buildAppointmentHistoryParams({
    customer: "A+B", service: "[x]", barber: "Mr. X", status: "Completed",
    bookingFrom: "2026-10-04", bookingTo: "2026-10-04",
    visitFrom: "2026-10-01", visitTo: "2026-10-31",
    minPrice: "10", maxPrice: "20", sortBy: "totalPrice", direction: "asc",
  }, "salon-1");

  assert.equal(result.query.tenantId, "salon-1");
  assert.equal(result.customer.test("A+B"), true);
  assert.equal(result.customer.test("AAAB"), false);
  assert.equal(result.query["selectedServices.name"].test("[x]"), true);
  assert.equal(result.query["selectedServices.name"].test("x"), false);
  assert.equal(result.query.barberName.test("Mr. X"), true);
  assert.equal(result.query.status, "Completed");
  assert.equal(result.query.createdAt.$gte.toISOString(), "2026-10-03T21:00:00.000Z");
  assert.equal(result.query.createdAt.$lt.toISOString(), "2026-10-04T21:00:00.000Z");
  assert.deepEqual(result.query.date, { $gte: "2026-10-01", $lte: "2026-10-31" });
  assert.deepEqual(result.query.totalPrice, { $gte: 10, $lte: 20 });
  assert.deepEqual(result.sort, { totalPrice: 1, _id: 1 });
});

test("history query rejects invalid ranges and unsupported status", () => {
  assert.throws(() => buildAppointmentHistoryParams({ status: "anything" }, "salon"));
  assert.throws(() => buildAppointmentHistoryParams({ bookingFrom: "2026-10-05", bookingTo: "2026-10-04" }, "salon"));
  assert.throws(() => buildAppointmentHistoryParams({ minPrice: "30", maxPrice: "20" }, "salon"));
  assert.throws(() => buildAppointmentHistoryParams({ visitFrom: "2026-02-30" }, "salon"));
});

test("history sorting and pagination use safe defaults and limits", () => {
  const result = buildAppointmentHistoryParams({ sortBy: "$where", page: "999999", limit: "999" }, "salon");
  assert.deepEqual(result.sort, { date: -1, timeSlot: -1, _id: -1 });
  assert.equal(result.page, 100000);
  assert.equal(result.limit, 100);
});
