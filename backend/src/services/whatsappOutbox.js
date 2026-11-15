// سجل وطابور رسائل واتساب.
//
// وضعان (متغير WHATSAPP_DELIVERY):
//  - inline (الافتراضي): الخادم يرسل فوراً كما كان، ويسجّل كل رسالة وحالتها،
//    ويعيد محاولة الفاشلة مؤقتاً وينفذ "إعادة الإرسال" بنفسه.
//  - queue: الخادم يسجّل الرسالة في الطابور فقط، وخدمة whatsapp-service المستقلة
//    (MIQASS_ROLE=whatsapp) ترسلها وتعيد المحاولة وتشغّل مهام الواتساب المجدولة.
// لو توقفت الخدمة في وضع الطابور تنتظر الرسائل ولا تضيع، وتُرسل عند عودتها
// (عدا ما انتهت صلاحيته، مثل رمز الدخول بعد 5 دقائق أو تذكير بعد موعده).
const WhatsAppMessage = require("../models/WhatsAppMessage");

const isWhatsappWorker = () => process.env.MIQASS_ROLE === "whatsapp";
const isQueueMode = () => process.env.WHATSAPP_DELIVERY === "queue";
/** الخادم في وضع الطابور يسجّل فقط، والخدمة المستقلة ترسل */
const shouldEnqueue = () => isQueueMode() && !isWhatsappWorker();
/** من يشغّل الإرسال والمهام المجدولة: الخادم في inline، والخدمة في queue. لا يعملان معاً أبداً. */
const shouldRunWhatsappJobs = () => (isQueueMode() ? isWhatsappWorker() : !isWhatsappWorker());

const MINUTE = 60 * 1000;
const TTL_MINUTES = { access_code: 5, reminder: 180 };
const DEFAULT_TTL_MINUTES = 24 * 60;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 30];
const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;
const SEND_LOCK_MS = 2 * MINUTE;

const expiryFor = (type, now = Date.now()) => new Date(now + (TTL_MINUTES[type] || DEFAULT_TTL_MINUTES) * MINUTE);

const NETWORK_CODES = ["ENOTFOUND", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "ECONNABORTED"];
/** أخطاء مؤقتة تستحق إعادة المحاولة: الشبكة، المهلة، ضغط المزود (429) وأعطاله (5xx) */
const isRetryableError = (error) => {
  if (error?.permanent) return false;
  const status = error?.response?.status;
  if (status === 429 || status === 408 || (typeof status === "number" && status >= 500)) return true;
  if (!error?.response) return NETWORK_CODES.includes(error?.code) || /timeout/i.test(String(error?.message || ""));
  return false;
};

// ترجمة أشهر أخطاء المزود لعبارة يفهمها صاحب الصالون، مع إبقاء النص الأصلي للدعم الفني
const FRIENDLY_ERRORS = [
  [/JID does not exist|not (on|registered|exists?).{0,20}whatsapp|invalid (phone|number|jid)/i, "الرقم غير مسجّل في واتساب"],
  [/session.{0,30}(not|dis)connect|not connected|logged ?out|no active session/i, "رقم واتساب الصالون غير متصل؛ أعد الربط من الإعدادات"],
];
const describeError = (error) => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const providerMessage = typeof data === "string"
    ? (data.toLowerCase().includes("<html") ? "" : data)
    : data?.message || data?.error || "";
  const raw = providerMessage || error?.message || "";
  const friendly = FRIENDLY_ERRORS.find(([pattern]) => pattern.test(raw))?.[1]
    || (status === 401 || status === 403 ? "مفتاح ربط واتساب غير صالح؛ أعد الربط من الإعدادات" : "")
    || (status === 429 ? "ضغط على مزود واتساب" : "")
    || (status >= 500 || (!status && error?.code) ? "تعذر الاتصال بمزود واتساب" : "");
  const parts = [friendly, status ? `HTTP ${status}` : error?.code, raw].filter(Boolean);
  return [...new Set(parts)].join(" · ").slice(0, 500) || "فشل غير معروف";
};

const extractProviderIds = (response) => {
  const data = response?.data?.data || {};
  return {
    providerMessageId: String(data.msgId ?? data.id ?? response?.data?.msgId ?? "").trim(),
    whatsappMessageId: String(data.key?.id || data.waMessageId || "").trim(),
  };
};

const quietly = async (work) => {
  try {
    return await work();
  } catch (error) {
    console.warn("تعذر تحديث سجل رسائل واتساب:", error.message);
    return null;
  }
};

/** إرسال فعلي عبر وسيط الصالون. postText يُمرَّر لتجنب الاعتماد الدائري مع utils/whatsapp */
const sendThroughProvider = async ({ postText, tenant, credential, to, text, clientMessageId }) => {
  const response = await postText(tenant, credential, { to, text }, { clientMessageId });
  if (response?.data?.success === false) {
    throw Object.assign(new Error(response.data?.message || "رفض مزود واتساب الرسالة."), { permanent: true });
  }
  return extractProviderIds(response);
};

