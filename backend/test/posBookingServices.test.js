const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Appointment = require("../src/models/Appointment");
const Service = require("../src/models/Service");
const Barber = require("../src/models/Barber");
const Sale = require("../src/models/Sale");
const { updateAppointmentServicesFromPos } = require("../src/controllers/posController");

const id = () => new mongoose.Types.ObjectId();
const lean = (value) => ({ select() { return this; }, lean: async () => value });
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

const haircut = { _id: id(), name: "قص شعر", price: 40, duration: 30 };
const beard = { _id: id(), name: "تحديد لحية", price: 25, duration: 15 };
const barberId = id();

const setup = (t, appointmentOverrides = {}) => {
  const appointment = {
    _id: id(), status: "Booked", saleId: null, barberId, totalPrice: 40, totalDuration: 30,
    selectedServices: [{ serviceId: haircut._id, name: haircut.name, price: 40 }],
    payment: { status: "Not_Required", amount: 0 },
    ...appointmentOverrides,
  };
  let update = null;
  t.mock.method(Appointment, "findOne", () => lean(appointment));
  t.mock.method(Sale, "exists", async () => null);
  t.mock.method(Service, "find", () => lean([haircut, beard]));
  // حلاق الحجز له سعر خاص للحية
  t.mock.method(Barber, "findOne", () => lean({ servicePrices: [{ serviceId: beard._id, price: 30 }] }));
  t.mock.method(Appointment, "findOneAndUpdate", (filter, change) => {
    update = { filter, change };
    return { lean: async () => ({ ...appointment, ...change.$set }) };
  });
  return { appointment, updated: () => update };
};

const call = async (appointment, serviceIds, cashier = { name: "سالم" }) => {
  const res = makeRes();
  await updateAppointmentServicesFromPos({ params: { appointmentId: String(appointment._id) }, body: { serviceIds }, tenantId: id(), cashier }, res);
  return res;
};

test("the customer changes the booked service: prices use the booking barber and the change is recorded", async (t) => {
  const { appointment, updated } = setup(t);
  const res = await call(appointment, [String(haircut._id), String(beard._id)]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.services.map((service) => [service.name, service.price]), [["قص شعر", 40], ["تحديد لحية", 30]]);
  assert.equal(res.body.totalPrice, 70);
  const { filter, change } = updated();
  assert.equal(filter.saleId, null, "never edits a booking that was just checked out");
  assert.equal(change.$set.totalDuration, 45);
  const record = change.$push.serviceChanges.$each[0];
  assert.deepEqual([record.by, record.from, record.to, record.fromTotal, record.toTotal], ["سالم", ["قص شعر"], ["قص شعر", "تحديد لحية"], 40, 70]);
});

test("a paid booking, a cancelled one, an empty list or unknown services are refused", async (t) => {
  const paid = setup(t, { saleId: id() });
  assert.equal((await call(paid.appointment, [String(beard._id)])).statusCode, 409);
  t.mock.restoreAll();

  const cancelled = setup(t, { status: "Cancelled" });
  assert.equal((await call(cancelled.appointment, [String(beard._id)])).statusCode, 409);
  t.mock.restoreAll();

  const booking = setup(t);
  assert.equal((await call(booking.appointment, [])).statusCode, 400);
  const unknown = await call(booking.appointment, [String(id())]);
  assert.equal(unknown.statusCode, 400);
  assert.match(unknown.body.message, /غير متاحة/);
});

test("the new total cannot drop below a paid deposit", async (t) => {
  const { appointment } = setup(t, { payment: { status: "Paid", amount: 35 } });
  const res = await call(appointment, [String(beard._id)]);
  assert.equal(res.statusCode, 400, "30 < 35 deposit");
  assert.match(res.body.message, /العربون/);
  const ok = await call(appointment, [String(haircut._id)]);
  assert.equal(ok.statusCode, 200);
});
