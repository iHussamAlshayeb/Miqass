const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const WhatsAppMessage = require("../src/models/WhatsAppMessage");
const outbox = require("../src/services/whatsappOutbox");

const id = () => new mongoose.Types.ObjectId();
const tenant = { _id: id(), salonName: "صالون", whatsappSettings: { isEnabled: true, provider: "wasender" } };
const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  for (const [key, value] of Object.entries(vars)) if (value === undefined) delete process.env[key];
  try { await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
};
const okResponse = { data: { success: true, data: { msgId: 777 } } };
const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } });

test("only one side ever runs the WhatsApp jobs: the app in inline mode, the service in queue mode", async () => {
  await withEnv({ WHATSAPP_DELIVERY: undefined, MIQASS_ROLE: undefined }, () => {
    assert.equal(outbox.shouldRunWhatsappJobs(), true);
    assert.equal(outbox.shouldEnqueue(), false);
  });
  await withEnv({ WHATSAPP_DELIVERY: undefined, MIQASS_ROLE: "whatsapp" }, () => {
    assert.equal(outbox.shouldRunWhatsappJobs(), false, "service stays on standby in inline mode");
  });
  await withEnv({ WHATSAPP_DELIVERY: "queue", MIQASS_ROLE: undefined }, () => {
    assert.equal(outbox.shouldRunWhatsappJobs(), false);
    assert.equal(outbox.shouldEnqueue(), true);
  });
  await withEnv({ WHATSAPP_DELIVERY: "queue", MIQASS_ROLE: "whatsapp" }, () => {
    assert.equal(outbox.shouldRunWhatsappJobs(), true);
    assert.equal(outbox.shouldEnqueue(), false, "the service itself sends");
  });
});

test("inline mode sends right away and records the message as sent with the provider id", async (t) => {
  const created = [];
  const updates = [];
  t.mock.method(WhatsAppMessage, "create", async (doc) => { created.push(doc); return { _id: id(), ...doc }; });
  t.mock.method(WhatsAppMessage, "updateOne", async (filter, change) => { updates.push(change.$set); });
  let sentBody = null;
  await withEnv({ WHATSAPP_DELIVERY: undefined, MIQASS_ROLE: undefined }, async () => {
    const ok = await outbox.deliver({
      postText: async (_t, _c, body) => { sentBody = body; return okResponse; },
      tenant, credential: "key", type: "review", to: "966551234567", text: "قيّمنا", recipientName: "ريان",
    });
    assert.equal(ok, true);
  });
  assert.equal(sentBody.to, "966551234567");
  assert.equal(created[0].status, "sending");
  assert.equal(created[0].type, "review");
  assert.equal(updates.at(-1).status, "sent");
  assert.equal(updates.at(-1).providerMessageId, "777");
});

test("queue mode only records the message; nothing is sent from the app", async (t) => {
  const created = [];
  t.mock.method(WhatsAppMessage, "create", async (doc) => { created.push(doc); return { _id: id(), ...doc }; });
  let sent = false;
  await withEnv({ WHATSAPP_DELIVERY: "queue", MIQASS_ROLE: undefined }, async () => {
    const ok = await outbox.deliver({ postText: async () => { sent = true; return okResponse; }, tenant, credential: "key", type: "confirmation", to: "966551234567", text: "x" });
    assert.equal(ok, true);
  });
  assert.equal(sent, false);
  assert.equal(created[0].status, "queued");
  assert.ok(created[0].expiresAt > new Date());
});

test("if the queue cannot be written, the app sends directly so the message is not lost", async (t) => {
  let calls = 0;
  t.mock.method(WhatsAppMessage, "create", async () => { calls += 1; throw new Error("db down"); });
  let sent = false;
  await withEnv({ WHATSAPP_DELIVERY: "queue", MIQASS_ROLE: undefined }, async () => {
    assert.equal(await outbox.deliver({ postText: async () => { sent = true; return okResponse; }, tenant, credential: "k", type: "confirmation", to: "966551234567", text: "x" }), true);
  });
  assert.equal(sent, true);
  assert.equal(calls, 2);
});

