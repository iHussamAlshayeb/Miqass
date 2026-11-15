const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// يُستبدل مُرسل التقييم قبل تحميل المتحكم حتى نعرف متى يُستدعى
const reviewService = require("../src/services/reviewRequestService");
const reviewCalls = [];
reviewService.sendReviewAfterCompletion = async (appointment) => { reviewCalls.push(appointment.bookingSource); return true; };

const Appointment = require("../src/models/Appointment");
const Tenant = require("../src/models/Tenant");
const Customer = require("../src/models/Customer");
const { updateAppointmentStatus } = require("../src/controllers/barberController");

const id = () => new mongoose.Types.ObjectId();
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

const complete = async (t, { bookingSource, status = "Booked", isReviewRequested = false }) => {
  const appointment = {
    _id: id(), status, bookingSource, isReviewRequested, childName: "عميل", timeSlot: "18:00",
    customerId: { _id: id(), phone: "0551234567" },
    set(update) { Object.assign(this, update); },
    async save() {},
  };
  t.mock.method(Appointment, "findOne", () => ({ populate: async () => appointment }));
  t.mock.method(Tenant, "findById", async () => ({ _id: id(), settings: {}, whatsappSettings: {} }));
  t.mock.method(Customer, "updateOne", async () => ({}));
  const res = makeRes();
  await updateAppointmentStatus({ params: { appointmentId: String(appointment._id) }, body: { status: "Completed" }, tenantId: id() }, res);
  assert.equal(res.statusCode, 200);
};

test("completing an online booking from the dashboard or POS sends the review request", async (t) => {
  reviewCalls.length = 0;
  await complete(t, { bookingSource: "online" });
  assert.deepEqual(reviewCalls, ["online"]);
});

test("walk-ins still get it, and an already-sent review is not sent again", async (t) => {
  reviewCalls.length = 0;
  await complete(t, { bookingSource: "kiosk_walk_in" });
  await complete(t, { bookingSource: "online", status: "Completed", isReviewRequested: true });
  assert.deepEqual(reviewCalls, ["kiosk_walk_in"]);
});

test("re-completing a completed booking whose review never went out retries it", async (t) => {
  reviewCalls.length = 0;
  await complete(t, { bookingSource: "online", status: "Completed" });
  assert.deepEqual(reviewCalls, ["online"]);
});
