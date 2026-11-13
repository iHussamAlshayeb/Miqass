const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Sale = require("../src/models/Sale");
const SaleItem = require("../src/models/SaleItem");
const Payment = require("../src/models/Payment");
const Customer = require("../src/models/Customer");
const Tenant = require("../src/models/Tenant");
const Product = require("../src/models/Product");
const Service = require("../src/models/Service");
const Appointment = require("../src/models/Appointment");
const InventoryMovement = require("../src/models/InventoryMovement");
const CashShift = require("../src/models/CashShift");
const Barber = require("../src/models/Barber");
const { createSale } = require("../src/controllers/salesController");

const id = () => new mongoose.Types.ObjectId();
const query = (value) => ({
  session() { return this; },
  lean: async () => value,
});
const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

async function withSaleMocks(values, run) {
  const originals = [];
  const stub = (target, key, replacement) => {
    originals.push([target, key, target[key]]);
    target[key] = replacement;
  };
  const observed = { sale: null, items: [], payments: [], inventory: [], linked: 0 };
  try {
    stub(mongoose, "startSession", async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }));
    stub(Sale, "init", async () => Sale);
    stub(Sale, "findOne", () => query(values.existingSale || null));
    stub(Sale, "create", async ([data]) => {
      observed.sale = data;
      return [{ ...data, _id: id(), toObject() { return { ...data, _id: this._id }; } }];
    });
    stub(SaleItem, "insertMany", async (items) => { observed.items = items; return items; });
    stub(Payment, "insertMany", async (payments) => { observed.payments.push(...payments); return payments; });
    stub(Payment, "create", async (payments) => { observed.payments.push(...payments); return payments; });
    stub(Customer, "findOne", () => query(values.customer || null));
    stub(Tenant, "findByIdAndUpdate", () => query({ posInvoiceCounter: 7 }));
    stub(Product, "find", () => query(values.products || []));
    stub(Product, "findOneAndUpdate", () => query({ stockQuantity: 4 }));
    stub(Service, "find", () => query(values.services || []));
    stub(Appointment, "findOne", () => query(values.appointment || null));
    stub(Appointment, "updateOne", async () => { observed.linked++; return { modifiedCount: 1 }; });
    stub(CashShift, "findOne", () => query(values.openShift || null));
    stub(Barber, "find", () => ({ select() { return this; }, ...query(values.barbers || []) }));
    stub(InventoryMovement, "create", async (movement) => { observed.inventory.push(...movement); return movement; });
    await run(observed);
  } finally {
    for (const [target, key, original] of originals.reverse()) target[key] = original;
  }
}

test("linked checkout includes booked service, extras, and deposit once", async () => {
  const tenantId = id();
  const appointmentId = id();
  const serviceId = id();
  const productId = id();
  const customer = { _id: id(), phone: "0500000000" };
  const appointment = {
    _id: appointmentId,
    customerId: customer._id,
    childName: "عميل اختبار",
    selectedServices: [{ serviceId, name: "حلاقة", price: 20 }],
    payment: { status: "Paid", amount: 10, provider: "moyasar", providerPaymentId: "deposit-1" },
  };
  await withSaleMocks({ appointment, customer, products: [{ _id: productId, name: "منتج", salePrice: 5, costPrice: 2, stockQuantity: 10 }] }, async (observed) => {
    const res = response();
    await createSale({ tenantId, body: {
      requestId: "linked-1",
      appointmentId: String(appointmentId),
      items: [{ itemType: "product", productId: String(productId), quantity: 1 }],
      payments: [{ method: "cash", amount: 15 }],
    } }, res);
    assert.equal(res.code, 201);
    assert.equal(observed.sale.totalAmount, 25);
    assert.equal(observed.sale.paidAmount, 25);
    assert.equal(observed.sale.status, "Paid");
    assert.equal(observed.sale.source, "appointment");
    assert.deepEqual(observed.items.map((item) => item.itemType), ["service", "product"]);
    assert.deepEqual(observed.payments.map((payment) => payment.amount).sort((a, b) => a - b), [10, 15]);
    assert.equal(observed.inventory.length, 1);
    assert.equal(observed.linked, 1);
  });
});

test("direct POS sale accepts a service and a product without a booking", async () => {
  const tenantId = id();
  const serviceId = id();
  const productId = id();
  await withSaleMocks({
    services: [{ _id: serviceId, name: "حلاقة", price: 20 }],
    products: [{ _id: productId, name: "منتج", salePrice: 5, costPrice: 2, stockQuantity: 10 }],
  }, async (observed) => {
    const res = response();
    await createSale({ tenantId, body: {
      requestId: "direct-1",
      items: [
        { itemType: "service", serviceId: String(serviceId), quantity: 1 },
        { itemType: "product", productId: String(productId), quantity: 1 },
      ],
      payments: [{ method: "cash", amount: 25 }],
    } }, res);
    assert.equal(res.code, 201);
    assert.equal(observed.sale.source, "pos");
    assert.equal(observed.sale.appointmentId, null);
    assert.equal(observed.sale.totalAmount, 25);
    assert.equal(observed.items.length, 2);
    assert.equal(observed.linked, 0);
  });
});

