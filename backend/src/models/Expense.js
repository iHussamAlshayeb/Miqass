const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "transfer", "online", "other"],
      default: "cash",
    },
    vendorName: { type: String, default: "", trim: true },
    receiptUrl: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["Paid", "Pending", "Cancelled"],
      default: "Paid",
    },
    cancelReason: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

expenseSchema.index({ tenantId: 1, expenseDate: -1 }, { background: true });
expenseSchema.index(
  { tenantId: 1, category: 1, expenseDate: -1 },
  { background: true },
);
expenseSchema.index(
  { tenantId: 1, status: 1, expenseDate: -1 },
  { background: true },
);

module.exports = mongoose.model("Expense", expenseSchema);
