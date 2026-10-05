const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const mongoose = require("mongoose");

const { encrypt, hashForLookup } = require("../utils/encryption");

// لوحة التحكم لا تحتاج المفتاح نفسه ولا أسرار الـ webhook
const toSafeWhatsappSettings = (settings = {}) => ({
  isEnabled: Boolean(settings?.isEnabled),
  sessionStatus: settings?.sessionStatus || "DISCONNECTED",
  hasApiKey: Boolean(settings?.apiKey),
});
const { hashPin, isValidPin, normalizePinInput } = require("../utils/barberPin");
const { compressLogoDataUri, isDataUriLogo, publicLogoUrl } = require("../utils/logoImage");
const { sendReminderMessage } = require("../utils/whatsapp");
const { DEFAULT_TEMPLATES, getTemplates, validateTemplates } = require("../utils/whatsappTemplates");
const {
  getRiyadhDayKey,
  parseCampaignDailyLimit,
} = require("../utils/campaignSchedule");
const { normalizeBarberLeaves } = require("../utils/barberLeave");
const { buildAppointmentHistoryParams } = require("../utils/appointmentHistory");

const normalizeSaudiMobile = (value) => {
  let phone = String(value ?? "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\D/g, "");

  if (phone.startsWith("00966")) phone = `0${phone.slice(5)}`;
  else if (phone.startsWith("966")) phone = `0${phone.slice(3)}`;
  else if (phone.length === 9 && phone.startsWith("5")) phone = `0${phone}`;

  return /^05\d{8}$/.test(phone) ? phone : null;
};

// ==========================================
// 🛠️ دالة مساعدة لتجهيز المواعيد للواجهة
// ==========================================
const mapAppointmentForFrontend = (app) => {
  return {
    ...(app._doc ? app._doc : app),
    customerPhone: app.customerId?.phone || "غير معروف",
    chair: app.barberName,
  };
};

// ==========================================
// 🚀 الدوال الخاصة بلوحة تحكم الصالون (Dashboard)
// ==========================================

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
        isZatcaOnboarded: tenant.taxSettings?.isZatcaOnboarded || false,
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

// 3. جلب أحدث 200 موعد قادم للإدارة
const getAllUpcomingAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ tenantId: req.tenantId })
      .populate("customerId", "phone parentName children")
      .sort({ date: -1, timeSlot: -1 })
      .limit(200)
      .lean();

    res
      .status(200)
      .json({ appointments: appointments.map(mapAppointmentForFrontend) });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب المواعيد" });
  }
};

