const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    // 🔗 الروابط الأساسية
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
    }, // موعد واحد = تقييم واحد
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    // 💡 ربط التقييم بالحلاق (يفتح لك باب "تقييم أداء الموظفين" في لوحة التحكم)
    barberId: { type: mongoose.Schema.Types.ObjectId, ref: "Barber" },

    // 💡 بيانات التقييم
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
    },

    // 💡 رد إدارة الصالون على العميل
    reply: {
      type: String,
      default: "",
      trim: true,
    },

    // 💡 هل يُعرض هذا التقييم في صفحة الحجز العامة للصالون؟
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - للـ High Traffic والتحليلات
// ==========================================

// 1. [موجود مسبقاً عبر unique: true في الحقل] - يمنع العميل من تقييم نفس الموعد مرتين
// reviewSchema.index({ appointmentId: 1 }); // يتم إنشاؤه تلقائياً

// ---------------------------------------------------------
// 🚀 الفهارس المركبة (Compound Indexes) لإنقاذ الأداء
// ---------------------------------------------------------

// 2. فهرس (صفحة الحجز العامة) - الأهم على الإطلاق!
// يجلب التقييمات العامة للصالون مرتبة من الأحدث للأقدم في أجزاء من الثانية (بدون تحميل على RAM)
reviewSchema.index(
  { tenantId: 1, isPublic: 1, createdAt: -1 },
  { background: true },
);

// 3. فهرس (داشبورد الإدارة)
// لصاحب الصالون لرؤية كل التقييمات (العامة والخاصة) مرتبة حسب الأحدث للرد عليها
reviewSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

// 4. فهرس (تحليل أداء الطاقم)
// مفيد جداً لحساب "متوسط التقييم" (Average Rating) لكل حلاق بسرعة البرق
reviewSchema.index({ barberId: 1, rating: 1 }, { background: true });

module.exports = mongoose.model("Review", reviewSchema);
