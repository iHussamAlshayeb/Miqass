const Tenant = require("../models/Tenant");
const Appointment = require("../models/Appointment");
const Review = require("../models/Review");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const SystemSettings = require("../models/SystemSettings");

const jwt = require("jsonwebtoken");
const { sendActivationEmail } = require("../utils/emailService");
const redisClient = require("../utils/redisClient"); // 💡 استدعاء الكاش

// ==========================================
// 🛠️ 1. جلب جميع الصالونات وحالة النظام
// ==========================================
const getAllTenants = async (req, res) => {
  try {
    // 🚀 جلب الصالونات باستبعاد الحقول الثقيلة والحساسة واستخدام lean
    const tenants = await Tenant.find()
      .select(
        "-password -taxSettings.zatcaCredentials -resetPasswordToken -resetPasswordExpires",
      )
      .sort({ createdAt: -1 })
      .lean();

    const settings = await SystemSettings.findOne({ isGlobal: true }).lean();

    res.status(200).json({
      tenants,
      isMaintenanceMode: settings ? settings.isMaintenanceMode : false,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات الصالونات" });
  }
};

// ==========================================
// 💸 2. جلب الأسعار والتخفيضات
// ==========================================
const getSystemPricing = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({ isGlobal: true }).lean();
    if (!settings) {
      settings = await SystemSettings.create({ isGlobal: true });
    }

    res.status(200).json({
      pricing: settings.pricing,
      discount: settings.discount,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب الأسعار" });
  }
};

// ==========================================
// 💾 3. تحديث الأسعار والتخفيضات
// ==========================================
const updateSystemPricing = async (req, res) => {
  try {
    const { pricing, discount } = req.body;

    const settings = await SystemSettings.findOneAndUpdate(
      { isGlobal: true },
      { $set: { pricing, discount } },
      { returnDocument: "after", upsert: true },
    ).lean();

    // 🚀 مسح كاش الأسعار ليظهر التحديث فوراً في صفحة الهبوط للعملاء
    try {
      await redisClient.del("system_pricing_public");
    } catch (e) {}

    res.status(200).json({
      message: "تم تحديث الإعدادات المالية بنجاح",
      pricing: settings.pricing,
      discount: settings.discount,
    });
  } catch (error) {
    console.error("Pricing Update Error:", error);
    res.status(500).json({ message: "حدث خطأ أثناء حفظ الإعدادات المالية" });
  }
};

// ==========================================
// 🛠️ 4. تفعيل/إيقاف وضع الصيانة
// ==========================================
const toggleMaintenanceMode = async (req, res) => {
  try {
    const { isMaintenanceMode } = req.body;

    const settings = await SystemSettings.findOneAndUpdate(
      { isGlobal: true },
      { $set: { isMaintenanceMode } },
      { returnDocument: "after", upsert: true },
    ).lean();

    // 🚀 تحديث الجدار الناري في الـ Redis فوراً ليطبق الحظر أو يرفعه!
    try {
      await redisClient.set(
        "system_maintenance_mode",
        String(settings.isMaintenanceMode),
      );
      await redisClient.set(
        "system_maintenance_message",
        settings.maintenanceMessage,
      );
    } catch (e) {}

    res.status(200).json({
      message: `تم ${isMaintenanceMode ? "تفعيل" : "إيقاف"} وضع الصيانة بنجاح`,
      isMaintenanceMode: settings.isMaintenanceMode,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تغيير حالة الصيانة" });
  }
};

// 5. تحديث حالة وباقة الصالون (تفعيل، إيقاف، أو ترقية)
const updateTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, plan, billingCycle } = req.body;

    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    if (status) tenant.subscription.status = status;
    if (plan) tenant.subscription.plan = plan;

    if (status === "Active" && plan !== "Free") {
      const endDate = new Date();
      if (billingCycle === "annual") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      tenant.subscription.endDate = endDate;

      // إرسال الإيميل في الخلفية (Fire and Forget)
      sendActivationEmail(
        tenant.email,
        tenant.ownerName,
        tenant.subscription.plan,
        tenant.subscription.endDate,
      ).catch((e) => {});
    } else if (plan === "Free") {
      tenant.subscription.endDate = null;
    }

    await tenant.save();

    // 🚀 مسح كاش الصالون ليظهر التحديث فوراً في صفحة الحجز
    try {
      await redisClient.del(`tenant_public_profile:${tenant.slug}`);
    } catch (e) {}

    res.status(200).json({ message: "تم تحديث بيانات الصالون بنجاح", tenant });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};

// 6. حذف الصالون نهائياً
const deleteTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    // مسح جميع البيانات المرتبطة بالتوازي لسرعة أكبر
    await Promise.all([
      Appointment.deleteMany({ tenantId: id }),
      Review.deleteMany({ tenantId: id }),
      Campaign.deleteMany({ tenantId: id }),
      Customer.deleteMany({ tenantId: id }),
      Barber.deleteMany({ tenantId: id }),
      Service.deleteMany({ tenantId: id }),
      Tenant.findByIdAndDelete(id),
    ]);

    // 🚀 مسح الكاش الخاص بالصالون المحذوف
    try {
      await redisClient.del(`tenant_public_profile:${tenant.slug}`);
    } catch (e) {}

    res
      .status(200)
      .json({ message: "تم حذف الصالون وجميع بياناته من كافة الجداول بنجاح" });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء حذف الصالون" });
  }
};

// 7. الدخول بصلاحية الصالون
const impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    // التحقق السريع من الوجود
    const tenantExists = await Tenant.exists({ _id: id });
    if (!tenantExists)
      return res.status(404).json({ message: "الصالون غير موجود" });

    const token = jwt.sign({ tenantId: id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تسجيل الدخول كصالون" });
  }
};

// 🚨 8. دالة فك الارتباط الضريبي الإجباري
const forceDisconnectZatca = async (req, res) => {
  try {
    const tenantId = req.params.id;

    // استخدام updateOne لفك الارتباط بسرعة البرق دون جلب السجل
    const result = await Tenant.updateOne(
      { _id: tenantId },
      {
        $set: {
          "taxSettings.isZatcaOnboarded": false,
          "taxSettings.zatcaCredentials": {
            binarySecurityToken: null,
            secret: null,
            privateKey: null,
          },
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "الصالون غير موجود" });
    }

    res
      .status(200)
      .json({ message: "تم فك الارتباط الضريبي ومسح المفاتيح بنجاح." });
  } catch (error) {
    console.error("Admin Force Disconnect ZATCA Error:", error);
    res
      .status(500)
      .json({ message: error.message || "حدث خطأ أثناء محاولة فك الارتباط." });
  }
};

module.exports = {
  getAllTenants,
  updateTenantStatus,
  deleteTenant,
  impersonateTenant,
  forceDisconnectZatca,
  toggleMaintenanceMode,
  getSystemPricing,
  updateSystemPricing,
};
