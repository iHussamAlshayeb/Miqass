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
          enum: ["Pending", "Sending", "Sent", "Failed", "Uncertain"],
          default: "Pending",
        },
        errorMessage: { type: String, default: "" },
        attempts: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: null },
        sentAt: { type: Date, default: null },
        providerMessageId: { type: String, default: null },
        providerStatus: { type: String, default: null },
      },
    ],

    totalCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    uncertainCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Paused",
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
  },
  { timestamps: true },
);

campaignSchema.index(
  { status: 1, nextRunAt: 1, lockExpiresAt: 1, createdAt: 1 },
  { background: true },
);
campaignSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model("Campaign", campaignSchema);
