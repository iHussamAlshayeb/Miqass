const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Service = require("../src/models/Service");
const Barber = require("../src/models/Barber");
const SaleItem = require("../src/models/SaleItem");
const Appointment = require("../src/models/Appointment");
const Product = require("../src/models/Product");
const InventoryMovement = require("../src/models/InventoryMovement");
const { createService, deleteService } = require("../src/controllers/servicesController");
const { adjustProductStock, deleteProduct } = require("../src/controllers/productsController");

const id = () => new mongoose.Types.ObjectId();
const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test("service input is validated before saving", async (t) => {
  t.mock.method(Service, "exists", async () => null);
  const created = t.mock.method(Service, "create", async (doc) => ({ ...doc, _id: id() }));
  for (const [body, message] of [
    [{ name: "", price: 10, duration: 30 }, "اكتب اسم الخدمة."],
    [{ name: "قص", price: -1, duration: 30 }, "سعر الخدمة غير صالح."],
    [{ name: "قص", price: 10, duration: 7 }, "مدة الخدمة غير صالحة."],
  ]) {
    const res = response();
    await createService({ tenantId: id(), body }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, message);
  }
  const res = response();
  await createService({ tenantId: id(), body: { name: " قص ", price: "40", duration: 25 } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.mock.calls[0].arguments[0].name, "قص");
  assert.equal(created.mock.calls[0].arguments[0].category, "عام");
});

const stubService = (t, { sold, booked }) => {
  const doc = { _id: id(), isActive: true, archivedAt: null, saved: false, deleted: false };
  doc.save = async () => { doc.saved = true; };
  doc.deleteOne = async () => { doc.deleted = true; };
  t.mock.method(Service, "findOne", () => doc);
  t.mock.method(SaleItem, "exists", async () => sold);
  t.mock.method(Appointment, "exists", async () => booked);
  const pulls = t.mock.method(Barber, "updateMany", async () => ({}));
  return { doc, pulls };
};

test("an unused service is deleted and barber prices are removed", async (t) => {
  const { doc, pulls } = stubService(t, { sold: null, booked: null });
  const res = response();
  await deleteService({ tenantId: id(), params: { serviceId: String(doc._id) } }, res);
  assert.equal(res.body.archived, false);
  assert.equal(doc.deleted, true);
  assert.deepEqual(pulls.mock.calls[0].arguments[1], { $pull: { servicePrices: { serviceId: doc._id } } });
});

test("a service with history is archived instead of deleted", async (t) => {
  const { doc } = stubService(t, { sold: null, booked: { _id: id() } });
  const res = response();
  await deleteService({ tenantId: id(), params: { serviceId: String(doc._id) } }, res);
  assert.equal(res.body.archived, true);
  assert.equal(doc.deleted, false);
  assert.equal(doc.isActive, false);
  assert.ok(doc.archivedAt instanceof Date);
});

test("purchases update the weighted average cost; counts record the difference", async (t) => {
  const product = { _id: id(), stockQuantity: 10, costPrice: 20, salePrice: 45 };
  t.mock.method(Product, "findOne", () => ({ lean: async () => product }));
  const updates = t.mock.method(Product, "findOneAndUpdate", (filter, update) => ({
    lean: async () => ({ ...product, stockQuantity: product.stockQuantity + update.$inc.stockQuantity, costPrice: update.$set?.costPrice ?? product.costPrice }),
  }));
  const movements = t.mock.method(InventoryMovement, "create", async (doc) => doc);

  let res = response();
  await adjustProductStock({ tenantId: id(), params: { productId: String(product._id) }, body: { type: "purchase", quantity: 10, unitCost: 26 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updates.mock.calls[0].arguments[1].$set.costPrice, 23);
  assert.deepEqual(updates.mock.calls[0].arguments[0].stockQuantity, { $gte: -10 });

  res = response();
  await adjustProductStock({ tenantId: id(), params: { productId: String(product._id) }, body: { type: "count", countedQuantity: 7, note: "رف" } }, res);
  assert.equal(updates.mock.calls[1].arguments[1].$inc.stockQuantity, -3);
  assert.equal(movements.mock.calls[1].arguments[0].type, "adjustment");
  assert.equal(movements.mock.calls[1].arguments[0].note, "جرد: رف");

  res = response();
  await adjustProductStock({ tenantId: id(), params: { productId: String(product._id) }, body: { type: "count", countedQuantity: 10 } }, res);
  assert.equal(res.statusCode, 400);
});

test("stock never goes below zero, even under concurrent sales", async (t) => {
  const product = { _id: id(), stockQuantity: 2, costPrice: 5, salePrice: 10 };
  t.mock.method(Product, "findOne", () => ({ lean: async () => product }));
  t.mock.method(Product, "findOneAndUpdate", () => ({ lean: async () => null }));
  const res = response();
  await adjustProductStock({ tenantId: id(), params: { productId: String(product._id) }, body: { type: "adjustment", quantity: -1 } }, res);
  assert.equal(res.statusCode, 400);
});

test("a sold product is archived and frees its SKU; an unsold one is deleted with its movements", async (t) => {
  const make = () => {
    const doc = { _id: id(), sku: "A1", barcode: "99", isActive: true, deleted: false };
    doc.set = (values) => Object.assign(doc, values);
    doc.save = async () => {};
    doc.deleteOne = async () => { doc.deleted = true; };
    return doc;
  };
  let doc = make();
  t.mock.method(Product, "findOne", () => doc);
  const sold = t.mock.method(SaleItem, "exists", async () => ({ _id: id() }));
  const removed = t.mock.method(InventoryMovement, "deleteMany", async () => ({}));
  let res = response();
  await deleteProduct({ tenantId: id(), params: { productId: String(doc._id) } }, res);
  assert.equal(res.body.archived, true);
  assert.equal(doc.sku, "");
  assert.equal(doc.barcode, "");
  assert.equal(doc.isActive, false);
  assert.equal(removed.mock.callCount(), 0);

  doc = make();
  sold.mock.mockImplementation(async () => null);
  res = response();
  await deleteProduct({ tenantId: id(), params: { productId: String(doc._id) } }, res);
  assert.equal(res.body.archived, false);
  assert.equal(doc.deleted, true);
  assert.equal(removed.mock.callCount(), 1);
});
