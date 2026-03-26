const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true, // إجبار الكود على أن يكون بأحرف كبيرة (مثال: RAMADAN)
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"], // نسبة مئوية (مثلاً 20%) أو خصم ثابت (مثلاً 50 ريال)
      default: "percentage",
    },
    discountValue: {
      type: Number,
      required: true,
    },
    maxUses: {
      type: Number,
      default: 100, // الحد الأقصى لعدد مرات الاستخدام
    },
    usedCount: {
      type: Number,
      default: 0, // العداد التلقائي للاستخدام
    },
    expiryDate: {
      type: Date,
      required: true, // تاريخ انتهاء الصلاحية
    },
    isActive: {
      type: Boolean,
      default: true, // مفتاح لتعطيل الكوبون يدوياً في أي وقت
    },
  },
  { timestamps: true },
);
// ==========================================
// 💡 الفهارس (Indexes) - للـ High Traffic والبحث السريع
// ==========================================

// 1. [موجود مسبقاً عبر unique: true] - يفهرس الـ code لسرعة التحقق
// promoCodeSchema.index({ code: 1 }); // يتم إنشاؤه تلقائياً

// 2. فهرس (للوحة تحكم الـ Super Admin)
// المدير يريد رؤية الكوبونات مرتبة من الأحدث للأقدم.
// بدون هذا الفهرس، إذا كان لديك 5000 كوبون، سيتعطل السيرفر وهو يحاول ترتيبها في الـ RAM!
promoCodeSchema.index({ createdAt: -1 }, { background: true });

// 3. فهرس (لعمليات التنظيف التلقائية المستقبيلة)
// إذا أردت لاحقاً أتمتة حذف أو أرشفة الكوبونات المنتهية منذ فترة طويلة
promoCodeSchema.index({ expiryDate: 1 }, { background: true });

module.exports = mongoose.model("PromoCode", promoCodeSchema);
