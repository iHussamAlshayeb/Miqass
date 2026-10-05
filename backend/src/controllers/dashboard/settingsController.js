// إعدادات الصالون والحلاقين والخدمات وواتساب
const Tenant = require("../../models/Tenant");
const Barber = require("../../models/Barber");
const Service = require("../../models/Service");
const mongoose = require("mongoose");
const { encrypt, hashForLookup } = require("../../utils/encryption");
const { hashPin, isValidPin, normalizePinInput } = require("../../utils/barberPin");
const { compressLogoDataUri, isDataUriLogo, publicLogoUrl } = require("../../utils/logoImage");
const { DEFAULT_TEMPLATES, getTemplates, validateTemplates } = require("../../utils/whatsappTemplates");
const { normalizeBarberLeaves } = require("../../utils/barberLeave");

// لوحة التحكم لا تحتاج المفتاح نفسه ولا أسرار الـ webhook
const toSafeWhatsappSettings = (settings = {}) => ({
  isEnabled: Boolean(settings?.isEnabled),
  sessionStatus: settings?.sessionStatus || "DISCONNECTED",
  hasApiKey: Boolean(settings?.apiKey),
  provider: settings?.provider === "whatsi" ? "whatsi" : "wasender",
});

// 1. جلب إعدادات الصالون بالكامل
const getBarberSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const services = await Service.find({
      tenantId: tenant._id,
      isActive: true,
    }).lean();
    const barbers = await Barber.find({ tenantId: tenant._id })
      .select("+pin")
      .lean();

    // لا نُرجع الرمز نفسه (مشفّر)، فقط هل يوجد رمز أم لا
    const barbersData = barbers.map((b) => ({
      _id: b._id,
      name: b.name,
      iconColor: b.iconColor || "",
      hasPin: !!b.pin,
      isActive: b.isActive !== false,
      leaves: normalizeBarberLeaves(b.leaves),
    }));

    const safePaymentSettings = {
      isOnlinePaymentEnabled:
        tenant.paymentSettings?.isOnlinePaymentEnabled || false,
      depositAmount: tenant.paymentSettings?.depositAmount || 0,
      provider: "moyasar",
      moyasarPublishableKey:
        tenant.paymentSettings?.moyasarPublishableKey || "",
      hasSecretKey: !!tenant.paymentSettings?.moyasarSecretKey,
    };

    res.status(200).json({
      salonName: tenant.salonName || "",
      ownerName: tenant.ownerName || "",
      settings: {
        ...(tenant.settings || {}),
      },
      subscription: tenant.subscription || { plan: "Free", status: "active" },
      campaignCredits: tenant.campaignCredits || 0,
      slug: tenant.slug || "",
      whatsappSettings: toSafeWhatsappSettings(tenant.whatsappSettings),
      whatsappTemplates: getTemplates(tenant),
      whatsappTemplateDefaults: DEFAULT_TEMPLATES,
      paymentSettings: safePaymentSettings,
      ownerPhone: tenant.ownerPhone || "",
      // لوحة التحكم تعرض الشعار عبر رابطه بدل تحميل الصورة داخل الرد
      branding: {
        ...(tenant.branding || {}),
        logoUrl: publicLogoUrl(tenant.slug, tenant.branding?.logoUrl),
      },
      tenantId: tenant._id,
      bio: tenant.bio || "",
      socialLinks: tenant.socialLinks || {
        instagram: "",
        tiktok: "",
        snapchat: "",
      },
      barbers: barbersData,
      services: services,
      taxNumber: tenant.taxSettings?.taxNumber || "",
    });
  } catch (error) {
    res.status(500).json({ message: "خطأ في جلب الإعدادات" });
  }
};

