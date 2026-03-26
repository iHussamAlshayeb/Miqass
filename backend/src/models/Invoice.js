const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }, // الموعد المرتبط
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },

    invoiceNumber: { type: Number, required: true }, // رقم تسلسلي (1, 2, 3...)
    paymentMethod: {
      type: String,
      enum: ["Cash", "POS", "ApplePay", "Online"],
      default: "POS",
    },

    totalAmount: { type: Number, required: true },
    vatAmount: { type: Number, required: true },

    zatcaStatus: {
      type: String,
      enum: ["Pending", "Reported", "Failed"],
      default: "Pending",
    },
    zatcaQrCode: { type: String }, // الـ QR المعتمد
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - للـ High Traffic والتقارير المالية
// ==========================================

// 1. [أهم فهرس أمني]: يمنع تكرار رقم الفاتورة لنفس الصالون المستحيل!
// هذا يحميك قانونياً من تقاطع أرقام الفواتير (Race Conditions)
invoiceSchema.index(
  { tenantId: 1, invoiceNumber: 1 },
  { unique: true, background: true },
);

// 2. فهرس (التقارير المالية للداشبورد)
// - يعرض فواتير الصالون مرتبة من الأحدث للأقدم بسرعة خيالية.
// - يسرع حساب إيرادات "اليوم" أو "الشهر" للصالون.
invoiceSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

// 3. فهرس (عامل الزكاة - ZATCA Background Worker)
// - في حال فشل إرسال فاتورة للزكاة (بسبب انقطاع نت أو صيانة موقعهم)،
// الكرون جوب سيبحث عن الفواتير الـ Pending أو Failed لإعادة إرسالها بصمت.
invoiceSchema.index({ zatcaStatus: 1, createdAt: 1 }, { background: true });

// 4. فهرس (سجل العميل)
// - لمعرفة كم صرف هذا العميل في هذا الصالون بسرعة.
invoiceSchema.index({ tenantId: 1, customerId: 1 }, { background: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
