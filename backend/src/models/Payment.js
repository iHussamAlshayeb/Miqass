const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
    },

    // الوردية التي سُجلت فيها العملية (لإغلاق الصندوق)
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "CashShift", default: null },
    method: {
      type: String,
      enum: ["cash", "card", "transfer", "online"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      enum: ["Paid", "Pending", "Failed", "Refunded"],
      default: "Paid",
    },
    provider: { type: String, default: "" },
    providerPaymentId: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

paymentSchema.index({ tenantId: 1, saleId: 1 }, { background: true });
paymentSchema.index({ tenantId: 1, shiftId: 1 }, { background: true });
paymentSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });
paymentSchema.index({ tenantId: 1, method: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model("Payment", paymentSchema);
