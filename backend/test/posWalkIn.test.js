const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Appointment = require("../src/models/Appointment");
const Tenant = require("../src/models/Tenant");
const Customer = require("../src/models/Customer");
const Barber = require("../src/models/Barber");
const Service = require("../src/models/Service");
const onesignal = require("../src/utils/onesignal");
onesignal.sendAdminNotification = async () => {};
const { createWalkInFromPos } = require("../src/controllers/posController");

const id = () => new mongoose.Types.ObjectId();
const lean = (value) => ({ select() { return this; }, lean: async () => value });
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const beard = { _id: id(), name: "حلاقة ذقن", price: 20, duration: 15 };
const barber = { _id: id(), name: "ماجد", leaves: [], servicePrices: [{ serviceId: beard._id, price: 25 }] };

const setup = (t, { plan = "Pro", status = "Active", existingCustomer = null } = {}) => {
  const created = [];
  t.mock.method(Tenant, "findById", () => lean({ _id: id(), subscription: { plan, status } }));
  t.mock.method(Tenant, "findByIdAndUpdate", () => ({ lean: async () => ({ invoiceCounter: 41 }) }));
  t.mock.method(Barber, "findOne", () => lean(barber));
  t.mock.method(Service, "find", () => lean([beard]));
  t.mock.method(Customer, "findOne", async () => existingCustomer);
  t.mock.method(Customer, "create", async (doc) => ({ _id: id(), ...doc }));
  t.mock.method(Customer, "updateOne", async () => ({}));
  t.mock.method(Appointment, "countDocuments", async () => 10);
  t.mock.method(Appointment, "create", async (doc) => { created.push(doc); return { _id: id(), ...doc }; });
  return created;
};
const call = async (body) => {
  const res = makeRes();
  await createWalkInFromPos({ body, tenantId: id() }, res);
  return res;
};

test("a walk-in from the POS joins the barber's queue now, like the kiosk, with barber prices", async (t) => {
  const created = setup(t);
  const res = await call({ phone: "+966 55 123 4567", name: "فهد", barberId: String(barber._id), serviceIds: [String(beard._id)] });
  assert.equal(res.statusCode, 201);
  const appointment = created[0];
  assert.equal(appointment.bookingSource, "kiosk_walk_in");
  assert.equal(appointment.isWalkIn, true);
  assert.equal(appointment.status, "Booked");
  assert.equal(appointment.barberName, "ماجد");
  assert.equal(appointment.totalPrice, 25, "barber's own price");
  assert.equal(appointment.invoiceNumber, "INV-41");
  assert.match(res.body.appointment.timeSlot, /^\d{2}:\d{2}$/, "shown as HH:MM");
});

test("without a barber it goes to the general walk-in queue, with no services", async (t) => {
  const created = setup(t, { existingCustomer: { _id: id(), children: ["فهد"] } });
  const res = await call({ phone: "0551234567", name: "فهد" });
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].barberName, "حلاقة مباشرة");
  assert.deepEqual(created[0].selectedServices, []);
});

test("bad phone, missing name, inactive subscription and the free-plan limit are refused", async (t) => {
  setup(t);
  assert.equal((await call({ phone: "12345", name: "فهد" })).statusCode, 400);
  assert.equal((await call({ phone: "0551234567", name: " " })).statusCode, 400);
  t.mock.restoreAll();
  setup(t, { status: "Expired" });
  assert.equal((await call({ phone: "0551234567", name: "فهد" })).statusCode, 403);
  t.mock.restoreAll();
  setup(t, { plan: "Free" });
  t.mock.method(Appointment, "countDocuments", async () => 150);
  const limited = await call({ phone: "0551234567", name: "فهد" });
  assert.equal(limited.statusCode, 403);
  assert.equal(limited.body.limitReached, true);
});
