const mongoose = require("mongoose");

const barberSchema = new mongoose.Schema(
  {
    // 🔗 ربط الحلاق بالصالون الذي يعمل فيه
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // 💡 بيانات الحلاق / الكرسي
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // 💡 الرمز السري الخاص بدخول الحلاق لـ (بوابة الطاقم) - أصبح اختيارياً
    pin: {
      type: String,
      default: "", // ✅ إذا لم يضع المدير رقماً، سيُحفظ كفراغ ولن ينهار النظام
    },

    // بيانات إضافية للتواصل الداخلي (اختيارية)
    phone: {
      type: String,
      default: "",
      trim: true,
    },

    // 💡 ميزة احترافية: نسبة العمولة للحلاق (يفتح لك باباً لبيع ميزة "إدارة الرواتب" للصالونات لاحقاً 💰)
    commissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // 💡 التحكم بظهور الحلاق (مثلاً: ذهب في إجازة، نجعله false ليختفي من الحجز بدون أن نحذفه)
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - للـ High Traffic
// ==========================================

// 1. فهرس مركب (Compound Index) لإنقاذ صفحة الحجز
// صفحة الحجز تطلب دائماً (الحلاقين + النشطين فقط). هذا الفهرس يمنع البحث العشوائي ويوفر الـ RAM.
barberSchema.index({ tenantId: 1, isActive: 1 }, { background: true });

// 2. فهرس فريد (Unique Compound Index) لمنع التكرار وتسريع الدخول
// - يمنع مدير الصالون من إنشاء حلاقين بنفس الاسم (مثلاً كلاهما "محمد") مما يسبب مشاكل للعملاء.
// - يسرع جداً عملية تسجيل دخول الحلاق من شاشة الـ Kiosk لأنه يبحث بـ tenantId و name.
barberSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true, background: true },
);

module.exports = mongoose.model("Barber", barberSchema);
