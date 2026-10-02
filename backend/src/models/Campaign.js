const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    messageTemplate: { type: String, required: true, trim: true },

    targetAudience: { type: String, required: true },

    targetCustomers: [
      {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
        phone: { type: String, required: true },
        name: { type: String, required: true },
        status: {
          type: String,
          enum: [
            "Pending",
            "Sending",
            "Sent",
            "Failed",
            "Uncertain",
            "Cancelled",
          ],
          default: "Pending",
        },
        errorMessage: { type: String, default: "" },
        attempts: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: null },
        sentAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        providerMessageId: { type: String, default: null },
        providerWhatsappMessageId: { type: String, default: null },
        providerStatus: { type: String, default: null },
        providerStatusCode: { type: Number, default: null, min: 0, max: 5 },
        providerStatusUpdatedAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },
        readAt: { type: Date, default: null },
        deliveryFailedAt: { type: Date, default: null },
        deliveryCheckAttempts: { type: Number, default: 0, min: 0 },
        lastDeliveryCheckAt: { type: Date, default: null },
      },
    ],

    totalCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    uncertainCount: { type: Number, default: 0 },
    cancelledCount: { type: Number, default: 0 },
    dailyMessageLimit: { type: Number, default: null, min: 1, max: 5000 },
    dailyAttemptCount: { type: Number, default: 0, min: 0 },
    dailyWindowDate: { type: String, default: null },

    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Paused",
        "Cancelled",
        "Completed",
        "Completed_With_Errors",
        "Failed",
      ],
      default: "Pending",
    },

    startedAt: { type: Date, default: null },
    lastProgressAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: Date.now },
    lastError: { type: String, default: "" },
    lockOwner: { type: String, default: null },
    lockExpiresAt: { type: Date, default: null },
    completedAt: { type: Date },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

campaignSchema.index(
  { status: 1, nextRunAt: 1, lockExpiresAt: 1, createdAt: 1 },
  { background: true },
);
campaignSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });
campaignSchema.index(
  { tenantId: 1, "targetCustomers.providerMessageId": 1 },
  { background: true, sparse: true },
);
campaignSchema.index(
  { tenantId: 1, "targetCustomers.providerWhatsappMessageId": 1 },
  { background: true, sparse: true },
);

module.exports = mongoose.model("Campaign", campaignSchema);
