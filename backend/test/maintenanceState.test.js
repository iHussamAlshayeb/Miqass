const test = require("node:test");
const assert = require("node:assert/strict");
const SystemSettings = require("../src/models/SystemSettings");
const { getMaintenanceState, setMaintenanceState, resetMaintenanceState, TTL_MS } = require("../src/services/maintenanceState");

const mockSettings = (t, sequence) => {
  let calls = 0;
  t.mock.method(SystemSettings, "findOne", () => ({
    select() { return this; },
    lean: async () => {
      const next = sequence[Math.min(calls, sequence.length - 1)];
      calls += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  }));
  return () => calls;
};

test("the maintenance status is read from the database once per 15 seconds, not on every request", async (t) => {
  resetMaintenanceState();
  const calls = mockSettings(t, [{ isMaintenanceMode: false }]);
  await Promise.all(Array.from({ length: 20 }, () => getMaintenanceState()));
  await getMaintenanceState();
  assert.equal(calls(), 1);
  assert.equal(TTL_MS, 15000);
});

test("turning maintenance on from super admin applies at once, with its message", async (t) => {
  resetMaintenanceState();
  mockSettings(t, [{ isMaintenanceMode: false }]);
  assert.equal((await getMaintenanceState()).isMaintenanceMode, false);
  setMaintenanceState({ isMaintenanceMode: true, maintenanceMessage: "صيانة قصيرة" });
  const state = await getMaintenanceState();
  assert.equal(state.isMaintenanceMode, true);
  assert.equal(state.message, "صيانة قصيرة");
});

test("if the database stops answering, the last known status keeps the site serving", async (t) => {
  resetMaintenanceState();
  setMaintenanceState({ isMaintenanceMode: false });
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + TTL_MS + 1000;
  mockSettings(t, [new Error("ECONNREFUSED")]);
  assert.equal((await getMaintenanceState()).isMaintenanceMode, false);
});
