const Tenant = require("../models/Tenant");
const zatcaCore = require("../utils/zatcaCore");

const onboardZatca = async (req, res) => {
  try {
    const { otp, taxNumber } = req.body;
    const tenantId = req.tenantId;

    if (!taxNumber) {
      return res
        .status(400)
        .json({ message: "الرقم الضريبي مطلوب لإتمام الربط." });
    }

    const tenant = await Tenant.findById(tenantId).select(
      "salonName taxSettings settings address city",
    );
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    console.log(`[ZATCA Controller] بدء ربط صالون: ${tenant.salonName}`);

    const credentials = await zatcaCore.onboardDevice(otp, {
      salonName: tenant.salonName,
      taxNumber: taxNumber,
      address: tenant.address || "Saudi Arabia",
      city: tenant.city || "Riyadh",
    });

    await Tenant.updateOne(
      { _id: tenantId },
      {
        $set: {
          "taxSettings.taxNumber": taxNumber,
          "taxSettings.isZatcaOnboarded": true,
          "taxSettings.zatcaCredentials": {
            binarySecurityToken: credentials.binarySecurityToken,
            secret: credentials.secret,
            privateKey: credentials.privateKey,
          },
          "taxSettings.wafeqAccountId": "",
          "settings.wafeqAccountId": "",
        },
      },
    );

    res.status(200).json({
      message: "تم الربط المباشر مع خوادم هيئة الزكاة وإصدار الشهادة بنجاح! 🚀",
      taxSettings: {
        taxNumber,
        isZatcaOnboarded: true,
      },
    });
  } catch (error) {
    console.error("Zatca Direct Onboarding Error:", error);

    let errorMessage =
      "فشل الربط بهيئة الزكاة. تأكد من صلاحية كود الـ OTP (صالح لمدة ساعة واحدة فقط).";

    if (error.errors && Array.isArray(error.errors)) {
      errorMessage = error.errors.join(" | ");
    } else if (error.validationResults?.errorMessages?.length > 0) {
      errorMessage = error.validationResults.errorMessages
        .map((e) => e.message)
        .join(" | ");
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(400).json({ message: errorMessage });
  }
};

const checkZatcaStatus = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("taxSettings.isZatcaOnboarded taxSettings.taxNumber")
      .lean();

    const isConnected = tenant?.taxSettings?.isZatcaOnboarded || false;

    if (!isConnected) {
      return res.status(200).json({ isConnected: false, details: null });
    }

    res.status(200).json({
      isConnected: true,
      details: {
        taxNumber: tenant.taxSettings.taxNumber,
        status: "متصل بخوادم هيئة الزكاة مباشرة ✅",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "فشل التحقق من حالة الربط الضريبي." });
  }
};

const syncTenantZatcaInfo = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("taxSettings.isZatcaOnboarded")
      .lean();

    if (!tenant?.taxSettings?.isZatcaOnboarded) {
      return res
        .status(400)
        .json({ message: "الصالون غير مربوط لتحديث بياناته." });
    }

    res.status(200).json({
      message:
        "تم تحديث البيانات بنجاح. ⚠️ ملاحظة: إذا تغير رقمك الضريبي، يجب إلغاء الربط وإعادته برمز OTP جديد.",
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء المزامنة." });
  }
};

const disconnectZatca = async (req, res) => {
  try {
    const result = await Tenant.updateOne(
      { _id: req.tenantId },
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
      .json({ message: "تم إلغاء الربط ومسح الشهادات الرقمية بنجاح." });
  } catch (error) {
    console.error("Disconnect Error:", error);
    res.status(500).json({ message: "حدث خطأ أثناء محاولة إلغاء الربط." });
  }
};

module.exports = {
  onboardZatca,
  checkZatcaStatus,
  syncTenantZatcaInfo,
  disconnectZatca,
};
