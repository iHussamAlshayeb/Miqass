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
