const mongoose = require("mongoose");

// جهاز نقطة بيع فعّله المالك. دخول الكاشير برمزه لا يعمل إلا من جهاز مفعّل،
// فلا يكفي معرفة رابط الصالون وتخمين الرمز. يُخزن بصمة التوكن فقط (sha256).
const posDeviceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    tokenHash: { type: String, required: true, select: false },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    // محاولات رمز خاطئة من هذا الجهاز
    loginFailures: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

posDeviceSchema.index({ tokenHash: 1 }, { unique: true });
posDeviceSchema.index({ tenantId: 1, revokedAt: 1 });

module.exports = mongoose.model("PosDevice", posDeviceSchema);
