const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "kiosk-test-secret";

const Tenant = require("../src/models/Tenant");
const Customer = require("../src/models/Customer");
const { signKioskToken, getKioskCustomer } = require("../src/controllers/booking/kioskController");
const { protect } = require("../src/middlewares/authMiddleware");

const TENANT_ID = "507f1f77bcf86cd799439011";
const query = (value) => ({ select() { return this; }, lean: async () => value });
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const withStubs = async (stubs, fn) => {
  const originals = stubs.map(([target, key, impl]) => { const o = target[key]; target[key] = impl; return [target, key, o]; });
  try { return await fn(); } finally { originals.forEach(([target, key, o]) => { target[key] = o; }); }
};

test("an activated kiosk sees saved names without a verification code", async () => {
  const token = signKioskToken({ tenantId: TENANT_ID, version: 2 });
  const res = response();
  let lookup;
  await withStubs([
    [Tenant, "findById", () => query({ _id: TENANT_ID, kioskTokenVersion: 2 })],
    [Customer, "findOne", (filter) => { lookup = filter; return query({ totalVisits: 3, children: ["سارة", "خالد"] }); }],
  ], () => getKioskCustomer({ headers: { "x-kiosk-token": token }, params: { phone: "0551234567" } }, res));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { visits: 3, children: ["سارة", "خالد"] });
  assert.deepEqual(lookup, { tenantId: TENANT_ID, phone: "0551234567" });
});

test("without a kiosk key, or with a revoked one, names are not returned", async () => {
  const missing = response();
  await getKioskCustomer({ headers: {}, params: { phone: "0551234567" } }, missing);
  assert.equal(missing.statusCode, 401);

  const revoked = response();
  const oldToken = signKioskToken({ tenantId: TENANT_ID, version: 0 });
  await withStubs([
    [Tenant, "findById", () => query({ _id: TENANT_ID, kioskTokenVersion: 1 })],
    [Customer, "findOne", () => { throw new Error("must not look up customers"); }],
  ], () => getKioskCustomer({ headers: { "x-kiosk-token": oldToken }, params: { phone: "0551234567" } }, revoked));
  assert.equal(revoked.statusCode, 401);

  const ownerToken = jwt.sign({ id: TENANT_ID }, process.env.JWT_SECRET);
  const wrongAudience = response();
  await getKioskCustomer({ headers: { "x-kiosk-token": ownerToken }, params: { phone: "0551234567" } }, wrongAudience);
  assert.equal(wrongAudience.statusCode, 401, "a dashboard token is not a kiosk key");
});

test("a kiosk key cannot open the salon dashboard", async () => {
  const token = signKioskToken({ tenantId: TENANT_ID, version: 0 });
  const res = response();
  let nextCalled = false;
  await protect({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("with the lock on, kiosk bookings are refused from a device that is not activated", async () => {
  const { createAppointment } = require("../src/controllers/booking/publicBookingController");
  const Appointment = require("../src/models/Appointment");
  const tenant = { _id: TENANT_ID, kioskTokenVersion: 0, kioskLockEnabled: true, settings: {}, subscription: { status: "Active", plan: "Pro" } };
  const body = { tenantId: TENANT_ID, customerPhone: "0551234567", childrenNames: ["خالد"] };

  for (const bookingSource of ["kiosk_walk_in", "kiosk"]) {
    const res = response();
    await withStubs([[Tenant, "findById", () => query(tenant)], [Appointment, "init", async () => {}]], () =>
      createAppointment({ headers: {}, body: { ...body, bookingSource, date: "2026-10-06", timeSlot: "18:00", chair: "محمد" } }, res));
    assert.equal(res.statusCode, 403, bookingSource);
    assert.equal(res.body.code, "KIOSK_NOT_ACTIVATED");
  }

  const otherSalonKey = signKioskToken({ tenantId: "507f1f77bcf86cd799439099", version: 0 });
  const res = response();
  await withStubs([[Tenant, "findById", () => query(tenant)], [Appointment, "init", async () => {}]], () =>
    createAppointment({ headers: { "x-kiosk-token": otherSalonKey }, body: { ...body, bookingSource: "kiosk_walk_in" } }, res));
  assert.equal(res.statusCode, 403, "a key from another salon does not work");
});

const { encrypt } = require("../src/utils/encryption");
const {
  isKioskRequestAllowed,
  getKioskStatus,
  activateKioskWithCode,
  verifyKioskToken,
} = require("../src/controllers/booking/kioskController");

test("with the lock off (existing salons), the kiosk keeps working without activation", () => {
  assert.equal(isKioskRequestAllowed({ headers: {} }, { _id: TENANT_ID }), true);
  assert.equal(isKioskRequestAllowed({ headers: {} }, { _id: TENANT_ID, kioskLockEnabled: false }), true);
  assert.equal(isKioskRequestAllowed({ headers: {} }, { _id: TENANT_ID, kioskLockEnabled: true }), false);
});

test("kiosk status: unlocked salons run, locked salons need an activated device", async () => {
  const unlocked = response();
  await withStubs([[Tenant, "findOne", () => query({ _id: TENANT_ID, slug: "balloon" })]], () =>
    getKioskStatus({ headers: {}, query: { slug: "balloon" } }, unlocked));
  assert.equal(unlocked.statusCode, 200);
  assert.equal(unlocked.body.activated, false);

  const locked = response();
  await withStubs([[Tenant, "findOne", () => query({ _id: TENANT_ID, slug: "balloon", kioskLockEnabled: true })]], () =>
    getKioskStatus({ headers: {}, query: { slug: "balloon" } }, locked));
  assert.equal(locked.statusCode, 401);
});

test("the activation code issues a kiosk key; wrong codes are counted and lock out", async () => {
  const salon = { _id: TENANT_ID, slug: "balloon", kioskTokenVersion: 3, kioskActivationCode: encrypt("482913"), kioskCodeFailures: 0 };

  const ok = response();
  await withStubs([[Tenant, "findOne", () => query(salon)], [Tenant, "updateOne", async () => ({})]], () =>
    activateKioskWithCode({ body: { slug: "balloon", code: "482913" } }, ok));
  assert.equal(ok.statusCode, 200);
  const payload = verifyKioskToken(ok.body.token);
  assert.equal(payload.tenantId, TENANT_ID);
  assert.equal(payload.v, 3);

  const wrong = response();
  let failureUpdate;
  await withStubs([[Tenant, "findOne", () => query(salon)], [Tenant, "updateOne", async (filter, update) => { failureUpdate = update; return {}; }]], () =>
    activateKioskWithCode({ body: { slug: "balloon", code: "000000" } }, wrong));
  assert.equal(wrong.statusCode, 400);
  assert.deepEqual(failureUpdate, { $set: { kioskCodeFailures: 1 } });

  let lockUpdate;
  await withStubs([[Tenant, "findOne", () => query({ ...salon, kioskCodeFailures: 9 })], [Tenant, "updateOne", async (filter, update) => { lockUpdate = update; return {}; }]], () =>
    activateKioskWithCode({ body: { slug: "balloon", code: "000000" } }, response()));
  assert.ok(lockUpdate.$set.kioskCodeLockedUntil > new Date(), "the tenth wrong code locks activation for a while");

  const lockedOut = response();
  await withStubs([[Tenant, "findOne", () => query({ ...salon, kioskCodeLockedUntil: new Date(Date.now() + 60000) })]], () =>
    activateKioskWithCode({ body: { slug: "balloon", code: "482913" } }, lockedOut));
  assert.equal(lockedOut.statusCode, 429, "even the right code waits during the lockout");
});