// 4. إعادة إرسال رسالة تذكير يدوية لموعد محدد
const resendSingleWhatsApp = async (req, res) => {
  try {
    const { id } = req.params;
    const app = await Appointment.findOne({ _id: id, tenantId: req.tenantId })
      .populate("tenantId")
      .populate("customerId");

    if (!app)
      return res.status(404).json({ message: "لم يتم العثور على الموعد" });

    sendReminderMessage(
      app.customerId.phone,
      app.childName,
      app.timeSlot,
      app.barberName,
      app.tenantId,
    ).catch(() => {});

    res
      .status(200)
      .json({ message: `تم إرسال التذكير لـ ${app.childName} بنجاح! 💬` });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إرسال الرسالة" });
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

// 6. جلب بيانات ولاء عميل محدد
const getCustomerLoyalty = async (req, res) => {
  try {
    const { tenantId, phone } = req.params;
    if (!mongoose.isValidObjectId(tenantId) || !/^05\d{8}$/.test(phone || "")) {
      return res.status(400).json({ message: "بيانات غير صالحة" });
    }

    // مسار عام: يرجع عدد الزيارات فقط. أسماء الأطفال لا تُرجع إلا بعد
    // التحقق برمز الجوال عبر /customer/profile
    const customer = await Customer.findOne({ tenantId, phone })
      .select("totalVisits")
      .lean();

    res.status(200).json({ visits: customer ? customer.totalVisits : 0 });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات الولاء" });
  }
};

// 7. جلب قائمة العملاء (مفلترة ومجهزة بنظام الولاء)
const getTenantCustomers = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("settings.loyaltyVisitsRequired")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const requiredVisits = tenant.settings?.loyaltyVisitsRequired || 5;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 100, 1),
      200,
    );
    const skip = (page - 1) * limit;
    const bookingHistory = ["all", "booked", "never"].includes(
      req.query.bookingHistory,
    )
      ? req.query.bookingHistory
      : "all";
    const search = String(req.query.search || "").trim().slice(0, 100);

    const customerBaseFilter = {
      tenantId: req.tenantId,
      phone: { $ne: "0000000000" },
    };
    const bookedCustomerIds = await Appointment.distinct("customerId", {
      tenantId: req.tenantId,
      status: { $ne: "Blocked" },
    });
    const bookedCustomerIdSet = new Set(bookedCustomerIds.map(String));

    const customerFilter = { ...customerBaseFilter };
    if (bookingHistory === "booked") {
      customerFilter._id = { $in: bookedCustomerIds };
    } else if (bookingHistory === "never") {
      customerFilter._id = { $nin: bookedCustomerIds };
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearch, "i");
      customerFilter.$or = [
        { phone: searchRegex },
        { parentName: searchRegex },
        { children: searchRegex },
      ];
    }

    const [customers, filteredTotal, allCount, bookedCount] = await Promise.all([
      Customer.find(customerFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(customerFilter),
      Customer.countDocuments(customerBaseFilter),
      Customer.countDocuments({
        ...customerBaseFilter,
        _id: { $in: bookedCustomerIds },
      }),
    ]);

    const customersWithLoyaltyStatus = customers.map((c) => {
      const currentCycle = c.totalVisits % requiredVisits;
      const isEligibleForFree = currentCycle === 0 && c.totalVisits > 0;
      return {
        phone: c.phone,
        name: c.children.length > 0 ? c.children[0] : c.parentName,
        children: c.children,
        totalVisits: c.totalVisits,
        lastVisitDate: c.lastVisitDate,
        hasBooked: bookedCustomerIdSet.has(String(c._id)),
        isEligibleForFree,
        remainingForFree: isEligibleForFree ? 0 : requiredVisits - currentCycle,
      };
    });

    res.status(200).json({
      customers: customersWithLoyaltyStatus,
      requiredVisits,
      counts: {
        all: allCount,
        booked: bookedCount,
        never: Math.max(allCount - bookedCount, 0),
      },
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.max(Math.ceil(filteredTotal / limit), 1),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب قائمة العملاء" });
  }
};

const getAppointmentHistory = async (req, res) => {
  let options;
  try {
    options = buildAppointmentHistoryParams(req.query, req.tenantId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    const { query, customer, sort, page, limit } = options;
    if (customer) {
      const matchingCustomers = await Customer.find({ tenantId: req.tenantId, phone: customer })
        .select("_id")
        .lean();
      query.$or = [
        { childName: customer },
        { customerId: { $in: matchingCustomers.map((item) => item._id) } },
      ];
    }

    const [total, appointments] = await Promise.all([
      Appointment.countDocuments(query),
      Appointment.find(query)
        .populate("customerId", "phone parentName children")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      appointments: appointments.map(mapAppointmentForFrontend),
      total,
      page,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب سجل الحجوزات" });
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

const exportTenantCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({
      tenantId: req.tenantId,
      phone: { $ne: "0000000000" },
    })
      .select(
        "phone parentName children totalVisits lastVisitDate customerType createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    const exportCustomers = customers.map((customer) => ({
      phone: customer.phone,
      name:
        customer.children?.[0] || customer.parentName || "عميل غير مسمى",
      children: customer.children || [],
      totalVisits: customer.totalVisits || 0,
      lastVisitDate: customer.lastVisitDate || null,
      customerType: customer.customerType || "New",
      createdAt: customer.createdAt || null,
    }));

    res.status(200).json({
      customers: exportCustomers,
      total: exportCustomers.length,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تجهيز ملف العملاء" });
  }
};

const getBroadcastCustomerFilter = (tenantId) => ({
  tenantId,
  phone: { $ne: "0000000000" },
});

const getBroadcastAudienceCounts = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const customerFilter = getBroadcastCustomerFilter(req.tenantId);
    const [all, inactive30, vip] = await Promise.all([
      Customer.countDocuments(customerFilter),
      Customer.countDocuments({
        ...customerFilter,
        lastVisitDate: { $lt: thirtyDaysAgo },
      }),
      Customer.countDocuments({
        ...customerFilter,
        totalVisits: { $gte: 3 },
      }),
    ]);

    res.status(200).json({
      counts: {
        all,
        inactive_30: inactive30,
        vip,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب أعداد العملاء" });
  }
};

const mapCampaignProgress = (campaign) => {
  const recipients = campaign.targetCustomers || [];
  const recipientCounts = recipients.reduce(
    (counts, recipient) => {
      const status = recipient.status || "Pending";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    },
    {},
  );
  const totalCount = campaign.totalCount || recipients.length;
  const sentCount = recipientCounts.Sent || 0;
  const failedCount = recipientCounts.Failed || 0;
  const uncertainCount = recipientCounts.Uncertain || 0;
  const cancelledCount = recipientCounts.Cancelled || 0;
  const processedCount =
    sentCount + failedCount + uncertainCount + cancelledCount;
  const deliveryCounts = recipients.reduce(
    (counts, recipient) => {
      const statusCode =
        recipient.providerStatusCode === null ||
        recipient.providerStatusCode === undefined
          ? null
          : Number(recipient.providerStatusCode);
      const providerStatus = String(recipient.providerStatus || "").toLowerCase();
      const isDelivered =
        (statusCode !== null && statusCode >= 3) ||
        ["delivered", "read", "played"].includes(providerStatus);
      const isRead =
        (statusCode !== null && statusCode >= 4) ||
        ["read", "played"].includes(providerStatus);
      const isDeliveryFailed =
        statusCode === 0 || ["failed", "error"].includes(providerStatus);

      if (isDelivered) counts.delivered += 1;
      if (isRead) counts.read += 1;
      if (isDeliveryFailed) counts.failed += 1;
      return counts;
    },
    { delivered: 0, read: 0, failed: 0 },
  );
  const dailyMessageLimit = Number(campaign.dailyMessageLimit || 0) || null;
  const dailyAttemptCount =
    campaign.dailyWindowDate === getRiyadhDayKey()
      ? Number(campaign.dailyAttemptCount || 0)
      : 0;

  return {
    _id: campaign._id,
    targetAudience: campaign.targetAudience,
    status: campaign.status,
    totalCount,
    sentCount,
    failedCount,
    uncertainCount,
    cancelledCount,
    deliveredCount: deliveryCounts.delivered,
    readCount: deliveryCounts.read,
    deliveryFailedCount: deliveryCounts.failed,
    awaitingDeliveryCount: Math.max(
      sentCount - deliveryCounts.delivered - deliveryCounts.failed,
      0,
    ),
    messageTemplate: campaign.messageTemplate,
    dailyMessageLimit,
    dailyAttemptCount,
    dailyRemaining: dailyMessageLimit
      ? Math.max(dailyMessageLimit - dailyAttemptCount, 0)
      : null,
    isDailyLimitReached: Boolean(
      dailyMessageLimit &&
        dailyAttemptCount >= dailyMessageLimit &&
        campaign.status === "Processing",
    ),
    pendingCount: Math.max(totalCount - processedCount, 0),
    progressPercent:
      totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0,
    lastError: campaign.lastError || "",
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    lastProgressAt: campaign.lastProgressAt,
    completedAt: campaign.completedAt,
    cancelledAt: campaign.cancelledAt,
    nextRunAt: campaign.nextRunAt,
    isPauseSettling: Boolean(
      campaign.status === "Paused" &&
        campaign.lockOwner &&
        campaign.lockExpiresAt &&
        new Date(campaign.lockExpiresAt) > new Date(),
    ),
    isCancelSettling: Boolean(
      campaign.status === "Cancelled" &&
        campaign.lockOwner &&
        campaign.lockExpiresAt &&
        new Date(campaign.lockExpiresAt) > new Date(),
    ),
  };
};

const getBroadcastCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find({ tenantId: req.tenantId })
      .select(
        "targetAudience messageTemplate targetCustomers.status targetCustomers.providerStatus targetCustomers.providerStatusCode status totalCount sentCount failedCount uncertainCount cancelledCount dailyMessageLimit dailyAttemptCount dailyWindowDate lastError lockOwner lockExpiresAt nextRunAt startedAt lastProgressAt completedAt cancelledAt createdAt",
      )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({ campaigns: campaigns.map(mapCampaignProgress) });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب سجل الحملات." });
  }
};

const pauseBroadcastCampaign = async (req, res) => {
  try {
    const pauseUpdate = {
      $set: {
        status: "Paused",
        nextRunAt: null,
        lastError: "",
      },
    };

    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: req.params.campaignId,
        tenantId: req.tenantId,
        status: { $in: ["Pending", "Processing"] },
      },
      pauseUpdate,
      { returnDocument: "after" },
    );

    if (!campaign) {
      const existingCampaign = await Campaign.findOne({
        _id: req.params.campaignId,
        tenantId: req.tenantId,
      });

      if (!existingCampaign) {
        return res.status(404).json({ message: "الحملة غير موجودة." });
      }
      if (existingCampaign.status === "Paused") {
        return res.status(200).json({
          message: "الحملة متوقفة مؤقتاً بالفعل.",
          campaign: mapCampaignProgress(existingCampaign.toObject()),
        });
      }

      return res.status(409).json({
        message: "لا يمكن إيقاف حملة مكتملة أو متوقفة.",
      });
    }

    res.status(200).json({
      message:
        "تم طلب إيقاف الحملة. ستتوقف بأمان بعد إنهاء الرسالة الجارية إن وجدت.",
      campaign: mapCampaignProgress(campaign.toObject()),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إيقاف الحملة مؤقتاً." });
  }
};

const cancelBroadcastCampaign = async (req, res) => {
  try {
    const now = new Date();
    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: req.params.campaignId,
        tenantId: req.tenantId,
        status: { $in: ["Pending", "Processing", "Paused"] },
      },
      {
        $set: {
          status: "Cancelled",
          nextRunAt: null,
          completedAt: now,
          cancelledAt: now,
          lastError: "",
          "targetCustomers.$[recipient].status": "Cancelled",
          "targetCustomers.$[recipient].cancelledAt": now,
          "targetCustomers.$[recipient].nextAttemptAt": null,
          "targetCustomers.$[recipient].errorMessage":
            "تم إلغاء الحملة قبل إرسال الرسالة.",
        },
      },
      {
        arrayFilters: [{ "recipient.status": "Pending" }],
        returnDocument: "after",
      },
    );

    if (!campaign) {
      const existingCampaign = await Campaign.findOne({
        _id: req.params.campaignId,
        tenantId: req.tenantId,
      });

      if (!existingCampaign) {
        return res.status(404).json({ message: "الحملة غير موجودة." });
      }
      if (existingCampaign.status === "Cancelled") {
        return res.status(200).json({
          message: "الحملة ملغاة بالفعل.",
          campaign: mapCampaignProgress(existingCampaign.toObject()),
        });
      }

      return res.status(409).json({
        message: "لا يمكن إلغاء حملة مكتملة.",
      });
    }

    const cancelledCount = campaign.targetCustomers.reduce(
      (count, recipient) =>
        count + (recipient.status === "Cancelled" ? 1 : 0),
      0,
    );
    campaign.cancelledCount = cancelledCount;
    await Campaign.updateOne(
      { _id: campaign._id, status: "Cancelled" },
      { $set: { cancelledCount } },
    );

    const isSettling = Boolean(
      campaign.lockOwner &&
        campaign.lockExpiresAt &&
        campaign.lockExpiresAt > now,
    );
    res.status(200).json({
      message: isSettling
        ? "تم إلغاء الحملة. ستُحفظ نتيجة الرسالة الجارية ثم يتوقف الإرسال نهائياً."
        : "تم إلغاء الحملة نهائياً وإيقاف جميع الرسائل المتبقية.",
      campaign: mapCampaignProgress(campaign.toObject()),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء الحملة." });
  }
};

const updateBroadcastCampaign = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message || message.length > 4000) {
      return res.status(400).json({
        message: "نص الحملة مطلوب ويجب ألا يتجاوز 4000 حرف.",
      });
    }

    const dailyLimitResult = parseCampaignDailyLimit(
      req.body?.dailyMessageLimit,
    );
    if (dailyLimitResult.error) {
      return res.status(400).json({ message: dailyLimitResult.error });
    }

    const existingCampaign = await Campaign.findOne({
      _id: req.params.campaignId,
      tenantId: req.tenantId,
    });
    if (!existingCampaign) {
      return res.status(404).json({ message: "الحملة غير موجودة." });
    }
    if (!["Pending", "Paused"].includes(existingCampaign.status)) {
      return res.status(409).json({
        message:
          existingCampaign.status === "Processing"
            ? "أوقف الحملة مؤقتاً قبل تعديل الرسالة أو الحد اليومي."
            : "لا يمكن تعديل حملة مكتملة أو ملغاة.",
      });
    }
    if (
      existingCampaign.status === "Paused" &&
      existingCampaign.lockOwner &&
      existingCampaign.lockExpiresAt &&
      existingCampaign.lockExpiresAt > new Date()
    ) {
      return res.status(409).json({
        message: "انتظر حتى يكتمل الإيقاف الحالي ثم أعد محاولة التعديل.",
      });
    }

    const update = {
      messageTemplate: message,
      dailyMessageLimit: dailyLimitResult.value,
      lastError: "",
    };
    if (existingCampaign.status === "Pending") {
      update.nextRunAt = new Date();
    }

    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: existingCampaign._id,
        tenantId: req.tenantId,
        status: existingCampaign.status,
        lockOwner: existingCampaign.lockOwner || null,
      },
      { $set: update },
      { returnDocument: "after" },
    );
    if (!campaign) {
      return res.status(409).json({
        message: "تغيرت حالة الحملة أثناء التعديل. حدّث الصفحة وحاول مجدداً.",
      });
    }

    res.status(200).json({
      message: "تم تحديث نص الحملة والحد اليومي بنجاح.",
      campaign: mapCampaignProgress(campaign.toObject()),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تعديل الحملة." });
  }
};

const resumeBroadcastCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.campaignId,
      tenantId: req.tenantId,
    });

    if (!campaign) {
      return res.status(404).json({ message: "الحملة غير موجودة." });
    }

    if (["Pending", "Processing"].includes(campaign.status)) {
      return res.status(409).json({
        message: "الحملة قيد الإرسال بالفعل.",
      });
    }

    if (campaign.status === "Cancelled") {
      return res.status(409).json({
        message: "الحملة ملغاة نهائياً ولا يمكن استئنافها.",
      });
    }

    if (
      campaign.status === "Paused" &&
      campaign.lockOwner &&
      campaign.lockExpiresAt &&
      campaign.lockExpiresAt > new Date()
    ) {
      return res.status(409).json({
        message:
          "يجري إنهاء الرسالة الحالية بأمان. انتظر لحظات ثم أعد الاستئناف.",
      });
    }

    const otherOpenCampaign = await Campaign.exists({
      _id: { $ne: campaign._id },
      tenantId: req.tenantId,
      status: { $in: ["Pending", "Processing", "Paused"] },
    });
    if (otherOpenCampaign) {
      return res.status(409).json({
        message: "توجد حملة أخرى مفتوحة. أكملها قبل استئناف هذه الحملة.",
      });
    }

    let resumedCount = 0;
    campaign.targetCustomers.forEach((recipient) => {
      if (
        recipient.status === "Failed" &&
        Number(recipient.attempts || 0) < 3
      ) {
        recipient.status = "Pending";
        recipient.nextAttemptAt = null;
        recipient.errorMessage = "";
        resumedCount += 1;
      }
    });

    const hasPendingRecipients = campaign.targetCustomers.some(
      (recipient) => ["Pending", "Sending"].includes(recipient.status),
    );
    if (!hasPendingRecipients) {
      return res.status(400).json({
        message:
          "لا توجد رسائل آمنة للاستكمال. الحالات غير المؤكدة لا يعاد إرسالها تلقائياً لتجنب التكرار.",
      });
    }

    campaign.status = "Pending";
    campaign.failedCount = Math.max(
      Number(campaign.failedCount || 0) - resumedCount,
      0,
    );
    campaign.completedAt = null;
    campaign.nextRunAt = new Date();
    campaign.lockOwner = null;
    campaign.lockExpiresAt = null;
    campaign.lastError = "";
    await campaign.save();

    res.status(200).json({
      message:
        resumedCount > 0
          ? `تمت إعادة ${resumedCount} رسالة فاشلة إلى طابور الاستكمال.`
          : "تمت إعادة الحملة إلى طابور الاستكمال.",
      campaign: mapCampaignProgress(campaign.toObject()),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء استكمال الحملة." });
  }
};