// 2. تحديث إعدادات الصالون والحلاقين والخدمات
const updateBarberSettings = async (req, res) => {
  try {
    let {
      salonName,
      ownerName,
      startTime,
      endTime,
      slotDuration,
      closedDates,
      breakStart,
      breakEnd,
      maxBookingDate,
      locationUrl,
      contactPhone,
      ownerPhone,
      logoUrl,
      barbers,
      services,
      googleReviewLink,
      enableGoogleReviews,
      isLoyaltyEnabled,
      loyaltyVisitsRequired,
      isRetentionEnabled,
      retentionDays,
      taxNumber,
      bio,
      socialLinks,
      branding,
      paymentSettings,
    } = req.body;

    const tenant = await Tenant.findById(req.tenantId).select(
      "slug subscription bio socialLinks branding settings taxSettings paymentSettings",
    );
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const currentPlan = tenant.subscription?.plan || "Free";

    if (currentPlan === "Free" && barbers && barbers.length > 2) {
      return res.status(403).json({
        message:
          "الباقة الأساسية تسمح بكرسيين (2) كحد أقصى. يرجى الترقية للاحترافية! 🚀",
      });
    }

    tenant.salonName = salonName || tenant.salonName;
    tenant.ownerName = ownerName || tenant.ownerName;
    tenant.ownerPhone = ownerPhone || tenant.ownerPhone;
    tenant.bio = bio !== undefined ? bio : tenant.bio;

    if (socialLinks) tenant.socialLinks = socialLinks;
    if (!tenant.branding) tenant.branding = {};
    const requestedLogo = branding?.logoUrl || logoUrl;
    // "/logo/<slug>?v=..." هو الرابط الذي أرسلناه للوحة؛ يعني أن الشعار لم يتغير
    if (requestedLogo && !String(requestedLogo).startsWith("/logo/")) {
      tenant.branding.logoUrl = isDataUriLogo(requestedLogo)
        ? await compressLogoDataUri(requestedLogo)
        : requestedLogo;
    }
    tenant.branding.primaryColor =
      branding?.primaryColor || tenant.branding.primaryColor || "#3b82f6";
    tenant.branding.secondaryColor =
      branding?.secondaryColor || tenant.branding.secondaryColor || "#cbd5e1";

    if (!tenant.settings) tenant.settings = {};
    Object.assign(tenant.settings, {
      startTime,
      endTime,
      slotDuration,
      closedDates,
      breakStart,
      breakEnd,
      maxBookingDate,
      locationUrl,
      contactPhone:
        contactPhone !== undefined
          ? String(contactPhone).replace(/[^\d+]/g, "").slice(0, 15)
          : tenant.settings.contactPhone,
      googleReviewLink,
      enableGoogleReviews,
      isLoyaltyEnabled,
      loyaltyVisitsRequired,
      isRetentionEnabled,
      retentionDays,
    });

    if (!tenant.taxSettings) tenant.taxSettings = {};
    if (taxNumber !== undefined) tenant.taxSettings.taxNumber = taxNumber;

    if (paymentSettings) {
      if (!tenant.paymentSettings) tenant.paymentSettings = {};
      if (paymentSettings.isOnlinePaymentEnabled !== undefined)
        tenant.paymentSettings.isOnlinePaymentEnabled =
          paymentSettings.isOnlinePaymentEnabled;
      if (paymentSettings.depositAmount !== undefined)
        tenant.paymentSettings.depositAmount = Number(
          paymentSettings.depositAmount,
        );
      tenant.paymentSettings.provider = "moyasar";
      if (paymentSettings.moyasarPublishableKey !== undefined)
        tenant.paymentSettings.moyasarPublishableKey =
          paymentSettings.moyasarPublishableKey.trim();

      if (
        paymentSettings.moyasarSecretKey &&
        paymentSettings.moyasarSecretKey.trim() !== "" &&
        !paymentSettings.moyasarSecretKey.includes("****")
      ) {
        tenant.paymentSettings.moyasarSecretKey = encrypt(
          paymentSettings.moyasarSecretKey.trim(),
        );
      }

      if (
        tenant.paymentSettings.isOnlinePaymentEnabled &&
        !tenant.paymentSettings.moyasarSecretKey
      ) {
        return res.status(400).json({
          message: "أدخل المفتاح السري لميسر قبل تفعيل الدفع الإلكتروني.",
        });
      }
    }

    if (Array.isArray(barbers)) {
      const normalizedNames = barbers.map((barber) =>
        String(typeof barber === "string" ? barber : barber?.name || "")
          .trim()
          .toLowerCase(),
      );
      if (
        normalizedNames.some((name) => !name) ||
        new Set(normalizedNames).size !== normalizedNames.length
      ) {
        return res.status(400).json({
          message: "أسماء الحلاقين مطلوبة ويجب ألا تتكرر.",
        });
      }
      if (barbers.some((barber) => {
        const color = typeof barber === "string" ? "" : String(barber?.iconColor || "").trim();
        return color && !/^#[0-9a-fA-F]{6}$/.test(color);
      })) {
        return res.status(400).json({ message: "لون أيقونة الحلاق غير صالح." });
      }
      if (barbers.some((barber) => {
        if (typeof barber === "string") return false;
        const pin = normalizePinInput(barber?.pin);
        return pin && !isValidPin(pin);
      })) {
        return res.status(400).json({
          message: "رمز PIN للحلاق يجب أن يكون من 4 إلى 8 أرقام.",
        });
      }
    }

    await tenant.save();

    const tasks = [];

    if (barbers && Array.isArray(barbers)) {
      tasks.push(
        (async () => {
          const existingBarbers = await Barber.find({ tenantId: tenant._id })
            .select("_id")
            .lean();
          const existingIds = new Set(
            existingBarbers.map((barber) => String(barber._id)),
          );

          const normalizedBarbers = barbers.map((barber) => {
            const data =
              typeof barber === "string" ? { name: barber } : barber || {};
            const requestedId = String(data._id || "");
            return {
              _id:
                mongoose.Types.ObjectId.isValid(requestedId) &&
                existingIds.has(requestedId)
                  ? requestedId
                  : null,
              name: String(data.name || "").trim(),
              iconColor: String(data.iconColor || "").trim(),
              pin: normalizePinInput(data.pin),
              clearPin: data.clearPin === true,
              isActive: data.isActive !== false,
              leaves: normalizeBarberLeaves(data.leaves),
            };
          });

          const retainedIds = normalizedBarbers
            .filter((barber) => barber._id)
            .map((barber) => barber._id);

          await Barber.deleteMany({
            tenantId: tenant._id,
            ...(retainedIds.length > 0
              ? { _id: { $nin: retainedIds } }
              : {}),
          });

          for (const barber of normalizedBarbers) {
            const payload = {
              name: barber.name,
              iconColor: barber.iconColor,
              isActive: barber.isActive,
              leaves: barber.leaves,
            };

            // رمز جديد → يُشفَّر. فارغ لحلاق موجود → يبقى الرمز الحالي كما هو.
            if (barber.pin) payload.pin = await hashPin(barber.pin);
            else if (barber.clearPin || !barber._id) payload.pin = "";

            if (barber._id) {
              await Barber.updateOne(
                { _id: barber._id, tenantId: tenant._id },
                { $set: payload },
              );
            } else {
              await Barber.create({ tenantId: tenant._id, ...payload });
            }
          }
        })(),
      );
    }

    if (services) {
      tasks.push(
        Service.deleteMany({ tenantId: tenant._id }).then(() => {
          const servicesToInsert = services.map((s) => ({
            tenantId: tenant._id,
            name: s.name,
            price: s.price,
            duration: s.duration,
          }));
          if (servicesToInsert.length > 0)
            return Service.insertMany(servicesToInsert);
        }),
      );
    }

    await Promise.all(tasks);

    res.status(200).json({ message: "تم التحديث بنجاح" });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Update Settings Error:", error);
    res.status(500).json({ message: "حدث خطأ داخلي في السيرفر أثناء الحفظ" });
  }
};

