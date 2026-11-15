const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const Tenant = require("../src/models/Tenant");
const { disconnectZakatyConfig } = require("../src/controllers/zatcaController");

const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const stubTenant = (t, zakaty) => {
  t.mock.method(Tenant, "findById", () => ({ select: () => ({ lean: async () => ({ taxSettings: { zakaty } }) }) }));
  return t.mock.method(Tenant, "findByIdAndUpdate", (id, update) => ({ lean: async () => ({ taxSettings: { zakaty: { seller: zakaty.seller } } , update }) }));
};
const linked = {
  apiKey: "enc", apiKeyId: "", tenantId: "zk-tenant", egsUnitId: "egs-1",
  registeredVatNumber: "300000000000003", registeredCrNumber: "1010", keyIssuingAt: null,
  setup: { status: "ready" }, seller: { legalName: "مؤسسة", crNumber: "1010", street: "ش", buildingNumber: "1", city: "الرياض", postalCode: "12345" },
};

test("full disconnect clears every linking field but keeps the seller address", async (t) => {
  const update = stubTenant(t, linked);
  const res = response();
  await disconnectZakatyConfig({ tenantId: "t" }, res);
  assert.equal(res.statusCode, 200);
  const set = update.mock.calls[0].arguments[1].$set;
  for (const key of ["apiKey", "apiKeyId", "tenantId", "egsUnitId", "registeredVatNumber", "registeredCrNumber"]) {
    assert.equal(set[`taxSettings.zakaty.${key}`], "", key);
  }
  assert.equal(set["taxSettings.zakaty.setup"].status, "");
  assert.equal(Object.keys(set).some((key) => key.includes("seller") || key.includes("taxNumber")), false);
  assert.equal(res.body.config.isProvisioned, false);
  assert.equal(res.body.config.seller.city, "الرياض");
});

test("disconnect is allowed while waiting for OTP or after a failed setup", async (t) => {
  for (const status of ["awaiting_otp", "attention"]) {
    const update = stubTenant(t, { ...linked, setup: { status } });
    const res = response();
    await disconnectZakatyConfig({ tenantId: "t" }, res);
    assert.equal(res.statusCode, 200, status);
    assert.equal(update.mock.callCount(), 1);
    t.mock.restoreAll();
  }
});

test("disconnect waits for a setup step that is running right now", async (t) => {
  const update = stubTenant(t, { ...linked, setup: { status: "preparing", lockUntil: new Date(Date.now() + 60000) } });
  const res = response();
  await disconnectZakatyConfig({ tenantId: "t" }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(update.mock.callCount(), 0);
});

test("a stale setup lock does not block disconnect", async (t) => {
  const update = stubTenant(t, { ...linked, setup: { status: "preparing", lockUntil: new Date(Date.now() - 1000) } });
  const res = response();
  await disconnectZakatyConfig({ tenantId: "t" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(update.mock.callCount(), 1);
});

test("nothing is cleared locally if Zakaty refuses to revoke the key", async (t) => {
  const update = stubTenant(t, { ...linked, apiKeyId: "key-1" });
  t.mock.method(axios, "post", async () => { throw new Error("down"); });
  const res = response();
  await disconnectZakatyConfig({ tenantId: "t" }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(update.mock.callCount(), 0);
});

test("an unresolved key issuance blocks disconnect", async (t) => {
  const update = stubTenant(t, { ...linked, keyIssuingAt: new Date() });
  const res = response();
  await disconnectZakatyConfig({ tenantId: "t" }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(update.mock.callCount(), 0);
});