const sendBroadcastTest = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message || message.length > 4000) {
      return res.status(400).json({
        message: "نص رسالة الاختبار مطلوب ويجب ألا يتجاوز 4000 حرف.",
      });
    }

    const tenant = await Tenant.findById(req.tenantId)
      .select(
        "salonName ownerPhone whatsappSettings.isEnabled whatsappSettings.apiKey",
      )
      .lean();
    if (!tenant) {
      return res.status(404).json({ message: "الصالون غير موجود." });
    }
    if (
      !tenant.whatsappSettings?.isEnabled ||
      !tenant.whatsappSettings?.apiKey
    ) {
      return res.status(400).json({
        message: "يجب ربط واتساب وتفعيله قبل إرسال رسالة الاختبار.",
      });
    }

    const salonPhone = normalizeSaudiMobile(tenant.ownerPhone);
    if (!salonPhone) {
      return res.status(400).json({
        message:
          "رقم جوال الصالون غير صالح. حدّثه من الإعدادات بصيغة 05XXXXXXXX قبل إرسال الاختبار.",
      });
    }

    const activeCampaign = await Campaign.exists({
      tenantId: req.tenantId,
      status: { $in: ["Pending", "Processing", "Paused"] },
    });
    if (activeCampaign) {
      return res.status(409).json({
        message:
          "توجد حملة قيد الإرسال حالياً. انتظر اكتمالها قبل إرسال الاختبار.",
      });
    }

    const campaign = await Campaign.create({
      tenantId: req.tenantId,
      messageTemplate: message,
      targetAudience: "test",
      targetCustomers: [
        {
          phone: salonPhone,
          name: tenant.salonName || "الصالون",
        },
      ],
      totalCount: 1,
      sentCount: 0,
      failedCount: 0,
      uncertainCount: 0,
      status: "Pending",
      nextRunAt: new Date(),
    });

    res.status(200).json({
      message: `تم وضع رسالة الاختبار في طابور الإرسال إلى رقم الصالون ${salonPhone}.`,
      targetCount: 1,
      campaignId: campaign._id,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جدولة رسالة الاختبار." });
  }
};

