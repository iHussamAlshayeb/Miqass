const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");
const { directives } = require("../src/config/csp");

test("CSP is sent in report-only mode by default and allows the known third parties", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/api/csp-report`, {
      method: "POST",
      headers: { "Content-Type": "application/csp-report" },
      body: JSON.stringify({ "csp-report": { "document-uri": "https://www.miqass.app/x", "violated-directive": "script-src", "blocked-uri": "https://evil.example" } }),
    });
    assert.equal(res.status, 204);
    const header = res.headers.get("content-security-policy-report-only");
    assert.ok(header, "report-only header present");
    assert.equal(res.headers.get("content-security-policy"), null, "nothing is enforced yet");
    assert.match(header, /script-src 'self' https:\/\/cdn\.moyasar\.com/);
    assert.match(header, /object-src 'none'/);
    assert.match(header, /report-uri \/api\/csp-report/);

    const reportingApi = await fetch(`${base}/api/csp-report`, {
      method: "POST",
      headers: { "Content-Type": "application/reports+json" },
      body: JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "http://x" } }]),
    });
    assert.equal(reportingApi.status, 204);
  } finally {
    server.close();
  }
  assert.ok(!directives.scriptSrc.includes("'unsafe-inline'"), "inline scripts stay blocked");
  assert.ok(!directives.scriptSrc.includes("'unsafe-eval'"));
});