test("temporary failures are retried later; a wrong number fails for good with the reason", async (t) => {
  const updates = [];
  t.mock.method(WhatsAppMessage, "create", async (doc) => ({ _id: id(), ...doc }));
  t.mock.method(WhatsAppMessage, "updateOne", async (filter, change) => { updates.push(change.$set); });
  await withEnv({ WHATSAPP_DELIVERY: undefined, MIQASS_ROLE: undefined }, async () => {
    const retried = await outbox.deliver({ postText: async () => { throw httpError(503, "busy"); }, tenant, credential: "k", type: "confirmation", to: "9665", text: "x" });
    assert.equal(retried, true, "accepted: it will be retried");
    assert.equal(updates.at(-1).status, "queued");
    assert.ok(updates.at(-1).nextAttemptAt > new Date());

    await assert.rejects(outbox.deliver({ postText: async () => { throw httpError(400, "The provided JID does not exist on WhatsApp."); }, tenant, credential: "k", type: "review", to: "9665", text: "x" }));
    assert.equal(updates.at(-1).status, "failed");
    assert.match(updates.at(-1).lastError, /^الرقم غير مسجّل في واتساب · HTTP 400 · The provided JID/);
  });
});

test("the dispatcher expires stale messages, sends due ones, and fails them when the salon is disconnected", async (t) => {
  const record = { _id: id(), tenantId: tenant._id, type: "confirmation", to: "966551234567", text: "x", attempts: 1 };
  const queue = [record, { ...record, _id: id(), tenantId: id() }];
  const bulk = [];
  const updates = [];
  t.mock.method(WhatsAppMessage, "updateMany", async (filter, change) => { bulk.push([filter, change.$set]); return { matchedCount: 0 }; });
  t.mock.method(WhatsAppMessage, "findOneAndUpdate", () => ({ lean: async () => queue.shift() || null }));
  t.mock.method(WhatsAppMessage, "updateOne", async (filter, change) => { updates.push([String(filter._id), change.$set]); });
  const sends = [];
  const sent = await outbox.dispatchDue({
    postText: async (_t, _c, body, options) => { sends.push(options.clientMessageId); return okResponse; },
    loadTenant: async (tenantId) => (String(tenantId) === String(tenant._id) ? tenant : { whatsappSettings: { isEnabled: false } }),
    getCredential: () => "key",
    pauseMs: 0,
  });
  assert.equal(sent, 1);
  assert.equal(bulk[0][1].status, "expired");
  assert.equal(bulk[1][1].status, "queued", "stuck 'sending' messages go back to the queue");
  assert.deepEqual(sends, [String(record._id)], "the record id is the idempotency key");
  assert.equal(updates[0][1].status, "sent");
  assert.equal(updates[1][1].status, "failed");
});

test("delivery receipts move a message forward only (sent → delivered → read)", async (t) => {
  const calls = [];
  t.mock.method(WhatsAppMessage, "updateMany", async (filter, change) => { calls.push([filter, change.$set]); return { matchedCount: 1 }; });
  t.mock.method(WhatsAppMessage, "exists", async () => true);
  const result = await outbox.updateMessageLogDelivery({ tenantId: tenant._id, identifiers: ["777"], status: { code: 3, status: "delivered" } });
  assert.equal(result.matched, true);
  const [filter, set] = calls.at(-1);
  assert.equal(set.status, "delivered");
  assert.deepEqual(filter.status.$in.sort(), ["queued", "sending", "sent"].sort());
  assert.ok(set.deliveredAt instanceof Date);
});

test("a resend is a new queued copy linked to the original; access codes are never resent", async (t) => {
  const original = { _id: id(), tenantId: tenant._id, type: "review", to: "966551234567", text: "قيّمنا", recipientName: "ريان" };
  t.mock.method(WhatsAppMessage, "findOne", (filter) => ({ lean: async () => (String(filter._id) === String(original._id) ? original : { ...original, type: "access_code" }) }));
  t.mock.method(WhatsAppMessage, "create", async (doc) => doc);
  const copy = await outbox.resendMessage(original._id, { tenantId: tenant._id });
  assert.equal(copy.status, "queued");
  assert.equal(String(copy.resendOf), String(original._id));
  assert.equal(copy.text, "قيّمنا");
  await assert.rejects(outbox.resendMessage(id(), { tenantId: tenant._id }), /رموز الدخول/);
});
