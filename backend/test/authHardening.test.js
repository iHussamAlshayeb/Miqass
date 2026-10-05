const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "auth-hardening-test-secret";

const Tenant = require("../src/models/Tenant");
const {
  loginTenant,
  forgotPassword,
  resetPassword,
  registerTenant,
} = require("../src/controllers/authController");
const { protect } = require("../src/middlewares/authMiddleware");

const tenantId = "507f1f77bcf86cd799439011";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const withStub = async (obj, key, impl, fn) => {
  const original = obj[key];
  obj[key] = impl;
  try { return await fn(); } finally { obj[key] = original; }
};

test("login returns one generic error for unknown email and wrong password", async () => {
  const hash = await bcrypt.hash("correct-password", 4);
  const lookups = [];
  await withStub(Tenant, "findOne", (filter) => {
    lookups.push(filter);
    return { async lean() { return filter.email === "owner@example.com" ? { _id: tenantId, password: hash, subscription: { status: "Active" } } : null; } };
  }, async () => {
    const unknown = response();
    await loginTenant({ body: { email: "nobody@example.com", password: "x" } }, unknown);
    const wrong = response();
    await loginTenant({ body: { email: "OWNER@example.com ", password: "wrong" } }, wrong);
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.body.message, wrong.body.message);
    assert.equal(lookups[1].email, "owner@example.com", "email is normalized");

    const injected = response();
    await loginTenant({ body: { email: { $ne: null }, password: { $ne: null } } }, injected);
    assert.equal(injected.statusCode, 401);
    assert.equal(lookups.length, 2, "operator objects never reach the database");
  });
});

test("forgot password does not reveal whether the email exists and stores only a hash", async () => {
  let saved;
  const fixed = Buffer.alloc(32, 7);
  const rawToken = fixed.toString("hex");
  const tenantDoc = {
    email: "owner@example.com",
    ownerName: "حسام",
    async save() { saved = { token: this.resetPasswordToken, expires: this.resetPasswordExpires }; },
  };
  await withStub(crypto, "randomBytes", () => fixed, async () => {
    await withStub(Tenant, "findOne", (filter) => (filter.email === "owner@example.com" ? tenantDoc : null), async () => {
      const unknown = response();
      await forgotPassword({ body: { email: "nobody@example.com" } }, unknown);
      const known = response();
      await forgotPassword({ body: { email: "owner@example.com" } }, known);
      assert.equal(unknown.statusCode, 200);
      assert.equal(unknown.body.message, known.body.message);
    });
  });

  assert.notEqual(saved.token, rawToken, "raw token must not be stored");
  assert.equal(saved.token, crypto.createHash("sha256").update(rawToken).digest("hex"));
});

test("reset password looks up the hashed token, enforces length and revokes old sessions", async () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  let filter;
  const tenantDoc = { async save() { this.saved = true; } };

  await withStub(Tenant, "findOne", (f) => { filter = f; return tenantDoc; }, async () => {
    const short = response();
    await resetPassword({ params: { token: rawToken }, body: { newPassword: "123" } }, short);
    assert.equal(short.statusCode, 400);

    const ok = response();
    await resetPassword({ params: { token: rawToken }, body: { newPassword: "a-strong-pass" } }, ok);
    assert.equal(ok.statusCode, 200);
  });

  assert.equal(filter.resetPasswordToken, crypto.createHash("sha256").update(rawToken).digest("hex"));
  assert.equal(tenantDoc.saved, true);
  assert.ok(tenantDoc.passwordChangedAt instanceof Date);
  assert.equal(await bcrypt.compare("a-strong-pass", tenantDoc.password), true);
});

test("registration rejects short passwords and non-string fields", async () => {
  let queried = false;
  await withStub(Tenant, "findOne", () => { queried = true; return { async lean() { return null; } }; }, async () => {
    const base = { salonName: "صالون", slug: "salon", ownerName: "حسام", ownerPhone: "0550000000", email: "a@b.co" };
    const short = response();
    await registerTenant({ body: { ...base, password: "1234567" } }, short);
    assert.equal(short.statusCode, 400);
    const injected = response();
    await registerTenant({ body: { ...base, email: { $ne: null }, password: "long-enough" } }, injected);
    assert.equal(injected.statusCode, 400);
  });
  assert.equal(queried, false);
});

test("sessions issued before a password change are rejected", async () => {
  const issuedAt = Math.floor(Date.now() / 1000) - 3600;
  const oldToken = jwt.sign({ tenantId, iat: issuedAt }, process.env.JWT_SECRET);
  const newToken = jwt.sign({ tenantId }, process.env.JWT_SECRET);
  const changedAt = new Date(Date.now() - 60 * 1000);

  await withStub(Tenant, "findById", () => ({ select() { return this; }, async lean() { return { _id: tenantId, passwordChangedAt: changedAt }; } }), async () => {
    const run = async (token) => {
      const res = response();
      let passed = false;
      await protect({ headers: { authorization: `Bearer ${token}` } }, res, () => { passed = true; });
      return { passed, res };
    };
    const old = await run(oldToken);
    assert.equal(old.passed, false);
    assert.equal(old.res.statusCode, 401);
    assert.equal(old.res.body.isExpired, true);
    assert.equal((await run(newToken)).passed, true);
  });

  await withStub(Tenant, "findById", () => ({ select() { return this; }, async lean() { return null; } }), async () => {
    const res = response();
    let passed = false;
    await protect({ headers: { authorization: `Bearer ${newToken}` } }, res, () => { passed = true; });
    assert.equal(passed, false, "deleted tenants lose access");
  });
});
