const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
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

    itemType: {
      type: String,
      enum: ["service", "product", "custom"],
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.01 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0.15 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

saleItemSchema.index({ tenantId: 1, saleId: 1 }, { background: true });
saleItemSchema.index({ tenantId: 1, itemType: 1, createdAt: -1 }, { background: true });
saleItemSchema.index({ tenantId: 1, serviceId: 1 }, { background: true });
saleItemSchema.index({ tenantId: 1, productId: 1 }, { background: true });

module.exports = mongoose.model("SaleItem", saleItemSchema);
