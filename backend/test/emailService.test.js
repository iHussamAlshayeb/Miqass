const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

process.env.RESEND_API_KEY = "re_test_key";
process.env.FROM_NAME = "Miqass App";
process.env.FROM_EMAIL = "noreply@miqass.app";

const {
  sendWelcomeEmail,
  sendActivationEmail,
  sendRenewalReminderEmail,
  sendPasswordResetEmail,
} = require("../src/utils/emailService");

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

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
  assert.match(call.body.subject, /حساب صالونك/);
  assert.ok(call.body.text, "plain-text version is included");
  assert.match(call.body.text, /<script>x<\/script>/, "text version keeps the raw name (not HTML)");
  assert.equal(call.body.html.includes("<script>x</script>"), false);
  assert.match(call.body.html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(call.body.html, /صالون &quot;النخبة&quot;/);
});

test("all emails are formal: no emoji in subject, HTML or text, and include a text part", async () => {
  const calls = [];
  await withPost(async (_url, body) => { calls.push(body); return { data: {} }; }, async () => {
    await sendWelcomeEmail("a@b.co", "حسام", "صالون");
    await sendActivationEmail("a@b.co", "حسام", "Premium", "2026-12-01");
    await sendRenewalReminderEmail("a@b.co", "حسام", 3);
    await sendPasswordResetEmail("a@b.co", "حسام", "https://www.miqass.app/reset-password/abc");
  });
  assert.equal(calls.length, 4);
  for (const body of calls) {
    assert.doesNotMatch(body.subject, EMOJI, body.subject);
    assert.doesNotMatch(body.html, EMOJI);
    assert.doesNotMatch(body.text, EMOJI);
    assert.ok(body.text.length > 50);
  }
  assert.match(calls[2].subject, /3 أيام/);
  assert.match(calls[3].text, /https:\/\/www\.miqass\.app\/reset-password\/abc/);
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