const markSent = (id, ids) => WhatsAppMessage.updateOne(
  { _id: id },
  { $set: { status: "sent", sentAt: new Date(), lockUntil: null, lastError: "", ...ids } },
);

/** بعد فشل محاولة: إعادة جدولة إن كان الخطأ مؤقتاً وبقيت محاولات، وإلا فشل نهائي */
const markAttemptFailed = async (record, error) => {
  const attempts = Number(record.attempts || 1);
  const retry = isRetryableError(error) && attempts < MAX_ATTEMPTS;
  await WhatsAppMessage.updateOne(
    { _id: record._id },
    {
      $set: retry
        ? { status: "queued", lockUntil: null, lastError: describeError(error), nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MINUTES[attempts - 1] * MINUTE) }
        : { status: "failed", lockUntil: null, lastError: describeError(error) },
    },
  );
  return retry;
};

/**
 * نقطة الإرسال الوحيدة لرسائل الحجوزات والتسويق.
 * يُرجع true إذا أُرسلت أو أصبحت في الطابور، وfalse إذا رُفضت نهائياً.
 */
const deliver = async ({ postText, tenant, credential, type, to, text, recipientName = "", appointmentId = null }) => {
  const base = {
    tenantId: tenant._id,
    type,
    to,
    text,
    recipientName: String(recipientName || "").slice(0, 120),
    appointmentId: appointmentId || null,
    provider: tenant?.whatsappSettings?.provider || "wasender",
    expiresAt: expiryFor(type),
  };

  if (shouldEnqueue()) {
    const queued = await quietly(() => WhatsAppMessage.create({ ...base, status: "queued" }));
    if (queued) return true;
    // تعذر التسجيل في الطابور (قاعدة البيانات): نرسل مباشرة حتى لا تضيع الرسالة
  }

  const record = await quietly(() => WhatsAppMessage.create({
    ...base, status: "sending", attempts: 1, lockUntil: new Date(Date.now() + SEND_LOCK_MS),
  }));
  try {
    const ids = await sendThroughProvider({ postText, tenant, credential, to, text, clientMessageId: record ? String(record._id) : undefined });
    if (record) await quietly(() => markSent(record._id, ids));
    return true;
  } catch (error) {
    if (!record) throw error;
    const retrying = await quietly(() => markAttemptFailed(record, error));
    if (retrying) return true;
    throw error;
  }
};

/** يسجّل رسالة لم تُرسل لسبب معروف (مثل رقم غير صالح) ليظهر في سجل الصالون */
const recordSkipped = ({ tenant, type, to = "", text, recipientName = "", appointmentId = null, reason }) => quietly(() => WhatsAppMessage.create({
  tenantId: tenant._id,
  type,
  to: String(to || ""),
  text,
  recipientName: String(recipientName || "").slice(0, 120),
  appointmentId: appointmentId || null,
  provider: tenant?.whatsappSettings?.provider || "wasender",
  status: "skipped",
  lastError: reason,
}));

/** رسائل الحملات تُرسل بمنطقها الخاص (معدل الإرسال والمتابعة)، وتُسجَّل هنا للعرض فقط */
const logCampaignSend = ({ tenant, campaignId, to, text, recipientName, result }) => quietly(() => WhatsAppMessage.create({
  tenantId: tenant._id,
  type: "campaign",
  campaignId: campaignId || null,
  to: String(to || ""),
  text: String(text || "").slice(0, 4096) || "-",
  recipientName: String(recipientName || "").slice(0, 120),
  provider: tenant?.whatsappSettings?.provider || "wasender",
  attempts: 1,
  status: result?.success ? "sent" : "failed",
  sentAt: result?.success ? new Date() : null,
  providerMessageId: String(result?.providerMessageId || ""),
  lastError: result?.success ? "" : String(result?.errorMessage || "").slice(0, 500),
}));

/**
 * يرسل ما حان وقته من الطابور. يعمل في خدمة whatsapp-service (وضع الطابور)
 * أو في الخادم نفسه (وضع inline) لإعادة المحاولة وإعادة الإرسال.
 */
