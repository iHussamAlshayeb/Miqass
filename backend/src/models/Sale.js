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
    requestId: { type: String, default: undefined },
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
    zakaty: {
      status: { type: String, default: "NotSubmitted" },
      externalInvoiceId: { type: String, default: "" },
      payload: { type: mongoose.Schema.Types.Mixed, default: null },
      invoiceId: { type: String, default: "" },
      uuid: { type: String, default: "" },
      invoiceHash: { type: String, default: "" },
      qrBase64: { type: String, default: "" },
      submittedAt: { type: Date, default: null },
      checkedAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      lastError: { type: String, default: "" },
      lockOwner: { type: String, default: "" },
      lockExpiresAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

saleSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });
saleSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
saleSchema.index(
  { tenantId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } },
);
saleSchema.index({ tenantId: 1, customerId: 1 }, { background: true });
saleSchema.index(
  { appointmentId: 1, tenantId: 1 },
  { unique: true, partialFilterExpression: { appointmentId: { $type: "objectId" } } },
);
saleSchema.index({ tenantId: 1, status: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model("Sale", saleSchema);