// 5. تحديث إعدادات الـ API الخاصة بواتساب (قديماً قبل الربط المباشر بـ WASender)
const updateWhatsappSettings = async (req, res) => {
  try {
    const { apiKey, isEnabled } = req.body || {};
    const update = { "whatsappSettings.isEnabled": isEnabled === true };
    // مفتاح جديد فقط إذا أُرسل نص غير فارغ؛ غير ذلك يبقى المفتاح الحالي
    if (typeof apiKey === "string" && apiKey.trim()) {
      update["whatsappSettings.apiKey"] = encrypt(apiKey.trim());
      update["whatsappSettings.apiKeyHash"] = hashForLookup(apiKey.trim());
    }
    const updatedTenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $set: update },
      { returnDocument: "after", select: "whatsappSettings" },
    ).lean();

    if (!updatedTenant)
      return res.status(404).json({ message: "الصالون غير موجود" });

    res.status(200).json({
      message: "تم تحديث إعدادات الواتساب بنجاح! ✅",
      whatsappSettings: toSafeWhatsappSettings(updatedTenant.whatsappSettings),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء حفظ إعدادات الواتساب" });
  }
};

const updateWhatsappTemplates = async (req, res) => {
  try {
    const error = validateTemplates(req.body?.templates);
    if (error) return res.status(400).json({ message: error });

    const changes = {};
    for (const [key, value] of Object.entries(req.body.templates)) {
      changes[`whatsappSettings.templates.${key}`] = value;
    }
    const tenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $set: changes },
      { returnDocument: "after", select: "whatsappSettings.templates" },
    ).lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.json({ templates: getTemplates(tenant) });
  } catch (error) {
    return res.status(500).json({ message: "حدث خطأ أثناء حفظ قوالب واتساب" });
  }
};

module.exports = {
  getBarberSettings,
  updateBarberSettings,
  updateWhatsappSettings,
  updateWhatsappTemplates,
};
