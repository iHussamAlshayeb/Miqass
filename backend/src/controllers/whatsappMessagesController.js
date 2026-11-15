// سجل رسائل واتساب: للصالون (رسائله فقط) وللسوبر أدمن (كل الصالونات وحالة الخدمة)
const mongoose = require("mongoose");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const { MESSAGE_TYPES, MESSAGE_STATUSES } = require("../models/WhatsAppMessage");
const { resendMessage, isQueueMode } = require("../services/whatsappOutbox");

const PAGE_SIZE = 50;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toDigits = (value) => String(value || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "");

const buildFilter = (base, query = {}) => {
  const filter = { ...base };
  const status = String(query.status || "");
  if (status === "problems") filter.status = { $in: ["failed", "skipped", "expired"] };
  else if (MESSAGE_STATUSES.includes(status)) filter.status = status;
  const type = String(query.type || "");
  if (MESSAGE_TYPES.includes(type)) filter.type = type;

  const q = String(query.q || "").trim().slice(0, 60);
  if (q) {
    const digits = toDigits(q);
    const or = [{ recipientName: new RegExp(escapeRegex(q), "i") }];
    // البحث بالجوال بأي صيغة: 05.. أو 9665.. أو 5..
    if (digits.length >= 4) or.push({ to: new RegExp(escapeRegex(digits.replace(/^0+/, "").replace(/^966/, ""))) });
    filter.$or = or;
  }
  const before = query.before ? new Date(String(query.before)) : null;
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
  return filter;
};

const summarize = async (base) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await WhatsAppMessage.aggregate([
    { $match: { ...base, createdAt: { $gte: since } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};

const present = (message, withSalon = false) => ({
  _id: message._id,
  type: message.type,
  status: message.status,
  to: message.to,
  recipientName: message.recipientName,
  text: message.text,
  attempts: message.attempts,
  lastError: message.lastError,
  createdAt: message.createdAt,
  sentAt: message.sentAt,
  deliveredAt: message.deliveredAt,
  readAt: message.readAt,
  nextAttemptAt: message.status === "queued" ? message.nextAttemptAt : null,
  resendOf: message.resendOf,
  canResend: Boolean(message.to) && message.type !== "access_code" && ["failed", "skipped", "expired", "sent", "delivered", "read"].includes(message.status),
  ...(withSalon ? { salonName: message.tenantId?.salonName || "", tenantId: message.tenantId?._id || message.tenantId } : {}),
});

const list = async (base, query, withSalon) => {
  let request = WhatsAppMessage.find(buildFilter(base, query)).sort({ createdAt: -1 }).limit(PAGE_SIZE + 1);
  if (withSalon) request = request.populate("tenantId", "salonName");
  const [messages, summary] = await Promise.all([request.lean(), summarize(base)]);
  const page = messages.slice(0, PAGE_SIZE);
  return {
    messages: page.map((message) => present(message, withSalon)),
    nextBefore: messages.length > PAGE_SIZE ? page.at(-1).createdAt : null,
    summary,
  };
};

const sendError = (res, error, fallback) => {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({ message: status >= 500 ? fallback : error.message });
};

const listTenantMessages = async (req, res) => {
  try {
    return res.json(await list({ tenantId: new mongoose.Types.ObjectId(String(req.tenantId)) }, req.query, false));
  } catch (error) {
    return sendError(res, error, "تعذر تحميل سجل الرسائل.");
  }
};

const resendTenantMessage = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "الرسالة غير موجودة." });
    const copy = await resendMessage(req.params.id, { tenantId: req.tenantId });
    if (!copy) return res.status(404).json({ message: "الرسالة غير موجودة." });
    return res.status(201).json({ message: present(copy.toObject ? copy.toObject() : copy) });
  } catch (error) {
    return sendError(res, error, "تعذر إعادة الإرسال.");
  }
};

/** السوبر أدمن: كل الرسائل مع حالة الخدمة والصالونات الأكثر فشلاً */
const listAllMessages = async (req, res) => {
  try {
    const base = mongoose.Types.ObjectId.isValid(String(req.query.tenantId || ""))
      ? { tenantId: new mongoose.Types.ObjectId(String(req.query.tenantId)) }
      : {};
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [result, queued, oldest, failingSalons] = await Promise.all([
      list(base, req.query, true),
      WhatsAppMessage.countDocuments({ status: "queued" }),
      WhatsAppMessage.findOne({ status: "queued" }).sort({ createdAt: 1 }).select("createdAt").lean(),
      WhatsAppMessage.aggregate([
        { $match: { status: { $in: ["failed", "expired"] }, createdAt: { $gte: since } } },
        { $group: { _id: "$tenantId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $lookup: { from: "tenants", localField: "_id", foreignField: "_id", as: "tenant" } },
        { $project: { count: 1, salonName: { $ifNull: [{ $arrayElemAt: ["$tenant.salonName", 0] }, ""] } } },
      ]),
    ]);
    return res.json({
      ...result,
      service: {
        mode: isQueueMode() ? "queue" : "inline",
        queued,
        oldestQueuedSeconds: oldest ? Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 1000) : 0,
      },
      failingSalons: failingSalons.map((row) => ({ tenantId: row._id, salonName: row.salonName, count: row.count })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل سجل الرسائل.");
  }
};

const resendAnyMessage = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "الرسالة غير موجودة." });
    const copy = await resendMessage(req.params.id);
    if (!copy) return res.status(404).json({ message: "الرسالة غير موجودة." });
    return res.status(201).json({ message: present(copy.toObject ? copy.toObject() : copy) });
  } catch (error) {
    return sendError(res, error, "تعذر إعادة الإرسال.");
  }
};

module.exports = { listTenantMessages, resendTenantMessage, listAllMessages, resendAnyMessage, buildFilter };
