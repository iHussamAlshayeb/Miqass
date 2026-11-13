const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const CashShift = require("../src/models/CashShift");
const Payment = require("../src/models/Payment");
const Sale = require("../src/models/Sale");
const { summarizeShift, openShift, closeShift } = require("../src/services/cashShiftService");

const id = () => new mongoose.Types.ObjectId();

const stub = async (pairs, fn) => {
  const originals = pairs.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, impl] of pairs) target[key] = impl;
  try { await fn(); } finally { for (const [target, key, original] of originals) target[key] = original; }
};

const aggregates = [
  [Payment, "aggregate", async () => [
    { _id: "cash", amount: 230, count: 4 },
    { _id: "card", amount: 180.5, count: 2 },
  ]],
  [Sale, "aggregate", async () => [
    { _id: "Paid", count: 6, total: 410.5, discount: 15, vat: 53.54 },
    { _id: "Cancelled", count: 1, total: 40, discount: 0, vat: 5.22 },
  ]],
];

test("shift summary counts collections by method and the cash expected in the drawer", async () => {
  await stub(aggregates, async () => {
    const summary = await summarizeShift({ _id: id(), tenantId: id(), openingCash: 200 });
    assert.equal(summary.salesCount, 6);
    assert.equal(summary.salesTotal, 410.5);
    assert.equal(summary.discountTotal, 15);
    assert.equal(summary.cancelledCount, 1);
    assert.equal(summary.payments.cash.amount, 230);
    assert.equal(summary.payments.card.amount, 180.5);
    assert.equal(summary.payments.transfer.amount, 0);
    assert.equal(summary.collected, 410.5);
    assert.equal(summary.expectedCash, 430);
  });
});

test("closing a shift records the counted cash and the difference", async () => {
  const tenantId = id();
  const shift = { _id: id(), tenantId, openingCash: 200, status: "Open" };
  let update;
  await stub([
    ...aggregates,
    [CashShift, "findOne", () => ({ session() { return this; }, lean: async () => shift })],
    [CashShift, "findOneAndUpdate", async (filter, change) => { update = change.$set; return { ...shift, ...change.$set }; }],
  ], async () => {
    const { shift: closed } = await closeShift(tenantId, { countedCash: "425", closedBy: "سالم" });
    assert.equal(update.status, "Closed");
    assert.equal(update.expectedCash, 430);
    assert.equal(update.countedCash, 425);
    assert.equal(update.cashDifference, -5);
    assert.equal(closed.closedBy, "سالم");
  });
});

test("only one shift can be open, and amounts are validated", async () => {
  const tenantId = id();
  await stub([[CashShift, "findOne", () => ({ session() { return this; }, lean: async () => ({ _id: id() }) })]], async () => {
    await assert.rejects(openShift(tenantId, { openingCash: 100 }), /وردية مفتوحة/);
  });
  await assert.rejects(openShift(tenantId, { openingCash: -5 }), /غير صالح/);
  await assert.rejects(openShift(tenantId, { openingCash: "" }), /غير صالح/);
});