// 8. تجهيز وإطلاق حملات واتساب التسويقية (Broadcast)
const sendBroadcastCampaign = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const message = String(req.body?.message || "").trim();
    const targetAudience = req.body?.targetAudience;
    const dailyLimitResult = parseCampaignDailyLimit(
      req.body?.dailyMessageLimit,
    );
    if (!message || message.length > 4000) {
      return res.status(400).json({
        message: "نص الحملة مطلوب ويجب ألا يتجاوز 4000 حرف.",
      });
    }
    if (dailyLimitResult.error) {
      return res.status(400).json({ message: dailyLimitResult.error });
    }
    if (!["all", "inactive_30", "vip"].includes(targetAudience)) {
      return res.status(400).json({ message: "الجمهور المستهدف غير صالح." });
    }

    const tenant = await Tenant.findById(tenantId)
      .select("subscription campaignCredits")
      .lean();

    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    if (
      tenant.subscription?.plan !== "Premium" &&
      (tenant.campaignCredits || 0) <= 0
    ) {
      return res.status(403).json({
        message:
          "هذه الميزة تتطلب باقة VIP، أو يمكنك شراء 'رصيد حملة واحدة' من الإعدادات.",
      });
    }

    const activeCampaign = await Campaign.exists({
      tenantId,
      status: { $in: ["Pending", "Processing", "Paused"] },
    });
    if (activeCampaign) {
      return res.status(409).json({
        message:
          "لديك حملة قيد الإرسال حالياً. انتظر اكتمالها قبل إطلاق حملة جديدة.",
      });
    }

    let targetCustomers = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const customers = await Customer.find(getBroadcastCustomerFilter(tenantId))
      .select("_id phone children parentName lastVisitDate totalVisits")
      .lean();

    if (targetAudience === "all") targetCustomers = customers;
    else if (targetAudience === "inactive_30")
      targetCustomers = customers.filter(
        (c) => c.lastVisitDate && c.lastVisitDate < thirtyDaysAgo,
      );
    else if (targetAudience === "vip")
      targetCustomers = customers.filter((c) => c.totalVisits >= 3);

    if (targetCustomers.length === 0)
      return res
        .status(400)
        .json({ message: "لا يوجد عملاء يطابقون هذا الفلتر حالياً." });

    if (tenant.subscription?.plan !== "Premium") {
      await Tenant.updateOne(
        { _id: tenantId, campaignCredits: { $gt: 0 } },
        { $inc: { campaignCredits: -1 } },
      );
    }

    const campaign = await Campaign.create({
      tenantId: tenant._id,
      messageTemplate: message,
      targetAudience: targetAudience,
      targetCustomers: targetCustomers.map((c) => ({
        customerId: c._id,
        phone: c.phone,
        name: c.children.length > 0 ? c.children[0] : c.parentName,
      })),
      totalCount: targetCustomers.length,
      sentCount: 0,
      failedCount: 0,
      uncertainCount: 0,
      cancelledCount: 0,
      dailyMessageLimit: dailyLimitResult.value,
      dailyAttemptCount: 0,
      dailyWindowDate: getRiyadhDayKey(),
      status: "Pending",
      nextRunAt: new Date(),
    });

    res.status(200).json({
      message: "تم تجهيز الحملة ووضعها في طابور الإرسال الآمن",
      targetCount: targetCustomers.length,
      campaignId: campaign._id,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جدولة الحملة" });
  }
};

