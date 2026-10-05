const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const axios = require("axios");

process.env.WHATSI_BASE_URL = "https://whatsi.test";
process.env.WHATSI_INTEGRATION_KEY = "wi_integration_key";
process.env.WHATSI_WEBHOOK_SECRET = "whsec_test";

const Tenant = require("../src/models/Tenant");
const { verifyWhatsiSignature, normalizeWhatsiMessageStatus } = require("../src/utils/whatsi");
const { sendCampaignMessage, sendWhatsAppMessage, isWhatsappReady } = require("../src/utils/whatsapp");
const { handleWhatsiWebhook } = require("../src/controllers/whatsappController");

const whatsiTenant = {
  _id: "6ac385a11625d644cce20dd8",
  salonName: "صالون بالون",
  whatsappSettings: { provider: "whatsi", isEnabled: true, sessionId: "sess_1" },
};

const sign = (body, timestamp, secret = "whsec_test") =>
  "sha256=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const withStub = async (target, key, impl, fn) => {
  const original = target[key];
  target[key] = impl;
  try { return await fn(); } finally { target[key] = original; }
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test("Whatsi webhook signatures are checked on the raw body with a time window", () => {
  const body = JSON.stringify({ event: "session.connected" });
  const timestamp = new Date().toISOString();
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp, signature: sign(body, timestamp) }), true);
  assert.equal(verifyWhatsiSignature({ rawBody: body + " ", timestamp, signature: sign(body, timestamp) }), false);
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp, signature: sign(body, timestamp, "other") }), false);
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp: old, signature: sign(body, old) }), false);
  assert.equal(verifyWhatsiSignature({ rawBody: undefined, timestamp, signature: sign(body, timestamp) }), false);
});

test("Whatsi message statuses map onto campaign status codes", () => {
  assert.deepEqual(normalizeWhatsiMessageStatus("QUEUED"), { code: 1, status: "pending" });
  assert.deepEqual(normalizeWhatsiMessageStatus("processing"), { code: 1, status: "pending" });
  assert.deepEqual(normalizeWhatsiMessageStatus("SENT"), { code: 2, status: "sent" });
  assert.deepEqual(normalizeWhatsiMessageStatus("DELIVERED"), { code: 3, status: "delivered" });
  assert.deepEqual(normalizeWhatsiMessageStatus("READ"), { code: 4, status: "read" });
  assert.deepEqual(normalizeWhatsiMessageStatus("FAILED"), { code: 0, status: "failed" });
  assert.equal(normalizeWhatsiMessageStatus("bogus"), null);
});

test("a Whatsi salon is ready only with a session and the platform integration key", () => {
  assert.equal(isWhatsappReady(whatsiTenant), true);
  assert.equal(isWhatsappReady({ ...whatsiTenant, whatsappSettings: { ...whatsiTenant.whatsappSettings, sessionId: null } }), false);
  assert.equal(isWhatsappReady({ ...whatsiTenant, whatsappSettings: { ...whatsiTenant.whatsappSettings, isEnabled: false } }), false);
});

test("campaign messages for a Whatsi salon go through the integration API with an idempotency id", async () => {
  let call;
  const result = await withStub(axios, "post", async (url, body, config) => {
    call = { url, body, config };
    return { status: 202, data: { success: true, data: { id: "cmsg_1", status: "QUEUED" } } };
  }, () => sendCampaignMessage("0551234567", "عرض خاص", whatsiTenant, { clientMessageId: "campaign-c1-r1" }));

  assert.equal(call.url, "https://whatsi.test/v1/integration/accounts/6ac385a11625d644cce20dd8/messages");
  assert.equal(call.config.headers.Authorization, "Bearer wi_integration_key");
  assert.deepEqual(call.body, { to: "966551234567", text: "عرض خاص", clientMessageId: "campaign-c1-r1" });
  assert.deepEqual(result, { success: true, providerMessageId: "cmsg_1", providerStatus: "pending", providerStatusCode: 1 });
});

test("a rejected Whatsi campaign send reports retryable rate limits", async () => {
  const error = Object.assign(new Error("rate limited"), {
    response: { status: 429, headers: { "retry-after": "30" }, data: { error: "RATE_LIMIT_EXCEEDED", message: "slow down" } },
  });
  const result = await withStub(axios, "post", async () => { throw error; },
    () => sendCampaignMessage("0551234567", "نص", whatsiTenant));
  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterSeconds, 30);
});

test("transactional messages still use WaSender for WaSender salons", async () => {
  const { encrypt } = require("../src/utils/encryption");
  const wasenderTenant = { _id: "t2", salonName: "صالون", whatsappSettings: { isEnabled: true, apiKey: encrypt("ws_key") } };
  let call;
  const ok = await withStub(axios, "post", async (url, body, config) => { call = { url, body, config }; return { data: { success: true } }; },
    () => sendWhatsAppMessage("0551234567", "أحمد", "2026-10-06", "18:00", "محمود", wasenderTenant));
  assert.equal(ok, true);
  assert.equal(call.url, "https://www.wasenderapi.com/api/send-message");
  assert.equal(call.config.headers.Authorization, "Bearer ws_key");
});

test("Whatsi webhook rejects unsigned calls and updates the salon session status", async () => {
  const unsigned = mockRes();
  await handleWhatsiWebhook({ headers: {}, body: { event: "session.connected" }, rawBody: "{}" }, unsigned);
  assert.equal(unsigned.statusCode, 401);

  const payload = { event: "session.connected", data: { sessionId: "sess_1", status: "CONNECTED" } };
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  let lookup; let update;
  const res = mockRes();
  await withStub(Tenant, "findOne", (query) => { lookup = query; return { select: () => ({ lean: async () => ({ _id: "t1", salonName: "بالون" }) }) }; },
    () => withStub(Tenant, "updateOne", async (filter, change) => { update = { filter, change }; return {}; },
      () => handleWhatsiWebhook({ headers: { "x-whatsi-timestamp": timestamp, "x-whatsi-signature": sign(rawBody, timestamp) }, body: payload, rawBody }, res)));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(lookup, { "whatsappSettings.provider": "whatsi", "whatsappSettings.sessionId": "sess_1" });
  assert.deepEqual(update.change, { $set: { "whatsappSettings.sessionStatus": "CONNECTED" } });
});