const dispatchDue = async ({ postText, loadTenant, getCredential, limit = 25, pauseMs = 1200, shouldStop = () => false }) => {
  const now = new Date();
  await WhatsAppMessage.updateMany(
    { status: "queued", expiresAt: { $ne: null, $lte: now } },
    { $set: { status: "expired", lockUntil: null } },
  );
  // رسالة علقت أثناء الإرسال (توقف الخدمة فجأة): تعود للطابور
  await WhatsAppMessage.updateMany(
    { status: "sending", lockUntil: { $ne: null, $lte: now } },
    { $set: { status: "queued", lockUntil: null, nextAttemptAt: now } },
  );

  let sent = 0;
  for (let index = 0; index < limit && !shouldStop(); index += 1) {
    const claimTime = new Date();
    // eslint-disable-next-line no-await-in-loop
    const record = await WhatsAppMessage.findOneAndUpdate(
      {
        status: "queued",
        nextAttemptAt: { $lte: claimTime },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: claimTime } }],
      },
      { $set: { status: "sending", lockUntil: new Date(claimTime.getTime() + SEND_LOCK_MS) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, new: true },
    ).lean();
    if (!record) break;

    // eslint-disable-next-line no-await-in-loop
    const tenant = await loadTenant(record.tenantId);
    const credential = tenant && !tenant.deletedAt && tenant.whatsappSettings?.isEnabled ? getCredential(tenant) : null;
    if (!credential) {
      // eslint-disable-next-line no-await-in-loop
      await WhatsAppMessage.updateOne({ _id: record._id }, { $set: { status: "failed", lockUntil: null, lastError: "واتساب غير مفعّل أو غير مربوط للصالون." } });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const ids = await sendThroughProvider({ postText, tenant, credential, to: record.to, text: record.text, clientMessageId: String(record._id) });
      // eslint-disable-next-line no-await-in-loop
      await markSent(record._id, ids);
      sent += 1;
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await markAttemptFailed(record, error);
      console.warn(`❌ [WhatsApp ${record.type}] ${describeError(error)}`);
    }
    // eslint-disable-next-line no-await-in-loop
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return sent;
};

const STATUS_RANK = { queued: 0, sending: 0, sent: 1, delivered: 2, read: 3 };

/** تحديث حالة الوصول/القراءة من webhook المزود، دون الرجوع لحالة أقدم */
const updateMessageLogDelivery = async ({ tenantId, identifiers = [], whatsappMessageId = null, status }) => {
  const ids = [...new Set([...identifiers, whatsappMessageId].map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!tenantId || ids.length === 0 || !status) return { matched: false };
  const match = { tenantId, $or: [{ providerMessageId: { $in: ids } }, { whatsappMessageId: { $in: ids } }] };

  let matched = false;
  if (whatsappMessageId) {
    const result = await WhatsAppMessage.updateMany(match, { $set: { whatsappMessageId: String(whatsappMessageId) } });
    matched = result.matchedCount > 0;
  }
  const code = Number(status.code);
  const now = new Date();
  let target = null;
  if (code === 0) target = { status: "failed", allowedFrom: ["sending", "sent"], set: { lastError: "رفض واتساب توصيل الرسالة." } };
  else if (code === 2) target = { status: "sent", set: {} };
  else if (code === 3) target = { status: "delivered", set: { deliveredAt: now } };
  else if (code >= 4) target = { status: "read", set: { readAt: now } };
  if (!target) return { matched };

  const allowedFrom = target.allowedFrom
    || Object.keys(STATUS_RANK).filter((name) => STATUS_RANK[name] < STATUS_RANK[target.status]);
  const result = await WhatsAppMessage.updateMany(
    { ...match, status: { $in: allowedFrom } },
    { $set: { status: target.status, ...target.set } },
  );
  const exists = matched || result.matchedCount > 0 || Boolean(await WhatsAppMessage.exists(match));
  return { matched: exists };
};

/** إعادة إرسال رسالة من السجل: نسخة جديدة في الطابور مرتبطة بالأصل */
const resendMessage = async (messageId, { tenantId = null } = {}) => {
  const original = await WhatsAppMessage.findOne({ _id: messageId, ...(tenantId ? { tenantId } : {}) }).lean();
  if (!original) return null;
  if (!original.to) throw Object.assign(new Error("لا يوجد رقم صالح لإعادة الإرسال."), { statusCode: 400 });
  if (original.type === "access_code") throw Object.assign(new Error("رموز الدخول لا يُعاد إرسالها؛ اطلب رمزاً جديداً."), { statusCode: 400 });
  return WhatsAppMessage.create({
    tenantId: original.tenantId,
    type: original.type,
    to: original.to,
    text: original.text,
    recipientName: original.recipientName,
    appointmentId: original.appointmentId,
    campaignId: original.campaignId,
    provider: original.provider,
    status: "queued",
    expiresAt: expiryFor("resend"),
    resendOf: original._id,
  });
};

module.exports = {
  isWhatsappWorker,
  isQueueMode,
  shouldEnqueue,
  shouldRunWhatsappJobs,
  isRetryableError,
  describeError,
  deliver,
  recordSkipped,
  logCampaignSend,
  dispatchDue,
  updateMessageLogDelivery,
  resendMessage,
  MAX_ATTEMPTS,
};
