const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const rateLimit = require("../src/middlewares/rateLimit");
const { getClientIp } = rateLimit;

const fakeReq = (remoteAddress, cfIp, ip = "10.0.0.9") => ({
  ip,
  socket: { remoteAddress },
  get: (name) => (name.toLowerCase() === "cf-connecting-ip" ? cfIp : undefined),
});

test("CF-Connecting-IP is trusted only when the request comes from the internal tunnel", () => {
  assert.equal(getClientIp(fakeReq("172.18.0.3", "203.0.113.7")), "203.0.113.7");
  assert.equal(getClientIp(fakeReq("::ffff:172.18.0.3", "203.0.113.7")), "203.0.113.7");
  assert.equal(getClientIp(fakeReq("198.51.100.4", "203.0.113.7", "198.51.100.4")), "198.51.100.4");
  assert.equal(getClientIp(fakeReq("172.18.0.3", "not-an-ip", "172.18.0.3")), "172.18.0.3");
});

test("each real client behind the tunnel gets its own rate-limit bucket", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/limited", rateLimit({ windowMs: 60_000, max: 2 }), (req, res) => res.send("ok"));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/limited`;
  const hit = (ip) => fetch(base, { headers: { "CF-Connecting-IP": ip } }).then((r) => r.status);

  try {
    assert.deepEqual([await hit("203.0.113.1"), await hit("203.0.113.1"), await hit("203.0.113.1")], [200, 200, 429]);
    assert.equal(await hit("203.0.113.2"), 200, "another visitor must not be blocked");
  } finally {
    server.close();
  }
});
