const test = require("node:test");
const assert = require("node:assert/strict");

const Tenant = require("../src/models/Tenant");
const Barber = require("../src/models/Barber");
const Service = require("../src/models/Service");
const Review = require("../src/models/Review");
const { getTenantBySlug } = require("../src/controllers/tenantController");

// يحاكي إسقاط MongoDB لقائمة حقول مسموحة (بما فيها المسارات المتداخلة)
const project = (doc, fields) => {
  const out = {};
  for (const path of fields.split(" ")) {
    const parts = path.split(".");
    let src = doc;
    for (const part of parts) src = src?.[part];
    if (src === undefined) continue;
    let dst = out;
    parts.slice(0, -1).forEach((part) => { dst[part] = dst[part] || {}; dst = dst[part]; });
    dst[parts.at(-1)] = src;
  }
  return out;
};

const fullTenant = {
  _id: "507f1f77bcf86cd799439011",
  salonName: "صالون",
  slug: "salon",
  ownerName: "حسام",
  ownerPhone: "0550000000",
  email: "owner@example.com",
  password: "$2a$10$hash",
  resetPasswordToken: "reset-token",
  bio: "نبذة",
  branding: { logoUrl: "/logo.png", primaryColor: "#000000" },
  socialLinks: { instagram: "x" },
  settings: { slotDuration: 30, closedDates: [], isLoyaltyEnabled: true, googleReviewLink: "g" },
  taxSettings: { taxNumber: "300000000000003", zatcaCredentials: { secret: "z" }, zakaty: { apiKey: "k" } },
  whatsappSettings: { apiKey: "WA-SECRET-KEY", isEnabled: true, sessionId: "SESS-ID", webhookSecret: "WH-SECRET" },
  subscription: { plan: "Premium", status: "Active" },
  paymentSettings: { isOnlinePaymentEnabled: true, depositAmount: 20, moyasarSecretKey: "ENC-MOYASAR", moyasarPublishableKey: "PK-MOYASAR" },
  campaignCredits: 500,
  invoiceCounter: 120,
};

const leanChain = (value) => ({
  select() { return this; },
  sort() { return this; },
  async lean() { return value; },
});

test("public tenant endpoint exposes only allow-listed fields", async () => {
  const originals = [Tenant.findOne, Barber.find, Service.find, Review.find];
  let filter;
  Tenant.findOne = (query) => {
    filter = query;
    let fields = "";
    return {
      select(f) { fields = f; return this; },
      async lean() { return project(fullTenant, fields); },
    };
  };
  Barber.find = () => leanChain([{ _id: "b1", name: "محمد", pin: "$2a$10$x", leaves: [] }]);
  Service.find = () => leanChain([]);
  Review.find = () => leanChain([]);

  try {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getTenantBySlug({ params: { slug: { $ne: null } } }, res);
    assert.equal(typeof filter.slug, "string", "slug must be cast to a string");

    await getTenantBySlug({ params: { slug: "salon" } }, res);
    assert.equal(res.statusCode, 200);

    const body = JSON.stringify(res.body);
    for (const secret of ["WA-SECRET-KEY", "SESS-ID", "WH-SECRET", "reset-token", "owner@example.com", "0550000000",
      "300000000000003", "ENC-MOYASAR", "PK-MOYASAR", "$2a$10$hash", "$2a$10$x", "Premium"]) {
      assert.equal(body.includes(secret), false, `leaked: ${secret}`);
    }
    assert.deepEqual(res.body.tenant.whatsappSettings, { isEnabled: true });
    assert.equal(res.body.tenant.campaignCredits, undefined);
    assert.equal(res.body.tenant.settings.slotDuration, 30);
    assert.equal(res.body.tenant.paymentSettings.depositAmount, 20);
    assert.equal(res.body.barbers[0].hasPin, true);
  } finally {
    [Tenant.findOne, Barber.find, Service.find, Review.find] = originals;
  }
});
