const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const Cashier = require("../src/models/Cashier");
const Tenant = require("../src/models/Tenant");
const CashShift = require("../src/models/CashShift");
const Expense = require("../src/models/Expense");
const PosDevice = require("../src/models/PosDevice");
const { sha256, isWeakPin } = require("../src/utils/posDevice");
const { signPosToken, posAuth } = require("../src/utils/posAuth");
const { protect } = require("../src/middlewares/authMiddleware");
const {
  posLogin, updateAppointmentStatusFromPos, createDrawerExpense, activateWithCode, createCashier,
} = require("../src/controllers/posController");

const id = () => new mongoose.Types.ObjectId();
const makeRes = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const stub = (t, obj, key, fn) => { const original = obj[key]; obj[key] = fn; t.after(() => { obj[key] = original; }); };
const lean = (value) => ({ select() { return this; }, lean: async () => value });
const run = async (middleware, token) => {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = makeRes();
  let passed = false;
  await middleware(req, res, () => { passed = true; });
  return { req, res, passed };
};

test("a cashier token opens the POS for an active cashier only", async (t) => {
  const tenantId = id(); const cashierId = id();
  const deviceId = id();
  let active = true;
  let deviceActive = true;
  stub(t, Cashier, "findOne", () => lean(active ? { _id: cashierId, name: "سالم" } : null));
  stub(t, Tenant, "findById", () => lean({ _id: tenantId }));
  stub(t, PosDevice, "findOne", () => lean(deviceActive ? { _id: deviceId } : null));
  const token = signPosToken({ tenantId, cashierId, deviceId });

  const ok = await run(posAuth, token);
  assert.equal(ok.passed, true);
  assert.equal(ok.req.posRole, "cashier");
  assert.equal(ok.req.cashier.name, "سالم");
  assert.equal(String(ok.req.tenantId), String(tenantId));

  assert.equal(ok.req.posDeviceId, String(deviceId));

  // إلغاء الجهاز يوقف الجلسة فوراً
  deviceActive = false;
  const revoked = await run(posAuth, token);
  assert.equal(revoked.passed, false);
  assert.equal(revoked.res.body.code, "POS_DEVICE_NOT_ACTIVATED");

  deviceActive = true;
  active = false;
  const stopped = await run(posAuth, token);
  assert.equal(stopped.passed, false);
  assert.equal(stopped.res.statusCode, 401);

  // توكن قديم بلا جهاز لا يُقبل
  const legacy = jwt.sign({ tenantId: String(tenantId), cashierId: String(cashierId), scope: "pos" }, process.env.JWT_SECRET, { audience: "pos" });
  assert.equal((await run(posAuth, legacy)).passed, false);
});

test("a cashier token cannot open the dashboard", async () => {
  const token = signPosToken({ tenantId: id(), cashierId: id(), deviceId: id() });
  const dashboard = await run(protect, token);
  assert.equal(dashboard.passed, false);
  assert.equal(dashboard.res.statusCode, 401);
});

test("expired cashier tokens ask for the PIN again; kiosk tokens are refused", async () => {
  const expired = jwt.sign({ tenantId: String(id()), cashierId: String(id()), scope: "pos" }, process.env.JWT_SECRET, { audience: "pos", expiresIn: -10 });
  const late = await run(posAuth, expired);
  assert.equal(late.passed, false);
  assert.equal(late.res.statusCode, 401);
  assert.match(late.res.body.message, /رمزك/);

  const kiosk = jwt.sign({ tenantId: String(id()), scope: "kiosk" }, process.env.JWT_SECRET, { audience: "kiosk" });
  const refused = await run(posAuth, kiosk);
  assert.equal(refused.passed, false);
  assert.equal(refused.res.statusCode, 401);
});

