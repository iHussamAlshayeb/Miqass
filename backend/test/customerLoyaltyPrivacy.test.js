const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "loyalty-privacy-test-secret";

const Customer = require("../src/models/Customer");
const { getCustomerLoyalty } = require("../src/controllers/dashboardController");
const { getCustomerProfile } = require("../src/controllers/bookingController");

const tenantId = "507f1f77bcf86cd799439011";
const customerId = "507f1f77bcf86cd799439012";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const stubFindOne = async (doc, fn) => {
  const original = Customer.findOne;
  const calls = [];
  Customer.findOne = (filter) => {
    calls.push(filter);
    let selected = "";
    return {
      select(fields) { selected = fields; return this; },
      async lean() {
        if (!doc) return null;
        return Object.fromEntries(Object.entries(doc).filter(([key]) => selected.split(" ").includes(key)));
      },
    };
  };
  try { await fn(calls); } finally { Customer.findOne = original; }
};

const customerDoc = { totalVisits: 4, children: ["سارة", "خالد"] };

test("public loyalty endpoint returns visit count only, never children names", async () => {
  await stubFindOne(customerDoc, async () => {
    const res = response();
    await getCustomerLoyalty({ params: { tenantId, phone: "0551234567" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { visits: 4 });
  });
});

test("public loyalty endpoint rejects malformed input without querying", async () => {
  await stubFindOne(customerDoc, async (calls) => {
    const res = response();
    await getCustomerLoyalty({ params: { tenantId: "x", phone: "0551234567" } }, res);
    assert.equal(res.statusCode, 400);
    const res2 = response();
    await getCustomerLoyalty({ params: { tenantId, phone: "123" } }, res2);
    assert.equal(res2.statusCode, 400);
    assert.equal(calls.length, 0);
  });
});

test("children names require a verified customer token scoped to that customer", async () => {
  await stubFindOne(customerDoc, async (calls) => {
    const denied = response();
    await getCustomerProfile({ get: () => null }, denied);
    assert.equal(denied.statusCode, 401);

    const ownerToken = jwt.sign({ tenantId }, process.env.JWT_SECRET);
    const wrong = response();
    await getCustomerProfile({ get: () => ownerToken }, wrong);
    assert.equal(wrong.statusCode, 401);

    const token = jwt.sign(
      { tenantId, customerId, scope: "customer-bookings" },
      process.env.JWT_SECRET,
      { audience: "customer-bookings", expiresIn: "20m" },
    );
    const ok = response();
    await getCustomerProfile({ get: (name) => (name === "X-Booking-Access" ? token : null) }, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body.children, ["سارة", "خالد"]);
    assert.deepEqual(calls.at(-1), { _id: customerId, tenantId });
  });
});