const importCustomers = async (req, res) => {
  try {
    const rows = req.body?.customers;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "ملف العملاء فارغ أو غير صالح." });
    }

    if (rows.length > 5000) {
      return res.status(400).json({
        message: "الحد الأقصى للاستيراد هو 5000 عميل في الملف الواحد.",
      });
    }

    const validRows = [];
    for (const row of rows) {
      const name = String(
        row?.["الاسم"] ?? row?.["اسم العميل"] ?? row?.name ?? "",
      ).trim();
      const phone = normalizeSaudiMobile(
        row?.["رقم الجوال"] ??
          row?.["رقم الهاتف"] ??
          row?.phone ??
          row?.mobile,
      );

      if (!name || !phone) continue;
      validRows.push({ name: name.slice(0, 100), phone });
    }

    if (validRows.length === 0) {
      return res.status(400).json({
        message:
          "لم نجد صفوفاً صالحة. استخدم عمودي الاسم ورقم الجوال، وتأكد أن الرقم يبدأ بـ 05.",
      });
    }

    const uniqueCustomers = new Map();
    validRows.forEach((customer) => {
      if (!uniqueCustomers.has(customer.phone)) {
        uniqueCustomers.set(customer.phone, customer);
      }
    });

    const operations = Array.from(uniqueCustomers.values()).map((customer) => ({
      updateOne: {
        filter: { tenantId: req.tenantId, phone: customer.phone },
        update: {
          $setOnInsert: {
            tenantId: req.tenantId,
            phone: customer.phone,
            parentName: customer.name,
            children: [customer.name],
          },
        },
        upsert: true,
      },
    }));

    const result = await Customer.bulkWrite(operations, { ordered: false });
    const imported = result.upsertedCount || 0;
    const invalid = rows.length - validRows.length;
    const ignored = validRows.length - imported;

    res.status(200).json({
      message: `تم استيراد ${imported} عميل بنجاح.`,
      imported,
      ignored,
      invalid,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء استيراد العملاء." });
  }
};

module.exports = {
  getBarberSettings,
  updateBarberSettings,
  getAllUpcomingAppointments,
  getAppointmentHistory,
  resendSingleWhatsApp,
  updateWhatsappTemplates,
  updateWhatsappSettings,
  getCustomerLoyalty,
  getTenantCustomers,
  exportTenantCustomers,
  getBroadcastAudienceCounts,
  getBroadcastCampaigns,
  pauseBroadcastCampaign,
  cancelBroadcastCampaign,
  updateBroadcastCampaign,
  resumeBroadcastCampaign,
  sendBroadcastTest,
  sendBroadcastCampaign,
  importCustomers,
};