test("the owner's dashboard token still opens the POS", async (t) => {
  const tenantId = id();
  stub(t, Tenant, "findById", () => lean({ _id: tenantId }));
  const owner = jwt.sign({ tenantId: String(tenantId) }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const result = await run(posAuth, owner);
  assert.equal(result.passed, true);
  assert.equal(result.req.posRole, "owner");
});

test("cashier login works only from an activated device, and wrong PINs lock it", async (t) => {
  const tenant = { _id: id(), salonName: "صالون", posLoginFailures: 0 };
  const device = { _id: id(), tenantId: tenant._id, name: "الكاشير", loginFailures: 0 };
  const DEVICE_TOKEN = "device-token-abc";
  const pinHash = await bcrypt.hash("4826", 4);
  const deviceUpdates = [];
  let lookedUpHash = null;
  stub(t, PosDevice, "findOne", (filter) => { lookedUpHash = filter.tokenHash; return lean(filter.tokenHash === sha256(DEVICE_TOKEN) ? device : null); });
  stub(t, PosDevice, "updateOne", async (filter, change) => { deviceUpdates.push(change.$set); });
  stub(t, Tenant, "findById", () => lean(tenant));
  stub(t, Tenant, "updateOne", async () => {});
  stub(t, Cashier, "find", () => lean([{ _id: id(), name: "سالم", pinHash }]));
  stub(t, Cashier, "updateOne", async () => {});

  // رابط الصالون + الرمز الصحيح بدون جهاز مفعّل: مرفوض
  const noDevice = makeRes();
  await posLogin({ body: { slug: "balloon", pin: "4826" } }, noDevice);
  assert.equal(noDevice.statusCode, 403);
  assert.equal(noDevice.body.code, "POS_DEVICE_NOT_ACTIVATED");

  const fakeDevice = makeRes();
  await posLogin({ body: { deviceToken: "guess", pin: "4826" } }, fakeDevice);
  assert.equal(fakeDevice.statusCode, 403);
  assert.notEqual(lookedUpHash, "guess", "only the token hash is looked up");

  const good = makeRes();
  await posLogin({ body: { deviceToken: DEVICE_TOKEN, pin: "4826" } }, good);
  assert.equal(good.statusCode, 200);
  assert.equal(good.body.cashier.name, "سالم");
  assert.equal(jwt.decode(good.body.token).deviceId, String(device._id));

  const bad = makeRes();
  await posLogin({ body: { deviceToken: DEVICE_TOKEN, pin: "9157" } }, bad);
  assert.equal(bad.statusCode, 401);
  assert.equal(deviceUpdates.at(-1).loginFailures, 1);

  device.loginFailures = 4;
  const fifth = makeRes();
  await posLogin({ body: { deviceToken: DEVICE_TOKEN, pin: "9157" } }, fifth);
  assert.ok(deviceUpdates.at(-1).lockedUntil > new Date(), "device locked after 5 failures");

  device.lockedUntil = new Date(Date.now() + 60000);
  const locked = makeRes();
  await posLogin({ body: { deviceToken: DEVICE_TOKEN, pin: "4826" } }, locked);
  assert.equal(locked.statusCode, 429, "even the right PIN waits while locked");
});

test("an activation code works once, expires, and is dropped after 5 wrong tries", async (t) => {
  const CODE = "AB23CD45";
  const tenant = { _id: id(), posActivationCodeHash: sha256(CODE), posActivationCodeExpiresAt: new Date(Date.now() + 60000), posActivationFailures: 0 };
  const tenantUpdates = [];
  let consumed = false;
  stub(t, Tenant, "findOne", () => ({ select() { return this; }, lean: async () => ({ ...tenant }) }));
  stub(t, Tenant, "updateOne", async (filter, change) => {
    tenantUpdates.push(change.$set);
    if (filter.posActivationCodeHash) { const first = !consumed; consumed = true; return { modifiedCount: first ? 1 : 0 }; }
    return { modifiedCount: 1 };
  });
  stub(t, PosDevice, "countDocuments", async () => 0);
  stub(t, PosDevice, "create", async (doc) => ({ ...doc, _id: id(), createdAt: new Date() }));

  const wrong = makeRes();
  await activateWithCode({ body: { slug: "balloon", code: "ZZZZ9999" } }, wrong);
  assert.equal(wrong.statusCode, 400);
  assert.equal(tenantUpdates.at(-1).posActivationFailures, 1);

  const ok = makeRes();
  await activateWithCode({ body: { slug: "balloon", code: "ab23-cd45", name: "كاونتر" } }, ok);
  assert.equal(ok.statusCode, 201);
  assert.ok(ok.body.deviceToken.length >= 40);
  assert.equal(ok.body.device.name, "كاونتر");

  const reuse = makeRes();
  await activateWithCode({ body: { slug: "balloon", code: CODE } }, reuse);
  assert.equal(reuse.statusCode, 400, "the same code cannot activate a second device");

  tenant.posActivationFailures = 4;
  const fifth = makeRes();
  await activateWithCode({ body: { slug: "balloon", code: "ZZZZ9999" } }, fifth);
  assert.equal(tenantUpdates.at(-1).posActivationCodeHash, "", "code dropped after 5 failures");

  tenant.posActivationFailures = 0;
  tenant.posActivationCodeExpiresAt = new Date(Date.now() - 1000);
  const expired = makeRes();
  await activateWithCode({ body: { slug: "balloon", code: CODE } }, expired);
  assert.equal(expired.statusCode, 400);
});

test("easy-to-guess cashier PINs are refused", async () => {
  for (const pin of ["1234", "1111", "4321", "123456", "1212", "000000", "2580", "121212"]) assert.equal(isWeakPin(pin), true, pin);
  for (const pin of ["4826", "739154", "9157"]) assert.equal(isWeakPin(pin), false, pin);
  const res = makeRes();
  await createCashier({ tenantId: id(), body: { name: "سالم", pin: "1234" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /سهل التخمين/);
});

test("the POS may only complete or cancel appointments", async () => {
  const res = makeRes();
  updateAppointmentStatusFromPos({ params: { appointmentId: String(id()) }, body: { status: "Booked" } }, res);
  assert.equal(res.statusCode, 400);
});

test("a drawer expense needs an open shift and is tied to it", async (t) => {
  const shiftId = id();
  let open = null;
  let created = null;
  stub(t, CashShift, "findOne", () => lean(open));
  stub(t, Expense, "create", async (doc) => { created = doc; return doc; });

  const noShift = makeRes();
  await createDrawerExpense({ tenantId: "t1", body: { amount: 12, description: "ماء" } }, noShift);
  assert.equal(noShift.statusCode, 409);

  const badAmount = makeRes();
  await createDrawerExpense({ tenantId: "t1", body: { amount: -3, description: "ماء" } }, badAmount);
  assert.equal(badAmount.statusCode, 400);

  open = { _id: shiftId };
  const ok = makeRes();
  await createDrawerExpense({ tenantId: "t1", cashier: { name: "سالم" }, body: { amount: "12.5", description: "ماء" } }, ok);
  assert.equal(ok.statusCode, 201);
  assert.equal(created.amount, 12.5);
  assert.equal(created.paymentMethod, "cash");
  assert.equal(String(created.shiftId), String(shiftId));
  assert.equal(created.recordedBy, "سالم");
});
