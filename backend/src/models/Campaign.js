const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    // 🔗 الصالون المُرسِل
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // 💡 محتوى الرسالة
    messageTemplate: { type: String, required: true, trim: true },

    // 💡 الفئة المستهدفة (كل العملاء، المنقطعين منذ 30 يوم، عملاء VIP...)
    targetAudience: { type: String, required: true },

    // 💡 قائمة العملاء الذين ستصلهم الرسالة وحالة كل رسالة
    targetCustomers: [
      {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
        phone: { type: String, required: true },
        name: { type: String, required: true },
        status: {
          type: String,
          enum: ["Pending", "Sent", "Failed"],
          default: "Pending",
        },
        errorMessage: { type: String, default: "" }, // في حال فشل الإرسال لرقم معين
      },
    ],

    // 💡 حالة الحملة ككل
    status: {
      type: String,
      enum: ["Pending", "Processing", "Completed", "Failed"],
      default: "Pending",
    },

    // 💡 توقيت الانتهاء من الإرسال
    completedAt: { type: Date },
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - للـ High Traffic
// ==========================================

// 1. فهرس (الكرون جوب) - ينقذ الـ CPU من الانهيار!
// الكرون يبحث كل دقيقة عن { status: 'Pending' } أو { status: 'Processing' }.
// بدون هذا الفهرس، السيرفر سيقرأ كل حملات النظام منذ تأسيسه!
// إضافة (createdAt: 1) تجعله يعالج الحملات القديمة أولاً (نظام الطابور FIFO).
campaignSchema.index({ status: 1, createdAt: 1 }, { background: true });

// 2. فهرس (الداشبورد) - لسرعة جلب حملات صالون معين
// صاحب الصالون يريد رؤية حملاته مرتبة من الأحدث للأقدم، هذا الفهرس يجلبها في 2 ملي ثانية.
campaignSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model("Campaign", campaignSchema);
