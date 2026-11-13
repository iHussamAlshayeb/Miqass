const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Customer = require("../src/models/Customer");
const Appointment = require("../src/models/Appointment");
const Sale = require("../src/models/Sale");
const { searchCustomers, getCheckoutAppointment } = require("../src/controllers/posController");

const id = () => new mongoose.Types.ObjectId();
const makeRes = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const stub = (t, obj, key, fn) => { const original = obj[key]; obj[key] = fn; t.after(() => { obj[key] = original; }); };

test("customer search matches the typed start of the phone, in every common format", async (t) => {
  let filter = null;
  stub(t, Customer, "find", (query) => { filter = query; return { select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
    { _id: id(), phone: "0551234567", parentName: "عميل قيم", children: ["سعد", "فهد"], totalVisits: 7, lastVisitDate: new Date("2026-11-01"), customerType: "Regular" },
  ] }) }) }) }; });

  const res = makeRes();
  await searchCustomers({ tenantId: "t1", query: { q: "55123" } }, res);
  assert.equal(filter.tenantId, "t1", "scoped to the salon");
  assert.deepEqual(filter.$or.map((c) => c.phone.$regex), ["^55123", "^055123"]);
  assert.equal(res.body.customers[0].name, "", "placeholder name is hidden");
  assert.deepEqual(res.body.customers[0].children, ["سعد", "فهد"]);
  assert.equal(res.body.customers[0].totalVisits, 7);

  const intl = makeRes();
  await searchCustomers({ tenantId: "t1", query: { q: "+966 55" } }, intl);
  assert.deepEqual(filter.$or.map((c) => c.phone.$regex), ["^96655", "^055"]);
});

test("customer search ignores short or non-numeric input without querying", async (t) => {
  let called = false;
  stub(t, Customer, "find", () => { called = true; return {}; });
  for (const q of ["", "05", "abc", ".*"]) {
    const res = makeRes();
    await searchCustomers({ tenantId: "t1", query: { q } }, res);
    assert.deepEqual(res.body, { customers: [] });
  }
  assert.equal(called, false);
});

const stubAppointment = (t, appointment, linkedSale = null) => {
  stub(t, Appointment, "findOne", () => ({ populate: () => ({ lean: async () => appointment }) }));
  stub(t, Sale, "findOne", () => ({ select: () => ({ lean: async () => linkedSale }) }));
};

test("a completed appointment returns its booked services and paid deposit", async (t) => {
  const serviceId = id(); const barberId = id();
  stubAppointment(t, {
    _id: id(), status: "Completed", childName: "سعد", date: "2026-11-13", timeSlot: "18:00",
    barberId, barberName: "ماجد", customerId: { phone: "0551234567" },
    selectedServices: [{ serviceId, name: "قص شعر", price: 55 }], totalPrice: 55,
    payment: { status: "Paid", amount: 20 },
  });
  const res = makeRes();
  await getCheckoutAppointment({ tenantId: "t1", params: { appointmentId: String(id()) } }, res);
  assert.equal(res.statusCode, 200);
  const a = res.body.appointment;
  assert.equal(a.childName, "سعد");
  assert.equal(a.customerPhone, "0551234567");
  assert.equal(a.barberId, String(barberId));
  assert.deepEqual(a.services, [{ serviceId: String(serviceId), name: "قص شعر", price: 55 }]);
  assert.equal(a.deposit, 20);
});

test("a booked appointment can be checked out, a cancelled one cannot", async (t) => {
  stubAppointment(t, { _id: id(), status: "Booked", selectedServices: [{ serviceId: id(), name: "قص", price: 40 }] });
  const booked = makeRes();
  await getCheckoutAppointment({ tenantId: "t1", params: { appointmentId: String(id()) } }, booked);
  assert.equal(booked.statusCode, 200);
  assert.equal(booked.body.appointment.status, "Booked");

  Appointment.findOne = () => ({ populate: () => ({ lean: async () => ({ _id: id(), status: "Cancelled", selectedServices: [] }) }) });
  const cancelled = makeRes();
  await getCheckoutAppointment({ tenantId: "t1", params: { appointmentId: String(id()) } }, cancelled);
  assert.equal(cancelled.statusCode, 409);
  assert.equal(cancelled.body.code, "NOT_CHECKOUTABLE");
});

test("today's appointments list covers booked, completed and cancelled, with paid status", async (t) => {
  const { listTodayAppointments } = require("../src/controllers/posController");
  let filter = null;
  const saleId = id();
  stub(t, Appointment, "find", (query) => { filter = query; return { populate: () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
    { _id: id(), childName: "سعد", timeSlot: "18:00", barberName: "ماجد", status: "Completed", customerId: { phone: "0551234567" },
      selectedServices: [{ name: "قص شعر" }, { name: "حلاقة ذقن" }], totalPrice: 75, payment: { status: "Paid", amount: 20 }, saleId },
    { _id: id(), childName: "زائر", timeSlot: "18:30", barberName: "محمود", status: "Completed", bookingSource: "kiosk_walk_in", selectedServices: [], totalPrice: 0 },
  ] }) }) }) }) }; });
  const res = makeRes();
  await listTodayAppointments({ tenantId: "t1" }, res);
  assert.equal(filter.tenantId, "t1");
  assert.deepEqual(filter.status.$in, ["Booked", "Completed", "Cancelled"]);
  assert.match(filter.date, /^\d{4}-\d{2}-\d{2}$/);
  const [paid, walkIn] = res.body.appointments;
  assert.equal(paid.servicesLabel, "قص شعر، حلاقة ذقن");
  assert.equal(paid.isPaid, true);
  assert.equal(String(paid.saleId), String(saleId));
  assert.equal(paid.deposit, 20);
  assert.equal(walkIn.isWalkIn, true);
  assert.equal(walkIn.canRequestReview, true, "walk-in without a review request yet");
});

test("an appointment that already has a sale is refused with the sale id", async (t) => {
  const saleId = id();
  stubAppointment(t, { _id: id(), status: "Completed", selectedServices: [] }, { _id: saleId });
  const res = makeRes();
  await getCheckoutAppointment({ tenantId: "t1", params: { appointmentId: String(id()) } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "ALREADY_CHECKED_OUT");
  assert.equal(String(res.body.saleId), String(saleId));
});

test("an appointment without listed services but with a price becomes one haircut line", async (t) => {
  stubAppointment(t, { _id: id(), status: "Completed", selectedServices: [], totalPrice: 45, customerId: null });
  const res = makeRes();
  await getCheckoutAppointment({ tenantId: "t1", params: { appointmentId: String(id()) } }, res);
  assert.deepEqual(res.body.appointment.services, [{ serviceId: "", name: "خدمة حلاقة", price: 45 }]);
});
