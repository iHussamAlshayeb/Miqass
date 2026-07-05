const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },

    source: {
      type: String,
      enum: ["appointment", "walk_in", "pos"],
      default: "pos",
    },
    status: {
      type: String,
      enum: ["Draft", "Paid", "Partially_Paid", "Refunded", "Cancelled"],
      default: "Draft",
    },

    invoiceNumber: { type: String, required: true },
    customerSnapshot: {
      name: { type: String, default: "عميل نقدي" },
      phone: { type: String, default: "" },
    },

    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },

    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true },
);

saleSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });
saleSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
saleSchema.index({ tenantId: 1, customerId: 1 }, { background: true });
saleSchema.index({ tenantId: 1, appointmentId: 1 }, { background: true });
saleSchema.index({ tenantId: 1, status: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model("Sale", saleSchema);
