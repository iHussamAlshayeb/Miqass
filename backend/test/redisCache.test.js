const test = require("node:test");
const assert = require("node:assert/strict");
const { createCache } = require("../src/utils/redisCache");
const { reconnectDelay } = require("../src/utils/redisReconnect");

test("Redis never gives up reconnecting: the delay grows to 30 s and stays a number", () => {
  for (const retries of [0, 1, 5, 10, 11, 50, 10000]) {
    const delay = reconnectDelay(retries);
    assert.equal(typeof delay, "number", `retry ${retries}`);
    assert.ok(delay > 0 && delay <= 36000, `retry ${retries}: ${delay}`);
  }
  assert.ok(reconnectDelay(1000) >= 24000, "long outages retry about every 30 s");
});

test("while Redis is down, requests skip it at once instead of waiting", async () => {
  let called = false;
  const cache = createCache({ isReady: false, get: async () => { called = true; return "x"; } });
  const started = Date.now();
  assert.equal(await cache.get("system_maintenance_mode"), null);
  assert.equal(called, false);
  assert.ok(Date.now() - started < 50);
});

test("a hanging Redis command gives up after a second and falls back to the database", async () => {
  const cache = createCache({ isReady: true, get: () => new Promise(() => {}), set: async () => { throw new Error("closed"); } });
  const started = Date.now();
  assert.equal(await cache.get("k"), null);
  assert.ok(Date.now() - started < 1500);
  assert.equal(await cache.set("k", "v"), null, "errors never reach the request");
});

test("a ready Redis is used normally", async () => {
  const cache = createCache({ isReady: true, get: async (key) => `value:${key}` });
  assert.equal(await cache.get("a"), "value:a");
});
