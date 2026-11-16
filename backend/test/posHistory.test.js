const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Sale = require("../src/models/Sale");
const SaleItem = require("../src/models/SaleItem");
const Payment = require("../src/models/Payment");
const CashShift = require("../src/models/CashShift");
const { listSalesHistory, listAppointmentsHistory } = require("../src/controllers/posController");

const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const chain = (rows) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => rows });

test("sales history rejects invalid or overly long periods", async () => {
  for (const query of [{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-03-05", to: "2026-03-01" }, { from: "2026-01-01", to: "2026-11-16" }]) {
    const res = response();
    await listSalesHistory({ tenantId: String(new mongoose.Types.ObjectId()), query }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
  const res = response();
  await listAppointmentsHistory({ tenantId: "t", query: { date: "2026-13-01" } }, res);
  assert.equal(res.statusCode, 400);
});

test("sales history totals match on the tenant ObjectId and search escapes regex", async (t) => {
  const tenantId = String(new mongoose.Types.ObjectId());
  const find = t.mock.method(Sale, "find", () => chain([]));
  const aggregate = t.mock.method(Sale, "aggregate", async () => [{ count: 3, total: 90, paid: 90, refunded: 10 }]);
  t.mock.method(SaleItem, "find", () => chain([]));
  t.mock.method(Payment, "find", () => chain([]));
  t.mock.method(CashShift, "find", () => chain([]));
  const res = response();
  await listSalesHistory({ tenantId, query: { from: "2026-11-10", to: "2026-11-16", q: "a(b" } }, res);
  assert.equal(res.statusCode, 200);
  const match = aggregate.mock.calls[0].arguments[0][0].$match;
  assert.ok(match.tenantId instanceof mongoose.Types.ObjectId);
  assert.equal(String(match.tenantId), tenantId);
  assert.equal(match.createdAt.$gte.toISOString(), "2026-11-09T21:00:00.000Z");
  assert.equal(find.mock.calls[0].arguments[0].$or[0]["customerSnapshot.name"].$regex, "a\\(b");
  assert.deepEqual(res.body.summary, { count: 3, total: 90, paid: 90, refunded: 10, net: 80 });
});
