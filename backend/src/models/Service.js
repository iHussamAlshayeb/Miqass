const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    duration: {
      type: Number,
      required: true,
      min: 5,
    },

    category: {
      type: String,
      default: "عام",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    // حذف لعنصر له سجل مبيعات أو حجوزات: يختفي من كل القوائم ويبقى للتقارير والفواتير القديمة
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

serviceSchema.index({ tenantId: 1, isActive: 1 }, { background: true });

serviceSchema.index(
  { tenantId: 1, category: 1, isActive: 1 },
  { background: true },
);

module.exports = mongoose.model("Service", serviceSchema);
