const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    name: { type: String, required: true, trim: true },
    sku: { type: String, default: "", trim: true },
    barcode: { type: String, default: "", trim: true },
    category: { type: String, default: "عام", trim: true },

    salePrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 3, min: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ tenantId: 1, isActive: 1, name: 1 }, { background: true });
productSchema.index({ tenantId: 1, category: 1 }, { background: true });
productSchema.index(
  { tenantId: 1, sku: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { sku: { $type: "string", $gt: "" } },
  },
);
productSchema.index(
  { tenantId: 1, barcode: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { barcode: { $type: "string", $gt: "" } },
  },
);

module.exports = mongoose.model("Product", productSchema);
