const axios = require("axios");
const crypto = require("crypto");

// Whatsi: وسيط واتساب ثاني بجانب WaSender عبر الـ API العام (/v1).
// كل صالون ينشئ حسابه في تطبيق Whatsi، يربط رقمه هناك، ثم يلصق مفتاح API (wg_live_...) في مقص.
const DEFAULT_BASE_URL = "https://whatsi.ihussam.dev";
const REQUEST_TIMEOUT_MS = 10000;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const API_KEY_PATTERN = /^wg_live_[A-Za-z0-9_-]{10,200}$/;
// معرّف بصيغة cuid صحيحة لا يخص أي رسالة: يُستخدم للتحقق من صلاحية المفتاح فقط
const KEY_PROBE_MESSAGE_ID = "cjld2cjxh0000qzrmn831i7rn";

const getBaseUrl = () =>
  String(process.env.WHATSI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

const headersFor = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

const isWhatsiApiKeyFormat = (value) => API_KEY_PATTERN.test(String(value || "").trim());

// الصيغة الدولية بدون + (مثل 966500000001). يرجع "" إن لم يكن الرقم صالحاً.
const normalizeWhatsiNumber = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("05") && digits.length === 10) digits = `966${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : "";
};

// يرجع { valid: true } أو { valid: false, reason }
const verifyWhatsiApiKey = async (apiKey) => {
  try {
    await axios.get(`${getBaseUrl()}/v1/messages/${KEY_PROBE_MESSAGE_ID}`, {
      headers: headersFor(apiKey),
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { valid: true };
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) return { valid: true };
    if (status === 401) return { valid: false, reason: "invalid_key" };
    if (status === 403) return { valid: false, reason: "account_inactive" };
    return { valid: false, reason: "unreachable" };
  }
};

// الإرسال غير متزامن: 202 = دخلت الطابور، والحالة النهائية تصل عبر Webhook أو مسار الحالة
const sendWhatsiText = async (apiKey, { to, text, from, clientMessageId }) => {
  const body = { to, text };
  if (from) body.from = from;
  if (clientMessageId) body.clientMessageId = String(clientMessageId).slice(0, 120);
  const response = await axios.post(`${getBaseUrl()}/v1/messages/text`, body, {
    headers: headersFor(apiKey),
    timeout: REQUEST_TIMEOUT_MS,
  });
  return response.data?.data || {};
};

const getWhatsiMessage = async (apiKey, messageId) => {
  const response = await axios.get(
    `${getBaseUrl()}/v1/messages/${encodeURIComponent(String(messageId))}`,
    { headers: headersFor(apiKey), timeout: REQUEST_TIMEOUT_MS },
  );
  return response.data?.data || {};
};

// أخطاء تعني أن رقم الصالون في Whatsi غير جاهز للإرسال
const WHATSI_NUMBER_ERRORS = new Set([
  "SESSION_NOT_CONNECTED",
  "NO_LINKED_NUMBER",
  "FROM_NUMBER_NOT_FOUND",
  "FROM_REQUIRED",
]);
const isWhatsiNumberError = (error) => WHATSI_NUMBER_ERRORS.has(error?.response?.data?.error);

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

// HMAC-SHA256 على `${timestamp}.${rawBody}` بسر توقيع الـ Webhook، ويُقارن بالترويسة x-whatsi-signature
const verifyWhatsiSignature = ({ rawBody, timestamp, signature, secret, now = Date.now() }) => {
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
  isWhatsiApiKeyFormat,
  normalizeWhatsiNumber,
  verifyWhatsiApiKey,
  sendWhatsiText,
  getWhatsiMessage,
  isWhatsiNumberError,
  normalizeWhatsiMessageStatus,
  verifyWhatsiSignature,
};
