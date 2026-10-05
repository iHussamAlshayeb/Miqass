const axios = require("axios");
const crypto = require("crypto");

// Whatsi: وسيط واتساب ثاني بجانب WaSender عبر Integration API
// (مفتاح تكامل واحد للمنصة، وكل صالون = externalAccountId له جلسة مستقلة)
const DEFAULT_BASE_URL = "https://whatsi.ihussam.dev";
const REQUEST_TIMEOUT_MS = 10000;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const getBaseUrl = () =>
  String(process.env.WHATSI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
const getIntegrationKey = () => String(process.env.WHATSI_INTEGRATION_KEY || "").trim();
const isWhatsiConfigured = () => Boolean(getIntegrationKey());

const accountPath = (externalAccountId) =>
  `${getBaseUrl()}/v1/integration/accounts/${encodeURIComponent(String(externalAccountId))}`;

const authHeaders = () => ({
  Authorization: `Bearer ${getIntegrationKey()}`,
  "Content-Type": "application/json",
});

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

const toAccountName = (value) => {
  const name = String(value || "").trim().slice(0, 120);
  return name.length >= 2 ? name : "Miqass salon";
};

const createWhatsiSession = async (externalAccountId, accountName) =>
  unwrap(
    await axios.post(
      `${accountPath(externalAccountId)}/session`,
      { accountName: toAccountName(accountName) },
      { headers: authHeaders(), timeout: REQUEST_TIMEOUT_MS },
    ),
  );

const getWhatsiSession = async (externalAccountId) =>
  unwrap(
    await axios.get(`${accountPath(externalAccountId)}/session`, {
      headers: authHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
    }),
  );

// يرجع { status, qr, qrType: 'DATA_URL' | 'RAW' | null }
const getWhatsiQr = async (externalAccountId) =>
  unwrap(
    await axios.get(`${accountPath(externalAccountId)}/session/qr`, {
      headers: authHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
      // 202 = الكود يُجهّز الآن
      validateStatus: (status) => status >= 200 && status < 300,
    }),
  );

const deleteWhatsiSession = async (externalAccountId) =>
  unwrap(
    await axios.delete(`${accountPath(externalAccountId)}/session`, {
      headers: authHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
    }),
  );

// الإرسال غير متزامن: 202 = دخلت الطابور، والحالة النهائية تصل عبر Webhook
const sendWhatsiText = async (externalAccountId, to, text, clientMessageId) => {
  const body = { to, text };
  if (clientMessageId) body.clientMessageId = String(clientMessageId).slice(0, 120);
  const response = await axios.post(`${accountPath(externalAccountId)}/messages`, body, {
    headers: authHeaders(),
    timeout: REQUEST_TIMEOUT_MS,
  });
  return unwrap(response);
};

const getWhatsiMessage = async (externalAccountId, messageId) =>
  unwrap(
    await axios.get(
      `${accountPath(externalAccountId)}/messages/${encodeURIComponent(String(messageId))}`,
      { headers: authHeaders(), timeout: REQUEST_TIMEOUT_MS },
    ),
  );

// نفس رموز الحالة المستخدمة لرسائل الحملات (0 فشل، 1 انتظار، 2 أُرسلت، 3 وصلت، 4 قُرئت)
const WHATSI_STATUS_MAP = Object.freeze({
  FAILED: { code: 0, status: "failed" },
  QUEUED: { code: 1, status: "pending" },
  PROCESSING: { code: 1, status: "pending" },
  SENT: { code: 2, status: "sent" },
  DELIVERED: { code: 3, status: "delivered" },
  READ: { code: 4, status: "read" },
});

const normalizeWhatsiMessageStatus = (value) =>
  WHATSI_STATUS_MAP[String(value || "").trim().toUpperCase()] || null;

const WHATSI_EVENT_STATUS = Object.freeze({
  "message.sent": "SENT",
  "message.delivered": "DELIVERED",
  "message.read": "READ",
  "message.failed": "FAILED",
});

// حالات الجلسة في Whatsi: CREATING, QR_READY, CONNECTING, CONNECTED, DISCONNECTED, LOGGED_OUT, ERROR
const normalizeWhatsiSessionStatus = (value) => String(value || "UNKNOWN").trim().toUpperCase();

const getWebhookSecret = () => String(process.env.WHATSI_WEBHOOK_SECRET || "").trim();

// HMAC-SHA256 على `${timestamp}.${rawBody}` ويُقارن بالترويسة x-whatsi-signature
const verifyWhatsiSignature = ({ rawBody, timestamp, signature, secret = getWebhookSecret(), now = Date.now() }) => {
  if (!secret || typeof rawBody !== "string" || !timestamp || !signature) return false;
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > SIGNATURE_TOLERANCE_MS) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const received = Buffer.from(String(signature));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
};

module.exports = {
  WHATSI_EVENT_STATUS,
  isWhatsiConfigured,
  createWhatsiSession,
  getWhatsiSession,
  getWhatsiQr,
  deleteWhatsiSession,
  sendWhatsiText,
  getWhatsiMessage,
  normalizeWhatsiMessageStatus,
  normalizeWhatsiSessionStatus,
  verifyWhatsiSignature,
};
