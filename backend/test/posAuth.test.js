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
const { signPosToken, posAuth } = require("../src/utils/posAuth");
const { protect } = require("../src/middlewares/authMiddleware");
const { posLogin, updateAppointmentStatusFromPos, createDrawerExpense } = require("../src/controllers/posController");

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
  let active = true;
  stub(t, Cashier, "findOne", () => lean(active ? { _id: cashierId, name: "سالم" } : null));
  stub(t, Tenant, "findById", () => lean({ _id: tenantId }));
  const token = signPosToken({ tenantId, cashierId });

  const ok = await run(posAuth, token);
  assert.equal(ok.passed, true);
  assert.equal(ok.req.posRole, "cashier");
  assert.equal(ok.req.cashier.name, "سالم");
  assert.equal(String(ok.req.tenantId), String(tenantId));

  active = false;
  const stopped = await run(posAuth, token);
  assert.equal(stopped.passed, false);
  assert.equal(stopped.res.statusCode, 401);
});

test("a cashier token cannot open the dashboard", async () => {
  const token = signPosToken({ tenantId: id(), cashierId: id() });
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

test("cashier login: right PIN signs in, wrong PINs count toward a lock", async (t) => {
  const tenant = { _id: id(), salonName: "صالون", posLoginFailures: 0 };
  const pinHash = await bcrypt.hash("4826", 4);
  const updates = [];
  stub(t, Tenant, "findOne", () => lean(tenant));
  stub(t, Tenant, "updateOne", async (filter, change) => { updates.push(change.$set); });
  stub(t, Cashier, "find", () => lean([{ _id: id(), name: "سالم", pinHash }]));
  stub(t, Cashier, "updateOne", async () => {});

  const good = makeRes();
  await posLogin({ body: { slug: "balloon", pin: "4826" } }, good);
  assert.equal(good.statusCode, 200);
  assert.equal(good.body.cashier.name, "سالم");
  assert.equal(jwt.decode(good.body.token).aud, "pos");

  const bad = makeRes();
  await posLogin({ body: { slug: "balloon", pin: "1111" } }, bad);
  assert.equal(bad.statusCode, 401);
  assert.equal(updates.at(-1).posLoginFailures, 1);

  tenant.posLoginFailures = 9;
  const tenth = makeRes();
  await posLogin({ body: { slug: "balloon", pin: "1111" } }, tenth);
  assert.ok(updates.at(-1).posLoginLockedUntil > new Date(), "locked after 10 failures");

  tenant.posLoginLockedUntil = new Date(Date.now() + 60000);
  const locked = makeRes();
  await posLogin({ body: { slug: "balloon", pin: "4826" } }, locked);
  assert.equal(locked.statusCode, 429, "even the right PIN waits while locked");
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
