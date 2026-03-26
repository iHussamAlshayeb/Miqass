const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    // 🔗 ربط العميل بالصالون الذي سجل فيه
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // 💡 بيانات التواصل الأساسية
    phone: {
      type: String,
      required: true,
      trim: true,
    },

    // 💡 اسم ولي الأمر (أو العميل الرئيسي)
    parentName: {
      type: String,
      default: "عميل قيم",
      trim: true,
    },

    // 💡 أسماء الأطفال التابعين لهذا الرقم (ميزة ذهبية لصالونات الأطفال)
    children: [{ type: String, trim: true }],

    // 💡 إحصائيات الولاء السريعة (تحدث تلقائياً مع كل حلاقة مكتملة)
    totalVisits: {
      type: Number,
      default: 0,
    },
    lastVisitDate: {
      type: Date,
    },

    // 💡 تقييم العميل داخلياً (هل هو عميل VIP؟ هل يتأخر دائماً؟)
    customerType: {
      type: String,
      enum: ["New", "Regular", "VIP", "Blacklisted"],
      default: "New",
    },
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - للـ High Traffic وتحليل البيانات
// ==========================================

// 1. [موجود مسبقاً] يمنع تكرار رقم الجوال لنفس الصالون، ويسرع التحقق وقت الحجز
customerSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, background: true },
);

// ---------------------------------------------------------
// 🚀 الفهارس الجديدة (Compound Indexes) لإنقاذ الأداء
// ---------------------------------------------------------

// 2. فهرس (كرون جوب التسويق الآلي + ترتيب الداشبورد)
// - ينقذ السيرفر عند ترتيب العملاء حسب آخر زيارة في لوحة التحكم.
// - يسرع كرون جوب الـ Retention الذي يبحث عن عملاء لم يزوروا الصالون منذ 30 يوماً.
customerSchema.index({ tenantId: 1, lastVisitDate: -1 }, { background: true });

// 3. فهرس (نظام الولاء و VIP)
// - يجعل استخراج قائمة "أفضل العملاء" (Top Customers) أو من يستحق الترقية لـ VIP لحظياً.
customerSchema.index({ tenantId: 1, totalVisits: -1 }, { background: true });

module.exports = mongoose.model("Customer", customerSchema);
