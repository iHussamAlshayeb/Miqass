const test = require("node:test");
const assert = require("node:assert/strict");
const Tenant = require("../src/models/Tenant");
const { handleWhatsappWebhook } = require("../src/controllers/whatsappController");

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.sendStatus = (code) => { res.statusCode = code; return res; };
  return res;
};

const stubTenant = (t, tenant) => {
  const original = Tenant.findOne;
  Tenant.findOne = () => ({ select: () => ({ lean: async () => tenant }) });
  t.after(() => { Tenant.findOne = original; });
};

test("WaSender webhook rejects a wrong signature without crashing", async (t) => {
  stubTenant(t, { salonName: "S", whatsappSettings: { sessionId: "1", webhookSecret: "right-secret" } });
  const res = makeRes();
  await handleWhatsappWebhook({ headers: { "x-webhook-signature": "wrong-secret" }, body: { event: "messages.update", sessionId: "1" } }, res);
  assert.equal(res.statusCode, 401);
});

test("WaSender webhook accepts the matching signature", async (t) => {
  stubTenant(t, { salonName: "S", whatsappSettings: { sessionId: "1", webhookSecret: "right-secret" } });
  const res = makeRes();
  await handleWhatsappWebhook({ headers: { "x-webhook-signature": "right-secret" }, body: { event: "unknown.event", sessionId: "1" } }, res);
  assert.notEqual(res.statusCode, 401);
  assert.notEqual(res.statusCode, 500);
});
