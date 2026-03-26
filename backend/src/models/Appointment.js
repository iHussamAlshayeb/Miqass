const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    // ==========================================
    // ⭐ 1. الروابط المركزية (Relations)
    // ==========================================
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barber",
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },

    // ==========================================
    // ⭐ 2. بيانات الموعد الزمانية
    // ==========================================
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },

    // ==========================================
    // ⭐ 3. اللقطات الثابتة (Snapshots)
    // ==========================================
    childName: { type: String, required: true },
    barberName: { type: String, required: true },

    selectedServices: [
      {
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
        name: String,
        price: Number,
        duration: Number,
      },
    ],

    // ==========================================
    // ⭐ 4. الحسابات النهائية للموعد
    // ==========================================
    totalPrice: {
      type: Number,
      default: 0,
    },
    totalDuration: {
      type: Number,
      default: 30,
    },

    // ==========================================
    // ⭐ 5. حالة الموعد وتفاصيل الإلغاء
    // ==========================================
    status: {
      type: String,
      // 💡 تمت إضافة حالة "Pending_Payment" لتعليق الموعد حتى يتم الدفع
      enum: ["Pending_Payment", "Booked", "Completed", "Cancelled", "Blocked"],
      default: "Booked",
    },
    cancelReason: {
      type: String,
      default: null,
    },

    // ==========================================
    // ⭐ 6. تتبع العمليات (Tracking)
    // ==========================================
    isReminded: {
      type: Boolean,
      default: false,
    },
    isReviewRequested: {
      type: Boolean,
      default: false,
    },
    invoiceNumber: {
      type: String,
    },

    // ==========================================
    // ⭐ 7. بيانات الدفع الإلكتروني (Moyasar) 💳
    // ==========================================
    payment: {
      status: {
        type: String,
        enum: ["Not_Required", "Pending", "Paid", "Failed", "Refunded"],
        default: "Not_Required",
      },
      amount: { type: Number, default: 0 }, // مبلغ العربون المدفوع
      moyasarPaymentId: { type: String, default: null }, // رقم العملية في ميسر للربط والاسترجاع
      method: { type: String, default: null }, // نوع الدفع (applepay, stcpay, creditcard)
    },
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - لمنع التعارض وتسريع البحث
// ==========================================

// 1. يمنع حجز نفس الحلاق في نفس اليوم والوقت للصالون (يتجاهل الملغاة)
appointmentSchema.index(
  { tenantId: 1, date: 1, timeSlot: 1, barberId: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "Cancelled" } } },
);

// 2. لتسريع جلب مواعيد عميل معين للصالون
appointmentSchema.index({ tenantId: 1, customerId: 1 }, { background: true });

// 3. لإنقاذ دالة (getAvailableSlots) والداشبورد اليومي
appointmentSchema.index(
  { tenantId: 1, date: 1, barberName: 1, status: 1 },
  { background: true },
);

// 4. لتسريع الكرون جوب الخاص بـ (التذكيرات)
appointmentSchema.index(
  { status: 1, isReminded: 1, date: 1 },
  { background: true },
);

// 5. لتسريع الكرون جوب الخاص بـ (التقييمات)
appointmentSchema.index(
  { status: 1, isReviewRequested: 1, date: 1 },
  { background: true },
);

// 6. مخصص للتسويق الآلي (Retention) وجلب إحصائيات الداشبورد
appointmentSchema.index(
  { tenantId: 1, status: 1, date: -1 },
  { background: true },
);

// 7. 🚀 فهرس مخصص لتنظيف المواعيد غير المدفوعة (Cron Job)
// هذا الفهرس سيجعل الكرون جوب الذي يمسح المواعيد المعلقة يبحث في أجزاء من الثانية
appointmentSchema.index(
  { status: 1, createdAt: 1 },
  { background: true, partialFilterExpression: { status: "Pending_Payment" } },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
