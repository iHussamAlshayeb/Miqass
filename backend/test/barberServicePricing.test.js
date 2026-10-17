const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Tenant = require("../src/models/Tenant");
const Service = require("../src/models/Service");
const Barber = require("../src/models/Barber");
const { normalizeServicePrices, applyBarberServicePrices } = require("../src/utils/servicePricing");
const { updateBarberSettings } = require("../src/controllers/dashboard/settingsController");

const id = () => new mongoose.Types.ObjectId();

test("barber prices override the base price only for the services they name", () => {
  const cut = id(); const beard = id();
  const result = applyBarberServicePrices(
    [{ serviceId: cut, name: "قص", price: 40, duration: 30 }, { serviceId: beard, name: "ذقن", price: 20, duration: 15 }],
    { servicePrices: [{ serviceId: cut, price: 55 }] },
  );
  assert.equal(result[0].price, 55);
  assert.equal(result[1].price, 20);
  assert.equal(applyBarberServicePrices([{ serviceId: cut, price: 40 }], null)[0].price, 40);
});

test("price input is cleaned: blanks, invalid and unknown services are dropped", () => {
  const known = String(id());
  const prices = normalizeServicePrices(
    [
      { serviceId: known, price: "35.5" },
      { serviceId: known, price: "" },          // فارغ = سعر أساسي، والأخير لا يلغي الأول
      { serviceId: String(id()), price: 10 },   // خدمة غير موجودة
      { serviceId: known, price: -5 },
      { serviceId: known, price: "abc" },
    ],
    (key) => (key === known ? known : null),
  );
  assert.deepEqual(prices, [{ serviceId: known, price: 35.5 }]);
});

// يحاكي قاعدة البيانات لاختبار حفظ الإعدادات كما يحدث فعلاً
const stubDatabase = (t, { existingServiceIds, existingBarberIds }) => {
  const calls = { serviceUpdates: [], serviceCreates: [], serviceDeletes: [], barberUpdates: [], barberCreates: [] };
  const created = [];
  const originals = {
    tenantFindById: Tenant.findById, serviceFind: Service.find, serviceUpdateOne: Service.updateOne,
    serviceCreate: Service.create, serviceDeleteMany: Service.deleteMany, barberFind: Barber.find,
    barberDeleteMany: Barber.deleteMany, barberUpdateOne: Barber.updateOne, barberCreate: Barber.create,
  };
  const tenantId = id();
  Tenant.findById = () => ({ select: async () => ({
    _id: tenantId, subscription: { plan: "Pro" }, settings: {}, branding: {}, taxSettings: {}, paymentSettings: {},
    save: async () => {},
  }) });
  Service.find = () => ({ select: () => ({ lean: async () => [...existingServiceIds, ...created].map((_id) => ({ _id })) }) });
  Service.updateOne = async (filter, update) => { calls.serviceUpdates.push({ filter, update }); };
  Service.create = async (doc) => { const _id = id(); created.push(_id); calls.serviceCreates.push(doc); return { _id }; };
  Service.deleteMany = async (filter) => { calls.serviceDeletes.push(filter); };
  Barber.find = () => ({ select: () => ({ lean: async () => existingBarberIds.map((_id) => ({ _id })) }) });
  Barber.deleteMany = async () => {};
  Barber.updateOne = async (filter, update) => { calls.barberUpdates.push({ filter, update }); };
  Barber.create = async (doc) => { calls.barberCreates.push(doc); };
  t.after(() => {
    Tenant.findById = originals.tenantFindById; Service.find = originals.serviceFind;
    Service.updateOne = originals.serviceUpdateOne; Service.create = originals.serviceCreate;
    Service.deleteMany = originals.serviceDeleteMany; Barber.find = originals.barberFind;
    Barber.deleteMany = originals.barberDeleteMany; Barber.updateOne = originals.barberUpdateOne;
    Barber.create = originals.barberCreate;
  });
  return { calls, created };
};

const run = async (body) => {
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(b) { this.body = b; return this; } };
  await updateBarberSettings({ tenantId: "t", body }, res);
  return res;
};

