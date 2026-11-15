const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { buildRefundLines, refundableLines } = require("../src/services/refundService");

const id = () => new mongoose.Types.ObjectId();
// 3 × 10 مع خصم 3 (موزّع من خصم الفاتورة) = 27 شامل الضريبة
const shampoo = { _id: id(), itemType: "product", productId: id(), name: "شامبو", quantity: 3, unitPrice: 10, discountAmount: 3, vatRate: 0.15, vatAmount: 3.52, totalAmount: 27 };
const haircut = { _id: id(), itemType: "service", serviceId: id(), name: "قص شعر", quantity: 1, unitPrice: 40, discountAmount: 0, vatRate: 0.15, vatAmount: 5.22, totalAmount: 40 };
const items = [shampoo, haircut];
const sum = (lines, key) => Math.round(lines.reduce((total, line) => total + line[key], 0) * 100) / 100;

test("a partial refund takes its share of the discount and VAT, and matches price × qty − discount", () => {
  const [line] = buildRefundLines(items, [], [{ saleItemId: shampoo._id, quantity: 1 }]);
  assert.equal(line.quantity, 1);
  assert.equal(line.discountAmount, 1);
  assert.equal(line.totalAmount, 9);
  assert.ok(Math.abs(line.unitPrice * line.quantity - line.discountAmount - line.totalAmount) < 0.011, "Zakaty line check");
  assert.equal(line.vatAmount, 1.17);
});

test("refunding the rest later lands exactly on the invoice totals (no lost halalas)", () => {
  const first = buildRefundLines(items, [], [{ saleItemId: shampoo._id, quantity: 1 }]);
  const second = buildRefundLines(items, [{ items: first }], [{ saleItemId: shampoo._id, quantity: 1 }]);
  const last = buildRefundLines(items, [{ items: first }, { items: second }], [{ saleItemId: shampoo._id, quantity: 1 }]);
  const all = [...first, ...second, ...last];
  assert.equal(sum(all, "totalAmount"), 27);
  assert.equal(sum(all, "discountAmount"), 3);
  assert.equal(sum(all, "vatAmount"), 3.52);
});

test("cannot refund more than what is left, and already-refunded items show as such", () => {
  const first = buildRefundLines(items, [], [{ saleItemId: haircut._id, quantity: 1 }]);
  assert.throws(() => buildRefundLines(items, [{ items: first }], [{ saleItemId: haircut._id, quantity: 1 }]), /أكبر من المتبقي/);
  assert.throws(() => buildRefundLines(items, [], [{ saleItemId: id(), quantity: 1 }]), /غير صالحة/);
  assert.throws(() => buildRefundLines(items, [], [{ saleItemId: shampoo._id, quantity: 0 }]), /بنداً واحداً/);
  const lines = refundableLines(items, [{ items: first }]);
  assert.equal(lines.find((line) => line.name === "قص شعر").refundableQuantity, 0);
  assert.equal(lines.find((line) => line.name === "شامبو").refundableQuantity, 3);
});
