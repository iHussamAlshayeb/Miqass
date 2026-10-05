const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const axios = require("axios");

process.env.WHATSI_BASE_URL = "https://whatsi.test";
process.env.BACKEND_URL = "https://api.miqass.test";

const Tenant = require("../src/models/Tenant");
const { encrypt, decrypt } = require("../src/utils/encryption");
const {
  verifyWhatsiSignature,
  verifyWhatsiApiKey,
  normalizeWhatsiMessageStatus,
  normalizeWhatsiNumber,
} = require("../src/utils/whatsi");
const { sendCampaignMessage, sendWhatsAppMessage, isWhatsappReady } = require("../src/utils/whatsapp");
const { handleWhatsiWebhook, saveWhatsiSettings } = require("../src/controllers/whatsappController");

const TENANT_ID = "6ac385a11625d644cce20dd8";
const API_KEY = "wg_live_abcdefghijkl_0123456789abcdefghijklmn";
const whatsiTenant = {
  _id: TENANT_ID,
  salonName: "صالون بالون",
  whatsappSettings: { provider: "whatsi", isEnabled: true, apiKey: encrypt(API_KEY), whatsiFrom: "966500000001" },
};

const sign = (body, timestamp, secret) =>
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

const leanQuery = (value) => ({ select: () => ({ lean: async () => value }), lean: async () => value });

test("Whatsi webhook signatures are checked on the raw body with a time window", () => {
  const body = JSON.stringify({ event: "session.connected" });
  const timestamp = new Date().toISOString();
  const secret = "whsec_salon";
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp, signature: sign(body, timestamp, secret), secret }), true);
  assert.equal(verifyWhatsiSignature({ rawBody: body + " ", timestamp, signature: sign(body, timestamp, secret), secret }), false);
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp, signature: sign(body, timestamp, "other"), secret }), false);
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp: old, signature: sign(body, old, secret), secret }), false);
  assert.equal(verifyWhatsiSignature({ rawBody: body, timestamp, signature: sign(body, timestamp, secret), secret: "" }), false);
});

test("Whatsi statuses and numbers are normalized", () => {
  assert.deepEqual(normalizeWhatsiMessageStatus("QUEUED"), { code: 1, status: "pending" });
  assert.deepEqual(normalizeWhatsiMessageStatus("DELIVERED"), { code: 3, status: "delivered" });
  assert.deepEqual(normalizeWhatsiMessageStatus("FAILED"), { code: 0, status: "failed" });
  assert.equal(normalizeWhatsiMessageStatus("bogus"), null);
  assert.equal(normalizeWhatsiNumber("+966 55 123 4567"), "966551234567");
  assert.equal(normalizeWhatsiNumber("0551234567"), "966551234567");
  assert.equal(normalizeWhatsiNumber("12"), "");
});

test("an API key is verified against Whatsi: 404 on the probe means the key works", async () => {
  const fail = (status) => async () => { throw Object.assign(new Error("x"), { response: { status } }); };
  assert.deepEqual(await withStub(axios, "get", fail(404), () => verifyWhatsiApiKey(API_KEY)), { valid: true });
  assert.deepEqual(await withStub(axios, "get", fail(401), () => verifyWhatsiApiKey(API_KEY)), { valid: false, reason: "invalid_key" });
  assert.deepEqual(await withStub(axios, "get", async () => { throw new Error("ECONNRESET"); }, () => verifyWhatsiApiKey(API_KEY)), { valid: false, reason: "unreachable" });
});

test("a Whatsi salon is ready with its own key", () => {
  assert.equal(isWhatsappReady(whatsiTenant), true);
  assert.equal(isWhatsappReady({ ...whatsiTenant, whatsappSettings: { ...whatsiTenant.whatsappSettings, apiKey: null } }), false);
});

test("campaign messages go to /v1/messages/text with the salon key, sender number and idempotency id", async () => {
  let call;
  const result = await withStub(axios, "post", async (url, body, config) => {
    call = { url, body, config };
    return { status: 202, data: { success: true, data: { id: "cmsg_1", status: "QUEUED" } } };
  }, () => sendCampaignMessage("0551234567", "عرض خاص", whatsiTenant, { clientMessageId: "campaign-c1-r1" }));

  assert.equal(call.url, "https://whatsi.test/v1/messages/text");
  assert.equal(call.config.headers.Authorization, `Bearer ${API_KEY}`);
  assert.deepEqual(call.body, { to: "966551234567", text: "عرض خاص", from: "966500000001", clientMessageId: "campaign-c1-r1" });
  assert.deepEqual(result, { success: true, providerMessageId: "cmsg_1", providerStatus: "pending", providerStatusCode: 1 });
});

