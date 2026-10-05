const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const axios = require("axios");

const {
  encrypt,
  decrypt,
  isEncrypted,
  isLegacyEncrypted,
  hashForLookup,
} = require("../src/utils/encryption");
const Tenant = require("../src/models/Tenant");
const { upgradeStoredSecrets } = require("../src/utils/startupMigrations");
const { sendBookingAccessCode } = require("../src/utils/whatsapp");
const { handleWhatsappWebhook } = require("../src/controllers/whatsappController");
const { updateWhatsappSettings } = require("../src/controllers/dashboardController");

// يحاكي التشفير القديم (CBC + scrypt بملح ثابت) لاختبار التوافق والترحيل
const legacyEncrypt = (text) => {
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || "local_development_key_only", "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  return `${iv.toString("hex")}:${Buffer.concat([cipher.update(text), cipher.final()]).toString("hex")}`;
};

test("v2 encryption round-trips, detects tampering and still reads legacy values", () => {
  const value = encrypt("sk_live_secret");
  assert.match(value, /^v2:/);
  assert.notEqual(encrypt("sk_live_secret"), value, "random IV per value");
  assert.equal(decrypt(value), "sk_live_secret");

  const tampered = value.slice(0, -2) + (value.endsWith("00") ? "11" : "00");
  assert.equal(decrypt(tampered), null);

  const legacy = legacyEncrypt("old-secret");
  assert.equal(isLegacyEncrypted(legacy), true);
  assert.equal(decrypt(legacy), "old-secret");

  assert.equal(decrypt("plain-api-key"), "plain-api-key");
  assert.equal(isEncrypted("plain-api-key"), false);
  assert.equal(hashForLookup("k"), hashForLookup("k"));
  assert.notEqual(hashForLookup("k"), hashForLookup("k2"));
});

test("startup migration upgrades legacy secrets and encrypts plaintext ones", async () => {
  const docs = [{
    _id: "t1",
    paymentSettings: { moyasarSecretKey: legacyEncrypt("sk_live_1") },
    taxSettings: { zakaty: { apiKey: encrypt("zk") } },
    whatsappSettings: { apiKey: "wa-plain-key" },
  }, {
    _id: "t2",
    paymentSettings: { moyasarSecretKey: "a".repeat(32) + ":" + "b".repeat(32) }, // قديم تالف
  }];
  const updates = [];
  const original = Object.getOwnPropertyDescriptor(Tenant, "collection");
  Object.defineProperty(Tenant, "collection", {
    configurable: true,
    value: {
      find: () => ({ async *[Symbol.asyncIterator]() { yield* docs; } }),
      updateOne: async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; },
    },
  });
  try {
    await upgradeStoredSecrets();
  } finally {
    if (original) Object.defineProperty(Tenant, "collection", original);
    else delete Tenant.collection;
  }

  assert.equal(updates.length, 1, "corrupted legacy value is left untouched");
  const set = updates[0].update.$set;
  assert.equal(decrypt(set["paymentSettings.moyasarSecretKey"]), "sk_live_1");
  assert.match(set["paymentSettings.moyasarSecretKey"], /^v2:/);
  assert.equal(decrypt(set["whatsappSettings.apiKey"]), "wa-plain-key");
  assert.equal(set["whatsappSettings.apiKeyHash"], hashForLookup("wa-plain-key"));
  assert.equal(set["taxSettings.zakaty.apiKey"], undefined, "v2 values are not rewritten");
  assert.equal(updates[0].filter["whatsappSettings.apiKey"], "wa-plain-key", "optimistic filter");
});

test("WhatsApp sends decrypt the stored key only at request time", async () => {
  const original = axios.post;
  let auth;
  axios.post = async (_url, _body, config) => { auth = config.headers.Authorization; return { data: {} }; };
  try {
    const ok = await sendBookingAccessCode("0551234567", "123456", {
      salonName: "صالون",
      whatsappSettings: { isEnabled: true, apiKey: encrypt("wa-real-key") },
    });
    assert.equal(ok, true);
    assert.equal(auth, "Bearer wa-real-key");
  } finally {
    axios.post = original;
  }
});

test("webhook finds tenants by key hash, never by the raw key", async () => {
  const original = Tenant.findOne;
  let filter;
  Tenant.findOne = (f) => { filter = f; return { select() { return this; }, async lean() { return null; } }; };
  try {
    const res = { status() { return this; }, json() { return this; } };
    await handleWhatsappWebhook({
      headers: { "x-webhook-signature": "sig" },
      body: { event: "session.status", sessionId: "wa-real-key", data: { api_key: "wa-real-key" } },
    }, res);
  } finally {
    Tenant.findOne = original;
  }
  const conditions = filter.$or;
  assert.equal(conditions.some((c) => "whatsappSettings.apiKey" in c), false);
  for (const c of conditions.filter((c) => "whatsappSettings.apiKeyHash" in c)) {
    assert.notEqual(c["whatsappSettings.apiKeyHash"], "wa-real-key");
    assert.match(c["whatsappSettings.apiKeyHash"], /^[0-9a-f]{64}$/);
  }
});

test("manual WhatsApp key update stores ciphertext and never echoes the key", async () => {
  const original = Tenant.findByIdAndUpdate;
  let update;
  Tenant.findByIdAndUpdate = (_id, u) => {
    update = u.$set;
    return { async lean() { return { whatsappSettings: { apiKey: update["whatsappSettings.apiKey"], isEnabled: true } }; } };
  };
  try {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await updateWhatsappSettings({ tenantId: "t1", body: { apiKey: " wa-new ", isEnabled: true } }, res);
    assert.equal(decrypt(update["whatsappSettings.apiKey"]), "wa-new");
    assert.equal(update["whatsappSettings.apiKeyHash"], hashForLookup("wa-new"));
    assert.deepEqual(res.body.whatsappSettings, { isEnabled: true, sessionStatus: "DISCONNECTED", hasApiKey: true });
  } finally {
    Tenant.findByIdAndUpdate = original;
  }
});
