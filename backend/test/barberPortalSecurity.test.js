const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "barber-portal-test-secret";

const Tenant = require("../src/models/Tenant");
const Barber = require("../src/models/Barber");
const Appointment = require("../src/models/Appointment");
const { getBarberQueue } = require("../src/controllers/barberController");
const { protect } = require("../src/middlewares/authMiddleware");
const {
  verifyPin,
  isValidPin,
  signBarberToken,
} = require("../src/utils/barberPin");

const tenantId = "507f1f77bcf86cd799439011";
const barberId = "507f1f77bcf86cd799439021";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const request = ({ body = {}, headers = {} } = {}) => ({
  body,
  headers,
  get(name) { return headers[name.toLowerCase()] || null; },
});

const chain = (value) => ({
  select() { return this; },
  populate() { return this; },
  async lean() { return value; },
});

const withStubs = async (stubs, fn) => {
  const originals = stubs.map(([obj, key]) => [obj, key, obj[key]]);
  stubs.forEach(([obj, key, impl]) => { obj[key] = impl; });
  try { await fn(); } finally {
    originals.forEach(([obj, key, impl]) => { obj[key] = impl; });
  }
};

test("verifyPin handles hashed, legacy and malicious input", async () => {
  const hashed = await bcrypt.hash("4821", 4);
  assert.deepEqual(await verifyPin(hashed, "4821"), { ok: true, needsUpgrade: false });
  assert.equal((await verifyPin(hashed, "0000")).ok, false);
  assert.deepEqual(await verifyPin("4821", "4821"), { ok: true, needsUpgrade: true });
  assert.equal((await verifyPin("4821", { $ne: null })).ok, false);
  assert.equal((await verifyPin(hashed, { $ne: null })).ok, false);
  assert.equal((await verifyPin("", "")).ok, true);
  assert.equal((await verifyPin("", "1234")).ok, false);
  assert.equal(isValidPin("1234"), true);
  assert.equal(isValidPin("12"), false);
  assert.equal(isValidPin("12a4"), false);
});

test("barber portal rejects NoSQL operator injection without querying", async () => {
  let queried = false;
  await withStubs([[Tenant, "findOne", () => { queried = true; return chain(null); }]], async () => {
    const res = response();
    await getBarberQueue(
      request({ body: { slug: { $ne: null }, barberName: { $ne: null }, pin: { $ne: null } } }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(queried, false);
  });
});

test("barber portal PIN login checks bcrypt hash and issues a scoped token", async () => {
  const hashed = await bcrypt.hash("4821", 4);
  let barberFilter;
  await withStubs([
    [Tenant, "findOne", () => chain({ _id: tenantId, salonName: "صالون" })],
    [Barber, "findOne", (filter) => { barberFilter = filter; return chain({ _id: barberId, name: "محمد", pin: hashed }); }],
    [Appointment, "find", () => chain([])],
  ], async () => {
    const wrong = response();
    await getBarberQueue(request({ body: { slug: "salon", barberName: "محمد", pin: "1111" } }), wrong);
    assert.equal(wrong.statusCode, 401);

    const ok = response();
    await getBarberQueue(request({ body: { slug: "salon", barberName: "محمد", pin: "4821" } }), ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(typeof barberFilter.name, "string");
    assert.equal("pin" in barberFilter, false, "PIN must not be part of the DB filter");
    const payload = jwt.verify(ok.body.token, process.env.JWT_SECRET, { audience: "barber-portal" });
    assert.equal(payload.barberId, barberId);
  });
});

test("barber portal accepts a valid session token and rejects a forged one", async () => {
  await withStubs([
    [Tenant, "findById", () => chain({ _id: tenantId, salonName: "صالون" })],
    [Barber, "findOne", () => chain({ _id: barberId, name: "محمد" })],
    [Appointment, "find", () => chain([])],
  ], async () => {
    const token = signBarberToken({ tenantId, barberId });
    const ok = response();
    await getBarberQueue(request({ headers: { "x-barber-token": token } }), ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.token, undefined);

    const forged = jwt.sign({ tenantId, barberId }, "other-secret", { audience: "barber-portal" });
    const denied = response();
    await getBarberQueue(request({ headers: { "x-barber-token": forged } }), denied);
    assert.equal(denied.statusCode, 401);
  });
});

test("dashboard auth rejects customer and barber tokens", () => {
  const run = (token) => {
    const res = response();
    let passed = false;
    protect({ headers: { authorization: `Bearer ${token}` } }, res, () => { passed = true; });
    return passed;
  };

  assert.equal(run(jwt.sign({ tenantId }, process.env.JWT_SECRET, { expiresIn: "1h" })), true);
  assert.equal(run(signBarberToken({ tenantId, barberId })), false);
  assert.equal(
    run(jwt.sign({ tenantId, scope: "customer-bookings" }, process.env.JWT_SECRET, { audience: "customer-bookings" })),
    false,
  );
});
