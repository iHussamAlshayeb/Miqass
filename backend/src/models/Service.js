const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    // 🔗 ربط الخدمة بالصالون المالك لها
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // 💡 تفاصيل الخدمة
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "", // وصف اختياري للخدمة (مثال: قص شعر مع استشوار وغسيل)
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    duration: {
      type: Number, // المدة بالدقائق
      required: true,
      min: 5, // أقل مدة منطقية للخدمة
    },

    // 💡 تصنيف الخدمة (يفيد لاحقاً إذا أردت عرضها للعميل بشكل مرتب: "باقات"، "عناية"، "حلاقة")
    category: {
      type: String,
      default: "عام",
      trim: true,
    },

    // 💡 ميزة احترافية: إيقاف الخدمة مؤقتاً (بدل حذفها لتجنب مشاكل الإحصائيات)
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

// 1. فهرس (صفحة الحجز العامة) - الأهم!
// بما أن العميل يحتاج فقط الخدمات "النشطة" للصالون، هذا الفهرس يمنع جلب الخدمات المعطلة للذاكرة
serviceSchema.index({ tenantId: 1, isActive: 1 }, { background: true });

// 2. فهرس (ترتيب الفئات مستقبلاً)
// عندما تفعل ميزة "أقسام الخدمات" في واجهة العميل (مثال: قسم العناية، قسم الحلاقة)
serviceSchema.index(
  { tenantId: 1, category: 1, isActive: 1 },
  { background: true },
);

module.exports = mongoose.model("Service", serviceSchema);
