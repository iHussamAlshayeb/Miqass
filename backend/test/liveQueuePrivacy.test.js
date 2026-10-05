const test = require("node:test");
const assert = require("node:assert/strict");

const Tenant = require("../src/models/Tenant");
const Barber = require("../src/models/Barber");
const Appointment = require("../src/models/Appointment");
const { getLiveQueue } = require("../src/controllers/bookingController");

test("public live queue never exposes customer phones, prices or services", async () => {
  const originals = [Tenant.findOne, Barber.find, Appointment.find];
  let tenantFilter;
  let appointmentFields = "";
  let populated = false;

  Tenant.findOne = (filter) => {
    tenantFilter = filter;
    return { select() { return this; }, async lean() { return { _id: "t1", salonName: "صالون", branding: {} }; } };
  };
  Barber.find = () => ({ select() { return this; }, async lean() { return [{ name: "محمد" }]; } });
  Appointment.find = () => ({
    select(fields) { appointmentFields = fields; return this; },
    populate() { populated = true; return this; },
    sort() { return this; },
    async lean() {
      return [{
        _id: "a1", childName: "سارة", timeSlot: "17:00", barberName: "محمد", status: "Booked",
        customerId: { phone: "0551234567" }, totalPrice: 40, selectedServices: [{ name: "قص" }],
      }];
    },
  });

  try {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getLiveQueue({ params: { slug: { $ne: null } } }, res);
    assert.equal(typeof tenantFilter.slug, "string");

    await getLiveQueue({ params: { slug: "salon" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(populated, false, "customer documents must not be populated");
    assert.doesNotMatch(appointmentFields, /customerId|totalPrice|selectedServices/);
    assert.deepEqual(res.body.appointments, [
      { _id: "a1", childName: "سارة", timeSlot: "17:00", chair: "محمد", status: "Booked" },
    ]);
    assert.equal(JSON.stringify(res.body).includes("0551234567"), false);
  } finally {
    [Tenant.findOne, Barber.find, Appointment.find] = originals;
  }
});
