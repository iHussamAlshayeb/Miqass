const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

process.env.RESEND_API_KEY = "re_test_key";
process.env.FROM_NAME = "Miqass App";
process.env.FROM_EMAIL = "noreply@miqass.app";

const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require("../src/utils/emailService");

const withPost = async (impl, fn) => {
  const original = axios.post;
  axios.post = impl;
  try { await fn(); } finally { axios.post = original; }
};

test("emails are sent through the Resend API with escaped user content", async () => {
  let call;
  await withPost(async (url, body, config) => { call = { url, body, config }; return { data: { id: "em_1" } }; }, async () => {
    await sendWelcomeEmail("owner@example.com", "<script>x</script>", "صالون \"النخبة\"");
  });

  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.config.headers.Authorization, "Bearer re_test_key");
  assert.equal(call.body.from, "Miqass App <noreply@miqass.app>");
  assert.deepEqual(call.body.to, ["owner@example.com"]);
  assert.match(call.body.subject, /حسابك/);
  assert.equal(call.body.html.includes("<script>x</script>"), false);
  assert.match(call.body.html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(call.body.html, /صالون &quot;النخبة&quot;/);
});

test("password reset surfaces Resend failures to the caller", async () => {
  await withPost(async () => {
    const error = new Error("Request failed");
    error.response = { data: { message: "The miqass.app domain is not verified" } };
    throw error;
  }, async () => {
    await assert.rejects(
      sendPasswordResetEmail("owner@example.com", "حسام", "https://www.miqass.app/reset/abc"),
      /فشل إرسال الإيميل/,
    );
  });
});

test("password reset fails clearly when the API key is missing", async () => {
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  let called = false;
  try {
    await withPost(async () => { called = true; return { data: {} }; }, async () => {
      await assert.rejects(sendPasswordResetEmail("owner@example.com", "حسام", "https://x/reset/abc"));
    });
    assert.equal(called, false);
  } finally {
    process.env.RESEND_API_KEY = key;
  }
});