test("checkout rejects payment above total before creating a sale", async () => {
  const tenantId = id();
  const serviceId = id();
  await withSaleMocks({ services: [{ _id: serviceId, name: "حلاقة", price: 20 }] }, async (observed) => {
    const res = response();
    await createSale({ tenantId, body: {
      requestId: "overpaid-1",
      items: [{ itemType: "service", serviceId: String(serviceId), quantity: 1 }],
      payments: [{ method: "cash", amount: 30 }],
    } }, res);
    assert.equal(res.code, 400);
    assert.equal(observed.sale, null);
    assert.equal(observed.inventory.length, 0);
  });
});

test("active barber slots and linked checkouts have unique index definitions", () => {
  const bookingIndex = Appointment.schema.indexes().find(([keys]) =>
    keys.tenantId === 1 && keys.date === 1 && keys.timeSlot === 1 && keys.barberId === 1);
  assert.equal(bookingIndex[1].unique, true);
  assert.deepEqual(bookingIndex[1].partialFilterExpression.status.$in,
    ["Pending_Payment", "Booked", "Completed", "Blocked"]);

  const checkoutIndex = Sale.schema.indexes().find(([keys]) =>
    keys.appointmentId === 1 && keys.tenantId === 1);
  assert.equal(checkoutIndex[1].unique, true);
  assert.deepEqual(checkoutIndex[1].partialFilterExpression.appointmentId, { $type: "objectId" });
});

test("POS sale uses the barber's own price and spreads the invoice discount across lines", async () => {
  const tenantId = id();
  const cut = { _id: id(), name: "قص", price: 40 };
  const beard = { _id: id(), name: "ذقن", price: 20 };
  const barber = { _id: id(), name: "أحمد", servicePrices: [{ serviceId: cut._id, price: 55 }] };
  const product = { _id: id(), name: "شمع", salePrice: 30, costPrice: 10, stockQuantity: 5 };
  const shift = { _id: id(), tenantId, status: "Open" };

  await withSaleMocks({ services: [cut, beard], products: [product], barbers: [barber], openShift: shift }, async (observed) => {
    const res = response();
    await createSale({
      tenantId,
      body: {
        requestId: "pos-discount-1",
        channel: "pos",
        items: [
          { itemType: "service", serviceId: String(cut._id), quantity: 1, barberId: String(barber._id) },
          { itemType: "service", serviceId: String(beard._id), quantity: 1, barberId: String(barber._id), discount: { type: "percent", value: 50 } },
          { itemType: "product", productId: String(product._id), quantity: 2 },
        ],
        discount: { type: "amount", value: 10 },
        payments: [{ method: "cash", amount: 115 }],
      },
    }, res);

    assert.equal(res.code, 201, res.body?.message);
    const [cutLine, beardLine, productLine] = observed.items;
    assert.equal(cutLine.unitPrice, 55);
    assert.equal(cutLine.barberName, "أحمد");
    assert.equal(beardLine.unitPrice, 20);
    assert.equal(productLine.barberId, null);

    // 55 + (20 − 10) + 60 = 125، ثم خصم الفاتورة 10 ⇒ 115
    assert.equal(observed.sale.totalAmount, 115);
    assert.equal(observed.sale.discountAmount, 20);
    assert.equal(String(observed.sale.shiftId), String(shift._id));
    assert.equal(String(observed.payments[0].shiftId), String(shift._id));

    // كل بند يحقق معادلة فاتورة Zakaty
    for (const line of observed.items) {
      assert.ok(Math.abs(line.quantity * line.unitPrice - line.discountAmount - line.totalAmount) < 0.011, line.name);
    }
    assert.equal(observed.items.reduce((sum, line) => sum + line.totalAmount, 0), 115);
  });
});

test("POS sales are refused while no shift is open", async () => {
  const tenantId = id();
  const cut = { _id: id(), name: "قص", price: 40 };
  await withSaleMocks({ services: [cut], openShift: null }, async (observed) => {
    const res = response();
    await createSale({
      tenantId,
      body: { requestId: "pos-no-shift", channel: "pos", items: [{ itemType: "service", serviceId: String(cut._id), quantity: 1 }] },
    }, res);
    assert.equal(res.code, 409);
    assert.equal(observed.sale, null);
  });
});

test("a barber that does not belong to the salon is rejected", async () => {
  const cut = { _id: id(), name: "قص", price: 40 };
  await withSaleMocks({ services: [cut], barbers: [], openShift: { _id: id() } }, async (observed) => {
    const res = response();
    await createSale({
      tenantId: id(),
      body: { requestId: "pos-foreign-barber", channel: "pos", items: [{ itemType: "service", serviceId: String(cut._id), quantity: 1, barberId: String(id()) }] },
    }, res);
    assert.equal(res.code, 400);
    assert.equal(observed.sale, null);
  });
});
