const test = require("node:test");
const assert = require("node:assert/strict");
const { createReviewRequester } = require("../src/services/reviewRequestService");

const tenant = {
  _id: "salon-1",
  settings: { enableGoogleReviews: true, googleReviewLink: "https://example.com/review" },
  whatsappSettings: { isEnabled: true },
};

const appointment = () => ({
  _id: "appointment-1",
  status: "Completed",
  childName: "Customer",
  customerId: { phone: "0500000000" },
  isReviewRequested: false,
});

test("completed walk-in review is claimed once and marked sent after provider acceptance", async () => {
  let requested = false;
  let lock = null;
  let sends = 0;
  const requester = createReviewRequester({
    AppointmentModel: {
      findOneAndUpdate: async () => {
        if (requested || lock) return null;
        lock = new Date();
        return {};
      },
      updateOne: async (_, update) => {
        requested = update.$set.isReviewRequested;
        lock = null;
      },
    },
    sendMessage: async () => { sends += 1; return true; },
  });

  const record = appointment();
  assert.equal(await requester(record, tenant), true);
  assert.equal(record.isReviewRequested, true);
  assert.equal(await requester(record, tenant), false);
  assert.equal(sends, 1);
});

test("failed provider request releases the claim for manual retry", async () => {
  let lock = false;
  let sends = 0;
  const requester = createReviewRequester({
    AppointmentModel: {
      findOneAndUpdate: async () => {
        if (lock) return null;
        lock = true;
        return {};
      },
      updateOne: async () => { lock = false; },
    },
    sendMessage: async () => { sends += 1; return sends > 1; },
  });

  const record = appointment();
  assert.equal(await requester(record, tenant), false);
  assert.equal(record.isReviewRequested, false);
  assert.equal(await requester(record, tenant), true);
  assert.equal(sends, 2);
});

test("review request is skipped before haircut completion", async () => {
  const record = { ...appointment(), status: "Booked" };
  const requester = createReviewRequester({
    AppointmentModel: { findOneAndUpdate: () => { throw new Error("should not claim"); } },
    sendMessage: () => { throw new Error("should not send"); },
  });
  assert.equal(await requester(record, tenant), false);
});
