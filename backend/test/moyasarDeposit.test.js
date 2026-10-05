const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const Tenant = require("../src/models/Tenant");
const Appointment = require("../src/models/Appointment");
const { encrypt } = require("../src/utils/encryption");
const {
  createBookingPaymentSession,
  getVerifiedMoyasarPayment,
  isOnlinePaymentConfigured,
} = require("../src/services/paymentGatewayService");
const { moyasarWebhook } = require("../src/controllers/paymentController");

const tenantId = "507f1f77bcf86cd799439011";
const appointmentId = "507f1f77bcf86cd799439013";

const withAxios = async (impl, fn) => {
  const original = axios.request;
  axios.request = impl;
  try { await fn(); } finally { axios.request = original; }
};

const reply = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  send(body) { this.body = body; return this; },
});

test("online deposit requires a Moyasar secret key", () => {
  assert.equal(isOnlinePaymentConfigured({ isOnlinePaymentEnabled: true, depositAmount: 20 }), false);
  assert.equal(
    isOnlinePaymentConfigured({ isOnlinePaymentEnabled: true, depositAmount: 20, moyasarSecretKey: "enc" }),
    true,
  );
});

test("deposit session creates a Moyasar invoice in halalas with metadata", async () => {
  let sent;
  await withAxios(async (config) => { sent = config; return { data: { id: "inv_1", url: "https://checkout.moyasar.com/invoices/inv_1" } }; }, async () => {
    const session = await createBookingPaymentSession({
      tenant: { _id: tenantId, slug: "salon", salonName: "صالون", paymentSettings: { moyasarSecretKey: encrypt("sk_test_x") } },
      appointment: { _id: appointmentId },
      amount: 25.5,
      req: { protocol: "https", get: (h) => (h === "host" ? "www.miqass.app" : null) },
    });
    assert.equal(session.paymentUrl, "https://checkout.moyasar.com/invoices/inv_1");
    assert.equal(session.provider, "moyasar");
  });
  assert.equal(sent.url, "https://api.moyasar.com/v1/invoices");
  assert.equal(sent.data.amount, 2550);
  assert.equal(sent.data.metadata.appointmentId, appointmentId);
  assert.equal(sent.auth.username, "sk_test_x");
  assert.match(sent.data.callback_url, /\/api\/appointments\/webhook\/moyasar\?tenantId=/);
});

test("webhook payload is re-fetched from Moyasar and ids are validated", async () => {
  const urls = [];
  await withAxios(async (config) => {
    urls.push(config.url);
    return { data: { id: "inv_1", status: "paid", amount: 2000, metadata: { tenantId }, payments: [{ id: "pay_1", status: "paid", source: { type: "creditcard" } }] } };
  }, async () => {
    const verified = await getVerifiedMoyasarPayment({ payload: { id: "inv_1", status: "paid", payments: [] }, secretKey: "sk" });
    assert.equal(verified.providerPaymentId, "pay_1");
    await getVerifiedMoyasarPayment({ payload: { id: "pay_9", invoice_id: "inv_1" }, secretKey: "sk" });
    await assert.rejects(getVerifiedMoyasarPayment({ payload: { id: "../../x" }, secretKey: "sk" }));
  });
  assert.deepEqual(urls, [
    "https://api.moyasar.com/v1/invoices/inv_1",
    "https://api.moyasar.com/v1/invoices/inv_1",
  ]);
});

test("webhook refuses a payment smaller than the expected deposit", async () => {
  const originals = [Tenant.findById, Appointment.findOne];
  Tenant.findById = () => ({ select: async () => ({ _id: tenantId, salonName: "صالون", paymentSettings: { moyasarSecretKey: encrypt("sk_test_x") } }) });
  Appointment.findOne = () => ({ populate: async () => ({ _id: appointmentId, status: "Pending_Payment", payment: { status: "Pending", amount: 20 } }) });
  try {
    await withAxios(async () => ({ data: { id: "pay_1", status: "paid", amount: 100, metadata: { tenantId, appointmentId } } }), async () => {
      const res = reply();
      await moyasarWebhook({ body: { id: "pay_1" }, query: { tenantId } }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body, "Paid amount mismatch");
    });
  } finally {
    [Tenant.findById, Appointment.findOne] = originals;
  }
});
