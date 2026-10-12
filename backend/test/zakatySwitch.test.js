const test = require("node:test");
const assert = require("node:assert/strict");
const { getBaseUrl, summarizeZakatyError } = require("../src/services/zakatyClient");
const { requireZakatyEnabled, isZakatyEnabled } = require("../src/utils/zakatySwitch");

const withEnv = (value, fn) => {
  const previous = process.env.ZAKATY_ENABLED;
  if (value === undefined) delete process.env.ZAKATY_ENABLED; else process.env.ZAKATY_ENABLED = value;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env.ZAKATY_ENABLED; else process.env.ZAKATY_ENABLED = previous;
  }
};

test("Zakaty is off unless explicitly enabled", () => {
  withEnv(undefined, () => assert.equal(isZakatyEnabled(), false));
  withEnv("false", () => assert.equal(isZakatyEnabled(), false));
  withEnv("TRUE", () => assert.equal(isZakatyEnabled(), true));
});

test("no outbound Zakaty URL is produced while disabled", () => {
  withEnv(undefined, () => {
    let error;
    try { getBaseUrl(); } catch (e) { error = e; }
    assert.ok(error?.zakatyDisabled);
    assert.equal(summarizeZakatyError(error).status, 503);
  });
});

test("Zakaty routes answer 503 while disabled", () => {
  withEnv(undefined, () => {
    let status = 0; let nextCalled = false;
    const res = { status: (code) => { status = code; return res; }, json: () => res };
    requireZakatyEnabled({}, res, () => { nextCalled = true; });
    assert.equal(status, 503);
    assert.equal(nextCalled, false);
  });
});
