const test = require("node:test");
const assert = require("node:assert/strict");
const { discountToCents, allocateCents, priceLines } = require("../src/utils/posPricing");

test("discounts accept amounts and percentages within limits", () => {
  assert.equal(discountToCents(10000, undefined), 0);
  assert.equal(discountToCents(10000, { type: "amount", value: 12.5 }), 1250);
  assert.equal(discountToCents(10000, { type: "percent", value: 15 }), 1500);
  assert.throws(() => discountToCents(10000, { type: "percent", value: 120 }), /100%/);
  assert.throws(() => discountToCents(10000, { type: "amount", value: 101 }), /أكبر/);
  assert.throws(() => discountToCents(10000, { type: "amount", value: -1 }), /غير صالحة/);
  assert.throws(() => discountToCents(10000, { type: "bogus", value: 1 }), /غير صالحة/);
});

test("invoice discount is split exactly to the halala", () => {
  const allocation = allocateCents([3333, 3333, 3334], 1000);
  assert.equal(allocation.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(allocateCents([5000, 0], 1000), [1000, 0]);
  assert.deepEqual(allocateCents([1000], 0), [0]);
  assert.throws(() => allocateCents([1000], 2000), /أكبر/);
});

test("priced lines keep quantity × price − discount = total", () => {
  const result = priceLines(
    [
      { quantity: 3, unitPrice: 9.99, discount: { type: "percent", value: 10 } },
      { quantity: 1, unitPrice: 45 },
      { quantity: 2, unitPrice: 12.35 },
    ],
    { type: "percent", value: 7 },
  );
  for (const [i, line] of result.lines.entries()) {
    const gross = [29.97, 45, 24.7][i];
    assert.ok(Math.abs(gross - line.discountAmount - line.totalAmount) < 0.0001);
    assert.ok(line.totalAmount >= 0);
  }
  const total = result.lines.reduce((sum, line) => sum + Math.round(line.totalAmount * 100), 0);
  // (29.97 − 3.00) + 45 + 24.70 = 96.67، خصم 7% = 6.77 ⇒ 89.90
  assert.equal(total, 8990);
  assert.equal(result.saleDiscountAmount, 6.77);
});
