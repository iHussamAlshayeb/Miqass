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
          enum: ["Pending", "Sent", "Failed"],
          default: "Pending",
        },
        errorMessage: { type: String, default: "" },
      },
    ],

    status: {
      type: String,
      enum: ["Pending", "Processing", "Completed", "Failed"],
      default: "Pending",
    },

    completedAt: { type: Date },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, createdAt: 1 }, { background: true });
campaignSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model("Campaign", campaignSchema);
