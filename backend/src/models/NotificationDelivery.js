const mongoose = require("mongoose");
const crypto = require("crypto");

const notificationDeliverySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["booking", "review"],
      required: true,
    },
    dedupeKey: { type: String, required: true, unique: true, maxlength: 300 },
    providerIdempotencyKey: {
      type: String,
      required: true,
      default: () => crypto.randomUUID(),
    },
    headings: {
      en: { type: String, required: true },
      ar: { type: String, required: true },
    },
    contents: {
      en: { type: String, required: true },
      ar: { type: String, required: true },
    },
    url: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Retrying",
        "Sent",
        "Delivered",
        "NoRecipients",
        "Failed",
      ],
      default: "Pending",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    lockOwner: { type: String, default: null },
    lockExpiresAt: { type: Date, default: null },
    providerNotificationId: { type: String, default: null, index: true },
    targetedCount: { type: Number, default: 0, min: 0 },
    acceptedCount: { type: Number, default: 0, min: 0 },
    successfulCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },
    confirmedCount: { type: Number, default: 0, min: 0 },
    providerErrors: { type: mongoose.Schema.Types.Mixed, default: null },
    sentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    reconciliationAttempts: { type: Number, default: 0, min: 0 },
    lastDeliveryCheckAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationDeliverySchema.index(
  { status: 1, nextAttemptAt: 1, lockExpiresAt: 1, createdAt: 1 },
  { background: true },
);
notificationDeliverySchema.index(
  { status: 1, lastDeliveryCheckAt: 1, sentAt: 1 },
  { background: true },
);

module.exports = mongoose.model(
  "NotificationDelivery",
  notificationDeliverySchema,
);
