const mongoose = require("mongoose");

const inventoryMovementSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    type: {
      type: String,
      enum: ["initial", "purchase", "sale", "return", "adjustment"],
      required: true,
    },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    balanceAfter: { type: Number, required: true },

    referenceType: {
      type: String,
      enum: ["Product", "Sale", "SaleItem", "Manual"],
      default: "Manual",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

inventoryMovementSchema.index(
  { tenantId: 1, productId: 1, createdAt: -1 },
  { background: true },
);
inventoryMovementSchema.index(
  { tenantId: 1, type: 1, createdAt: -1 },
  { background: true },
);

module.exports = mongoose.model("InventoryMovement", inventoryMovementSchema);
