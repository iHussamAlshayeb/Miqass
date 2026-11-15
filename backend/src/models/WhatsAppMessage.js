const mongoose = require("mongoose");

// سجل وطابور رسائل واتساب: كل رسالة يرسلها النظام تُسجَّل هنا مع حالتها،
// وفي وضع الطابور تنتظر هنا حتى ترسلها خدمة whatsapp-service.
const MESSAGE_TYPES = [
  "confirmation", "cancellation", "reminder", "review", "loyalty",
  "retention", "campaign", "access_code", "reschedule",
];
const MESSAGE_STATUSES = [
  "queued",    // بانتظار خدمة الإرسال
  "sending",   // قيد الإرسال الآن
  "sent",      // قبلها مزود واتساب
  "delivered", // وصلت لجوال العميل
  "read",      // قرأها العميل
  "failed",    // فشلت نهائياً (السبب في lastError)
  "skipped",   // لم تُرسل: رقم غير صالح
  "expired",   // انتهت صلاحيتها قبل أن تُرسل (مثل تذكير بعد موعده)
];

const whatsAppMessageSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    to: { type: String, default: "" },
    recipientName: { type: String, default: "", maxlength: 120 },
    text: { type: String, required: true, maxlength: 4096 },
    status: { type: String, enum: MESSAGE_STATUSES, default: "queued" },
    provider: { type: String, default: "wasender" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockUntil: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    lastError: { type: String, default: "", maxlength: 500 },
    providerMessageId: { type: String, default: "" },
    whatsappMessageId: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    // ربط اختياري بالموعد/الحملة، وإعادة الإرسال تشير للرسالة الأصلية
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
    resendOf: { type: mongoose.Schema.Types.ObjectId, ref: "WhatsAppMessage", default: null },
  },
  { timestamps: true },
);

// الطابور: الأقدم أولاً مما حان وقته
whatsAppMessageSchema.index({ status: 1, nextAttemptAt: 1 });
whatsAppMessageSchema.index({ tenantId: 1, createdAt: -1 });
whatsAppMessageSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
whatsAppMessageSchema.index({ providerMessageId: 1 }, { partialFilterExpression: { providerMessageId: { $gt: "" } } });
whatsAppMessageSchema.index({ whatsappMessageId: 1 }, { partialFilterExpression: { whatsappMessageId: { $gt: "" } } });
// يُحذف السجل تلقائياً بعد 90 يوماً
whatsAppMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("WhatsAppMessage", whatsAppMessageSchema);
module.exports.MESSAGE_TYPES = MESSAGE_TYPES;
module.exports.MESSAGE_STATUSES = MESSAGE_STATUSES;
