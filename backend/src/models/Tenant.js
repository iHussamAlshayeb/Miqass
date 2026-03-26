const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    // ==========================================
    // 1. البيانات الأساسية للصالون
    // ==========================================
    salonName: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    ownerName: { type: String, required: true, trim: true },
    ownerPhone: { type: String, required: true, trim: true },

    // ==========================================
    // 2. بيانات الدخول (للوحة التحكم)
    // ==========================================
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // ==========================================
    // 3. الهوية البصرية (White-labeling)
    // ==========================================
    branding: {
      logoUrl: { type: String, default: "/default-logo.png" },
      primaryColor: { type: String, default: "#3b82f6" },
      secondaryColor: { type: String, default: "#ec4899" },
    },

    // 💡 ملاحظة: تم حذف (services) و (barbers) من هنا لأنها أصبحت جداول مستقلة!

    // ==========================================
    // 4. إعدادات الحجز والتسويق (CRM)
    // ==========================================
    settings: {
      // الدوام
      startTime: { type: String, default: "16:00" },
      endTime: { type: String, default: "22:00" },
      slotDuration: { type: Number, default: 30 },
      breakStart: { type: String, default: "" },
      breakEnd: { type: String, default: "" },
      closedDates: { type: [String], default: [] },
      maxBookingDate: { type: String, default: "" },
      locationUrl: { type: String, default: "" },

      // التسويق
      googleReviewLink: { type: String, default: "" },
      enableGoogleReviews: { type: Boolean, default: false },
      isLoyaltyEnabled: { type: Boolean, default: false },
      loyaltyVisitsRequired: { type: Number, default: 5 },
      isRetentionEnabled: { type: Boolean, default: false },
      retentionDays: { type: Number, default: 30 },
    },

    // ==========================================
    // 5. إعدادات الضرائب وهيئة الزكاة (ZATCA & Wafeq)
    // ==========================================
    taxSettings: {
      taxNumber: { type: String, default: "" },
      wafeqAccountId: { type: String, default: "" },
      isZatcaOnboarded: { type: Boolean, default: false },

      // 💡 الحقل السحري لحفظ المفاتيح والشهادات:
      zatcaCredentials: {
        binarySecurityToken: { type: String, default: null },
        secret: { type: String, default: null },
        privateKey: { type: String, default: null },
      },
    },

    // ==========================================
    // 6. إعدادات الواتساب (WhatsApp API)
    // ==========================================
    whatsappSettings: {
      apiKey: { type: String, default: "" },
      isEnabled: { type: Boolean, default: false },
      sessionId: { type: String, default: null },
      sessionStatus: { type: String, default: "DISCONNECTED" },
      webhookSecret: { type: String },
    },

    // ==========================================
    // 7. بيانات الاشتراك (SaaS Billing)
    // ==========================================
    subscription: {
      plan: {
        type: String,
        enum: ["Free", "Pro", "Premium"],
        default: "Free",
      },
      status: {
        type: String,
        enum: ["Active", "Pending_Approval", "Inactive", "Pending"],
        default: "Active",
      },
      endDate: {
        type: Date,
        default: null,
      },
      billingCycle: {
        type: String,
        enum: ["monthly", "annual"],
        default: "monthly",
      },
    },

    // ==========================================
    // 8. إعدادات الدفع الإلكتروني (Moyasar BYOG) 💳
    // ==========================================
    paymentSettings: {
      isOnlinePaymentEnabled: { type: Boolean, default: false }, // هل الصالون فعل الدفع المسبق؟
      depositAmount: { type: Number, default: 0 }, // قيمة العربون بالريال (مثلاً 50)
      moyasarPublishableKey: { type: String, default: "" }, // المفتاح العام (يُرسل للفرونت إند)
      moyasarSecretKey: { type: String, default: "" }, // المفتاح السري (مُشفر)
    },

    campaignCredits: { type: Number, default: 0 },
    invoiceCounter: {
      type: Number,
      default: 100,
    },

    bio: {
      type: String,
      default: "أهلاً بكم في صالوننا! نسعى لتقديم أفضل تجربة حلاقة وعناية.",
    },
    socialLinks: {
      instagram: { type: String, default: "" },
      tiktok: { type: String, default: "" },
      snapchat: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

// ==========================================
// 💡 الفهارس (Indexes) - للـ Super Admin والـ Cron Jobs
// ==========================================

// 2. فهرس (الـ Super Admin Dashboard)
tenantSchema.index(
  { "subscription.status": 1, createdAt: -1 },
  { background: true },
);

// 3. فهرس (كرون جوب الاشتراكات)
tenantSchema.index(
  { "subscription.endDate": 1, "subscription.status": 1 },
  { background: true },
);

// 4. فهرس (كرون جوب الواتساب)
tenantSchema.index(
  { "whatsappSettings.sessionStatus": 1 },
  { background: true },
);

module.exports = mongoose.model("Tenant", tenantSchema);
