const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedOrigin, rejectDisallowedOrigins } = require("../src/utils/corsPolicy");

const run = (origin) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } };
  let passed = false;
  const warn = console.warn; const logs = [];
  console.warn = (line) => logs.push(line);
  try {
    rejectDisallowedOrigins({ headers: origin ? { origin } : {}, method: "POST", originalUrl: "/api/sales?x=1" }, res, () => { passed = true; });
  } finally { console.warn = warn; }
  return { passed, status: res.statusCode, logs };
};

test("allowed origins and server-to-server requests pass", () => {
  assert.equal(isAllowedOrigin("https://www.miqass.app"), true);
  assert.equal(isAllowedOrigin("https://miqass.app"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(run("https://www.miqass.app").passed, true);
  assert.equal(run(undefined).passed, true);
});

test("other origins get a clean 403 with the origin logged", () => {
  for (const origin of ["https://evil.example", "null", "https://www.miqass.app.evil.com", "http://miqass.app"]) {
    const result = run(origin);
    assert.equal(result.passed, false, origin);
    assert.equal(result.status, 403);
    assert.match(result.logs[0], /CORS/);
    assert.ok(result.logs[0].includes("/api/sales"));
    assert.ok(!result.logs[0].includes("x=1"));
  }
});

test("log line cannot be split by injected newlines", () => {
  const { logs } = run("https://a.example\nFAKE LOG LINE");
  assert.equal(logs[0].includes("\n"), false);
});
