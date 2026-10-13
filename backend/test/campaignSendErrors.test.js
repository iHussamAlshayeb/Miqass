const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { encrypt } = require("../src/utils/encryption");
const { sendCampaignMessage } = require("../src/utils/whatsapp");

const tenant = () => ({
  salonName: "S",
  whatsappSettings: { provider: "wasender", isEnabled: true, apiKey: encrypt("k-123") },
});

const sendWithError = async (t, makeError) => {
  const original = axios.post;
  axios.post = async () => { throw makeError(); };
  t.after(() => { axios.post = original; });
  const errorLog = console.error; console.error = () => {};
  try { return await sendCampaignMessage("0555555555", "hi", tenant()); } finally { console.error = errorLog; }
};

const netError = (code, message, syscall) => Object.assign(new Error(message), { code, syscall });

test("connect timeout before the request left is retried, not uncertain", async (t) => {
  const result = await sendWithError(t, () => netError(
    "ETIMEDOUT",
    "connect ETIMEDOUT 172.67.163.189:443; connect ENETUNREACH 2606:4700:3033::ac43:a3bd:443 - Local (:::0)",
  ));
  assert.equal(result.retryable, true);
  assert.equal(result.uncertain, false);
});

test("unreachable network is retried", async (t) => {
  const result = await sendWithError(t, () => netError("ENETUNREACH", "connect ENETUNREACH 1.2.3.4:443", "connect"));
  assert.equal(result.retryable, true);
  assert.equal(result.uncertain, false);
});

test("a dropped connection after sending stays uncertain", async (t) => {
  const result = await sendWithError(t, () => netError("ECONNRESET", "socket hang up"));
  assert.equal(result.retryable, false);
  assert.equal(result.uncertain, true);
});

test("an axios response timeout stays uncertain", async (t) => {
  const result = await sendWithError(t, () => netError("ECONNABORTED", "timeout of 15000ms exceeded"));
  assert.equal(result.uncertain, true);
});
