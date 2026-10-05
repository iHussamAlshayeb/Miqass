const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const { createShutdown } = require("../src/utils/shutdown");

const quietLog = { log() {}, error() {} };

test("shutdown runs in order: cron → server (after in-flight request) → mongo → redis", async () => {
  const order = [];
  let release;
  const server = http.createServer((req, res) => {
    order.push("request-start");
    release = () => { res.end("ok"); order.push("request-done"); };
  });
  await new Promise((r) => server.listen(0, r));
  const pending = fetch(`http://127.0.0.1:${server.address().port}/`).then((r) => r.text());
  await new Promise((r) => setTimeout(r, 50));

  let exitCode;
  const shutdown = createShutdown({
    server,
    stopCronJobs: async () => { order.push("cron"); return true; },
    mongoose: { connection: { readyState: 1, close: async () => order.push("mongo") } },
    redisClient: { isOpen: true, isReady: true, quit: async () => order.push("redis") },
    exit: (code) => { exitCode = code; },
    log: quietLog,
  });

  const done = shutdown("SIGTERM", 0);
  assert.equal(shutdown("SIGTERM", 0), done, "second signal reuses the same shutdown");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!order.includes("mongo"), "DB stays open while a request is in flight");
  release();
  await pending;
  await done;

  assert.deepEqual(order, ["request-start", "cron", "request-done", "mongo", "redis"]);
  assert.equal(exitCode, 0);
});

test("shutdown exits even if a step hangs", async () => {
  let exitCode;
  const shutdown = createShutdown({
    server: null,
    stopCronJobs: () => new Promise(() => {}),
    timeoutMs: 6000 + 100,
    exit: (code) => { exitCode = code; },
    log: quietLog,
  });
  const started = Date.now();
  await shutdown("uncaughtException", 1);
  assert.equal(exitCode, 1);
  assert.ok(Date.now() - started < 7000);
});
