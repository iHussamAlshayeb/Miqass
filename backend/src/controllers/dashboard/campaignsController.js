// حملات واتساب التسويقية
const Tenant = require("../../models/Tenant");
const Campaign = require("../../models/Campaign");
const Customer = require("../../models/Customer");
const {
  getRiyadhDayKey,
  parseCampaignDailyLimit,
} = require("../../utils/campaignSchedule");
const { normalizeSaudiMobile } = require("../../utils/saudiMobile");
const { isWhatsappReady } = require("../../utils/whatsapp");

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
        "salonName ownerPhone whatsappSettings.isEnabled whatsappSettings.apiKey whatsappSettings.provider whatsappSettings.whatsiFrom",
      )
      .lean();
    if (!tenant) {
      return res.status(404).json({ message: "الصالون غير موجود." });
    }
    if (!isWhatsappReady(tenant)) {
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

module.exports = {
  getBroadcastAudienceCounts,
  getBroadcastCampaigns,
  pauseBroadcastCampaign,
  cancelBroadcastCampaign,
  updateBroadcastCampaign,
  resumeBroadcastCampaign,
  sendBroadcastTest,
  sendBroadcastCampaign,
};
