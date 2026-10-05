const test = require("node:test");
const assert = require("node:assert/strict");

const Tenant = require("../src/models/Tenant");
const Appointment = require("../src/models/Appointment");
const { getPaymentReturnStatus } = require("../src/controllers/bookingController");

const lean = (value) => ({ select() { return this; }, async lean() { return value; } });
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("payment return status maps appointment state and exposes no personal data", async () => {
  const originals = [Tenant.findOne, Appointment.findOne];
  let appointment = { status: "Pending_Payment", date: "2026-10-06", timeSlot: "18:30", barberName: "محمود", childName: "سارة", payment: { status: "Pending" } };
  let apptFilter;
  Tenant.findOne = () => lean({ _id: "t1" });
  Appointment.findOne = (filter) => { apptFilter = filter; return lean(appointment); };
  try {
    const id = "507f1f77bcf86cd799439013";
    const pending = response();
    await getPaymentReturnStatus({ params: { appointmentId: id }, query: { slug: "balloon" } }, pending);
    assert.equal(pending.body.state, "pending");
    assert.equal(JSON.stringify(pending.body).includes("سارة"), false);
    assert.equal(apptFilter.tenantId, "t1", "scoped to the salon in the URL");

    appointment = { ...appointment, status: "Booked", payment: { status: "Paid" } };
    const confirmed = response();
    await getPaymentReturnStatus({ params: { appointmentId: id }, query: { slug: "balloon" } }, confirmed);
    assert.deepEqual(confirmed.body, { state: "confirmed", date: "2026-10-06", timeSlot: "18:30", barberName: "محمود" });

    const bad = response();
    await getPaymentReturnStatus({ params: { appointmentId: "x" }, query: { slug: "balloon" } }, bad);
    assert.equal(bad.statusCode, 400);
  } finally {
    [Tenant.findOne, Appointment.findOne] = originals;
  }
});
