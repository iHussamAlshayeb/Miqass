const mongoose = require("mongoose");

// كاشير نقطة البيع: يدخل برمز PIN ولا يصل إلا لنقطة البيع.
// جدول مستقل عن الصالون حتى لا يقترب رمزه المشفر من أي بيانات تُعرض للعامة.
const cashierSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    pinHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

cashierSchema.index({ tenantId: 1, isActive: 1 });
cashierSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Cashier", cashierSchema);