test("a disconnected Whatsi number marks the salon as disconnected", async () => {
  const error = Object.assign(new Error("conflict"), {
    response: { status: 409, data: { error: "SESSION_NOT_CONNECTED", message: "Current session status: DISCONNECTED" } },
  });
  let update;
  const ok = await withStub(Tenant, "updateOne", async (filter, change) => { update = { filter, change }; return {}; },
    () => withStub(axios, "post", async () => { throw error; },
      () => sendWhatsAppMessage("0551234567", "أحمد", "2026-10-06", "18:00", "محمود", whatsiTenant)));
  assert.equal(ok, false);
  assert.deepEqual(update.change, { $set: { "whatsappSettings.sessionStatus": "DISCONNECTED" } });
});

test("transactional messages still use WaSender for WaSender salons", async () => {
  const wasenderTenant = { _id: "t2", salonName: "صالون", whatsappSettings: { isEnabled: true, apiKey: encrypt("ws_key") } };
  let call;
  const ok = await withStub(axios, "post", async (url, body, config) => { call = { url, body, config }; return { data: { success: true } }; },
    () => sendWhatsAppMessage("0551234567", "أحمد", "2026-10-06", "18:00", "محمود", wasenderTenant));
  assert.equal(ok, true);
  assert.equal(call.url, "https://www.wasenderapi.com/api/send-message");
});

test("saving Whatsi settings verifies the key and stores it encrypted", async () => {
  let saved;
  const res = mockRes();
  await withStub(Tenant, "findById", () => leanQuery({ _id: TENANT_ID, whatsappSettings: { provider: "wasender" } }),
    () => withStub(axios, "get", async () => { throw Object.assign(new Error("nf"), { response: { status: 404 } }); },
      () => withStub(Tenant, "findByIdAndUpdate", (id, update) => {
        saved = update.$set;
        return { lean: async () => ({ _id: TENANT_ID, whatsappSettings: { sessionStatus: "CONNECTED", whatsiFrom: "966500000001", whatsiWebhookSecret: saved["whatsappSettings.whatsiWebhookSecret"] } }) };
      }, () => saveWhatsiSettings({ tenantId: TENANT_ID, body: { apiKey: API_KEY, fromNumber: "0500000001", webhookSecret: "whsec_salon_secret" } }, res))));

  assert.equal(res.statusCode, 200);
  assert.equal(saved["whatsappSettings.provider"], "whatsi");
  assert.equal(decrypt(saved["whatsappSettings.apiKey"]), API_KEY);
  assert.notEqual(saved["whatsappSettings.apiKey"], API_KEY);
  assert.equal(saved["whatsappSettings.whatsiFrom"], "966500000001");
  assert.equal(decrypt(saved["whatsappSettings.whatsiWebhookSecret"]), "whsec_salon_secret");
  assert.equal(res.body.session.webhookUrl, `https://api.miqass.test/api/whatsapp/whatsi/webhook/${TENANT_ID}`);
  assert.equal(JSON.stringify(res.body).includes(API_KEY), false, "the key is never echoed back");
});

test("a malformed key is rejected before calling Whatsi", async () => {
  const res = mockRes();
  await withStub(Tenant, "findById", () => leanQuery({ _id: TENANT_ID, whatsappSettings: {} }),
    () => withStub(axios, "get", async () => { throw new Error("must not be called"); },
      () => saveWhatsiSettings({ tenantId: TENANT_ID, body: { apiKey: "not-a-key" } }, res)));
  assert.equal(res.statusCode, 400);
});

test("the per-salon webhook checks the salon secret and updates the number status", async () => {
  const secret = "whsec_salon_secret";
  const tenant = { _id: TENANT_ID, salonName: "بالون", whatsappSettings: { whatsiFrom: "966500000001", whatsiWebhookSecret: encrypt(secret) } };
  const payload = { event: "session.disconnected", data: { sessionId: "s1", phoneNumber: "966500000001", status: "DISCONNECTED" } };
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date().toISOString();

  const forged = mockRes();
  await withStub(Tenant, "findOne", () => leanQuery(tenant), () =>
    handleWhatsiWebhook({ params: { tenantId: TENANT_ID }, headers: { "x-whatsi-timestamp": timestamp, "x-whatsi-signature": sign(rawBody, timestamp, "wrong") }, body: payload, rawBody }, forged));
  assert.equal(forged.statusCode, 401);

  let update;
  const res = mockRes();
  await withStub(Tenant, "findOne", () => leanQuery(tenant), () =>
    withStub(Tenant, "updateOne", async (filter, change) => { update = change; return {}; }, () =>
      handleWhatsiWebhook({ params: { tenantId: TENANT_ID }, headers: { "x-whatsi-timestamp": timestamp, "x-whatsi-signature": sign(rawBody, timestamp, secret) }, body: payload, rawBody }, res)));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(update, { $set: { "whatsappSettings.sessionStatus": "DISCONNECTED" } });
});
