const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");
const Service = require("../models/Service");

const { encrypt } = require("../utils/encryption");
const { sendReminderMessage } = require("../utils/whatsapp");

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
    const barbers = await Barber.find({ tenantId: tenant._id }).lean();

    const barbersData = barbers.map((b) => ({
      _id: b._id,
      name: b.name,
      pin: b.pin || "",
      isActive: b.isActive !== false,
    }));

    const safePaymentSettings = {
      isOnlinePaymentEnabled:
        tenant.paymentSettings?.isOnlinePaymentEnabled || false,
      depositAmount: tenant.paymentSettings?.depositAmount || 0,
      provider: tenant.paymentSettings?.provider || "stc_bank",
      moyasarPublishableKey:
        tenant.paymentSettings?.moyasarPublishableKey || "",
      hasSecretKey: !!tenant.paymentSettings?.moyasarSecretKey,
      stcBank: {
        environment:
          tenant.paymentSettings?.stcBank?.environment || "production",
        merchantId: tenant.paymentSettings?.stcBank?.merchantId || "",
        terminalId: tenant.paymentSettings?.stcBank?.terminalId || "",
        clientId: tenant.paymentSettings?.stcBank?.clientId || "",
        createPaymentUrl:
          tenant.paymentSettings?.stcBank?.createPaymentUrl || "",
        statusInquiryUrl:
          tenant.paymentSettings?.stcBank?.statusInquiryUrl || "",
        hasClientSecret: !!tenant.paymentSettings?.stcBank?.clientSecret,
        hasWebhookSecret: !!tenant.paymentSettings?.stcBank?.webhookSecret,
      },
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
      whatsappSettings: tenant.whatsappSettings || {
        isEnabled: false,
        apiKey: "",
      },
      paymentSettings: safePaymentSettings,
      ownerPhone: tenant.ownerPhone || "",
      branding: tenant.branding || {},
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
      wafeqApiKey: tenant.taxSettings?.wafeqAccountId || "",
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
      wafeqApiKey,
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
    tenant.branding.logoUrl =
      branding?.logoUrl || logoUrl || tenant.branding.logoUrl;
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
    if (wafeqApiKey !== undefined)
      tenant.taxSettings.wafeqAccountId = wafeqApiKey;

    if (paymentSettings) {
      if (!tenant.paymentSettings) tenant.paymentSettings = {};
      if (paymentSettings.isOnlinePaymentEnabled !== undefined)
        tenant.paymentSettings.isOnlinePaymentEnabled =
          paymentSettings.isOnlinePaymentEnabled;
      if (paymentSettings.depositAmount !== undefined)
        tenant.paymentSettings.depositAmount = Number(
          paymentSettings.depositAmount,
        );
      if (paymentSettings.provider !== undefined)
        tenant.paymentSettings.provider = ["stc_bank", "moyasar"].includes(
          paymentSettings.provider,
        )
          ? paymentSettings.provider
          : "stc_bank";
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

      if (paymentSettings.stcBank) {
        if (!tenant.paymentSettings.stcBank) tenant.paymentSettings.stcBank = {};
        const stcBank = paymentSettings.stcBank;
        const currentStcBank = tenant.paymentSettings.stcBank;

        if (stcBank.environment !== undefined)
          currentStcBank.environment = ["sandbox", "production"].includes(
            stcBank.environment,
          )
            ? stcBank.environment
            : "production";
        if (stcBank.merchantId !== undefined)
          currentStcBank.merchantId = stcBank.merchantId.trim();
        if (stcBank.terminalId !== undefined)
          currentStcBank.terminalId = stcBank.terminalId.trim();
        if (stcBank.clientId !== undefined)
          currentStcBank.clientId = stcBank.clientId.trim();
        if (stcBank.createPaymentUrl !== undefined)
          currentStcBank.createPaymentUrl = stcBank.createPaymentUrl.trim();
        if (stcBank.statusInquiryUrl !== undefined)
          currentStcBank.statusInquiryUrl = stcBank.statusInquiryUrl.trim();

        if (
          stcBank.clientSecret &&
          stcBank.clientSecret.trim() !== "" &&
          !stcBank.clientSecret.includes("****")
        ) {
          currentStcBank.clientSecret = encrypt(stcBank.clientSecret.trim());
        }

        if (
          stcBank.webhookSecret &&
          stcBank.webhookSecret.trim() !== "" &&
          !stcBank.webhookSecret.includes("****")
        ) {
          currentStcBank.webhookSecret = encrypt(stcBank.webhookSecret.trim());
        }
      }
    }

    await tenant.save();

    const tasks = [];

    if (barbers && Array.isArray(barbers)) {
      tasks.push(
        Barber.deleteMany({ tenantId: tenant._id }).then(() => {
          const barbersToInsert = barbers.map((b) => {
            if (typeof b === "string")
              return { tenantId: tenant._id, name: b, pin: "", isActive: true };
            return {
              tenantId: tenant._id,
              name: b.name,
              pin: b.pin || "",
              isActive: b.isActive !== false,
            };
          });
          if (barbersToInsert.length > 0)
            return Barber.insertMany(barbersToInsert);
        }),
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
    const { apiKey, isEnabled } = req.body;
    const updatedTenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      {
        $set: {
          "whatsappSettings.apiKey": apiKey,
          "whatsappSettings.isEnabled": isEnabled,
        },
      },
      { returnDocument: "after", select: "whatsappSettings" },
    ).lean();

    if (!updatedTenant)
      return res.status(404).json({ message: "الصالون غير موجود" });

    res.status(200).json({
      message: "تم تحديث إعدادات الواتساب بنجاح! ✅",
      whatsappSettings: updatedTenant.whatsappSettings,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء حفظ إعدادات الواتساب" });
  }
};

// 6. جلب بيانات ولاء عميل محدد
const getCustomerLoyalty = async (req, res) => {
  try {
    const { tenantId, phone } = req.params;
    const customer = await Customer.findOne({ tenantId, phone })
      .select("totalVisits children")
      .lean();

    res.status(200).json({
      visits: customer ? customer.totalVisits : 0,
      children: customer ? customer.children : [],
    });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200;
    const skip = (page - 1) * limit;

    const customers = await Customer.find({ tenantId: req.tenantId })
      .sort({ lastVisitDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const customersWithLoyaltyStatus = customers.map((c) => {
      const currentCycle = c.totalVisits % requiredVisits;
      const isEligibleForFree = currentCycle === 0 && c.totalVisits > 0;
      return {
        phone: c.phone,
        name: c.children.length > 0 ? c.children[0] : c.parentName,
        children: c.children,
        totalVisits: c.totalVisits,
        lastVisitDate: c.lastVisitDate,
        isEligibleForFree,
        remainingForFree: isEligibleForFree ? 0 : requiredVisits - currentCycle,
      };
    });

    res
      .status(200)
      .json({ customers: customersWithLoyaltyStatus, requiredVisits });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب قائمة العملاء" });
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

// 8. تجهيز وإطلاق حملات واتساب التسويقية (Broadcast)
const sendBroadcastCampaign = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { message, targetAudience } = req.body;
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

    await Campaign.create({
      tenantId: tenant._id,
      messageTemplate: message,
      targetAudience: targetAudience,
      targetCustomers: targetCustomers.map((c) => ({
        customerId: c._id,
        phone: c.phone,
        name: c.children.length > 0 ? c.children[0] : c.parentName,
      })),
      status: "Pending",
    });

    res.status(200).json({
      message: "تم تجهيز الحملة ووضعها في طابور الإرسال الآمن",
      targetCount: targetCustomers.length,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جدولة الحملة" });
  }
};

const normalizeImportedPhone = (value) => {
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
      const phone = normalizeImportedPhone(
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
  resendSingleWhatsApp,
  updateWhatsappSettings,
  getCustomerLoyalty,
  getTenantCustomers,
  exportTenantCustomers,
  getBroadcastAudienceCounts,
  sendBroadcastCampaign,
  importCustomers,
};