test("saving keeps service IDs and links barber prices to new services", async (t) => {
  const cutId = id(); const barberId = id();
  const { calls, created } = stubDatabase(t, { existingServiceIds: [cutId], existingBarberIds: [barberId] });

  const res = await run({
    services: [
      { _id: String(cutId), name: "قص", price: 40, duration: 30 },
      { id: "1739999", name: "صبغة", price: 80, duration: 45 },
    ],
    barbers: [{
      _id: String(barberId), name: "ماجد",
      servicePrices: [{ serviceId: String(cutId), price: "50" }, { serviceId: "1739999", price: 95 }],
    }],
  });

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(String(calls.serviceUpdates[0].filter._id), String(cutId), "existing service updated in place");
  assert.equal(calls.serviceCreates.length, 1, "only the new service is created");
  assert.deepEqual(calls.serviceDeletes[0]._id.$nin.map(String), [String(cutId), String(created[0])]);
  const saved = calls.barberUpdates[0].update.$set.servicePrices;
  assert.deepEqual(saved, [
    { serviceId: String(cutId), price: 50 },
    { serviceId: String(created[0]), price: 95 },
  ]);
});

test("barbers saved without servicePrices keep their existing prices", async (t) => {
  const barberId = id();
  const { calls } = stubDatabase(t, { existingServiceIds: [], existingBarberIds: [barberId] });
  const res = await run({ barbers: [{ _id: String(barberId), name: "سالم" }] });
  assert.equal(res.statusCode, 200);
  assert.equal("servicePrices" in calls.barberUpdates[0].update.$set, false);
});

test("incomplete services are rejected before anything is saved", async (t) => {
  const { calls } = stubDatabase(t, { existingServiceIds: [], existingBarberIds: [] });
  const res = await run({ services: [{ name: "", price: 10, duration: 30 }] });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.serviceCreates.length + calls.serviceUpdates.length, 0);
});

test("a booking is priced with the chosen barber's price", async (t) => {
  const Appointment = require("../src/models/Appointment");
  const Customer = require("../src/models/Customer");
  const { createAppointment } = require("../src/controllers/booking/publicBookingController");
  const tenantId = id(); const cutId = id(); const beardId = id();
  const saved = [];
  const restore = [];
  const stub = (obj, key, fn) => { const original = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = original; }); };
  t.after(() => restore.reverse().forEach((undo) => undo()));

  stub(Appointment, "init", async () => {});
  stub(Tenant, "findById", () => ({ select: () => ({ lean: async () => ({
    _id: tenantId, subscription: { plan: "Pro", status: "Active" },
    settings: { startTime: "10:00", endTime: "23:00", slotDuration: 30 }, paymentSettings: {},
  }) }) }));
  stub(Customer, "findOne", async () => ({ _id: id(), children: ["سعد"] }));
  stub(Barber, "findOne", () => ({ select: async () => ({
    _id: id(), name: "ماجد", leaves: [], servicePrices: [{ serviceId: cutId, price: 60 }],
  }) }));
  stub(Service, "find", () => ({ select: () => ({ lean: async () => [
    { _id: cutId, name: "قص", price: 40, duration: 30 },
    { _id: beardId, name: "ذقن", price: 20, duration: 30 },
  ] }) }));
  stub(Appointment, "find", () => ({ lean: async () => [] }));
  stub(Tenant, "findByIdAndUpdate", () => ({ select: () => ({ lean: async () => ({ _id: tenantId, invoiceCounter: 5, settings: {}, paymentSettings: {} }) }), lean: async () => ({ _id: tenantId, invoiceCounter: 5, settings: {}, paymentSettings: {} }) }));
  stub(mongoose, "startSession", async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }));
  stub(Appointment, "insertMany", async (docs) => { saved.push(...docs); throw new Error("stop-after-capture"); });

  const res = { status() { return this; }, json() { return this; } };
  const errorLog = console.error; console.error = () => {};
  try {
    await createAppointment({ headers: {}, body: {
      tenantId: String(tenantId), date: "2099-01-05", timeSlot: "18:00", customerPhone: "0555555555",
      childrenNames: ["سعد"], chair: "ماجد", selectedServices: [String(cutId), String(beardId)], bookingSource: "public",
    } }, res);
  } finally { console.error = errorLog; }

  assert.equal(saved.length, 1, "appointment reached the save step");
  assert.equal(saved[0].totalPrice, 80, "60 for the barber's cut + 20 base beard");
  assert.deepEqual(saved[0].selectedServices.map((s) => s.price), [60, 20]);
});
