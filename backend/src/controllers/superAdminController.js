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
const redisClient = require("../utils/redisClient");
const {
  RETENTION_DAYS,
  softDeleteTenant,
  restoreTenant,
} = require("../services/tenantDeletionService");

const getAllTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find()
      .select(
        "-password -taxSettings.zatcaCredentials -taxSettings.zakaty.apiKey -resetPasswordToken -resetPasswordExpires -whatsappSettings.apiKey -whatsappSettings.apiKeyHash -whatsappSettings.webhookSecret -paymentSettings.moyasarSecretKey",
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

const updateSystemPricing = async (req, res) => {
  try {
    const { pricing, discount } = req.body;

    const settings = await SystemSettings.findOneAndUpdate(
      { isGlobal: true },
      { $set: { pricing, discount } },
      { returnDocument: "after", upsert: true },
    ).lean();

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

const toggleMaintenanceMode = async (req, res) => {
  try {
    const { isMaintenanceMode } = req.body;

    const settings = await SystemSettings.findOneAndUpdate(
      { isGlobal: true },
      { $set: { isMaintenanceMode } },
      { returnDocument: "after", upsert: true },
    ).lean();

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

    try {
      await redisClient.del(`tenant_public_profile:${tenant.slug}`);
    } catch (e) {}

    const safeTenant = tenant.toObject();
    if (safeTenant.taxSettings?.zakaty) delete safeTenant.taxSettings.zakaty.apiKey;
    res.status(200).json({ message: "تم تحديث بيانات الصالون بنجاح", tenant: safeTenant });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};

const sendServiceError = (res, error, fallback) =>
  res
    .status(error.statusCode || 500)
    .json({ message: error.statusCode ? error.message : fallback });

// حذف مؤقت لمدة RETENTION_DAYS مع إمكانية الاسترجاع
const deleteTenant = async (req, res) => {
  try {
    const result = await softDeleteTenant(req.params.id, req.body?.confirmSlug);
    res.status(200).json({
      message: `تم إيقاف وإخفاء "${result.salonName}". سيُحذف نهائياً بعد ${RETENTION_DAYS} يوماً ويمكن استرجاعه قبل ذلك.`,
      purgeAfter: result.purgeAfter,
    });
  } catch (error) {
    sendServiceError(res, error, "حدث خطأ أثناء حذف الصالون");
  }
};

const restoreDeletedTenant = async (req, res) => {
  try {
    const result = await restoreTenant(req.params.id);
    res.status(200).json({ message: `تم استرجاع "${result.salonName}" بحالته السابقة.` });
  } catch (error) {
    sendServiceError(res, error, "حدث خطأ أثناء استرجاع الصالون");
  }
};

const impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantExists = await Tenant.exists({ _id: id, deletedAt: null });
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

const forceDisconnectZatca = async (req, res) => {
  try {
    const tenantId = req.params.id;

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
  restoreDeletedTenant,
  impersonateTenant,
  forceDisconnectZatca,
  toggleMaintenanceMode,
  getSystemPricing,
  updateSystemPricing,
};
