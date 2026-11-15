const mongoose = require("mongoose");

// استرجاع (إشعار دائن) لفاتورة مدفوعة: كاملة أو بنود/كميات منها.
// الفاتورة الأصلية تبقى كما هي (لتبليغها وربط الإشعار بها في Zakaty)، ويُحفظ مجموع المسترجع عليها.
const refundItemSchema = new mongoose.Schema(
  {
    saleItemId: { type: mongoose.Schema.Types.ObjectId, ref: "SaleItem", required: true },
    itemType: { type: String, enum: ["service", "product", "custom"], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    serviceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    barberName: { type: String, default: "" },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.01 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0.15 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const saleRefundSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "CashShift", default: null },
    refundNumber: { type: String, required: true },
    items: { type: [refundItemSchema], default: [] },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ["cash", "card", "transfer"], required: true },
    reason: { type: String, required: true, maxlength: 200 },
    refundedBy: { type: String, default: "" },
    restocked: { type: Boolean, default: false },
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
      lastError: { type: String, default: "" },
      attempts: { type: Number, default: 0 },
      lockOwner: { type: String, default: "" },
      lockExpiresAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

saleRefundSchema.index({ tenantId: 1, saleId: 1 });
saleRefundSchema.index({ tenantId: 1, shiftId: 1 });
saleRefundSchema.index({ tenantId: 1, createdAt: -1 });
saleRefundSchema.index({ tenantId: 1, refundNumber: 1 }, { unique: true });

module.exports = mongoose.model("SaleRefund", saleRefundSchema);
