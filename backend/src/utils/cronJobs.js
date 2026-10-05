const cron = require("node-cron");
const crypto = require("crypto");
const os = require("os");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const { processPendingZakatySetups } = require('../services/zakatySetupService');
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");

const {
  sendReminderMessage,
  sendRetentionMessage,
  sendCampaignMessage,
  getCampaignMessageInfo,
} = require("./whatsapp");
const { sendRenewalReminderEmail } = require("./emailService");
const {
  processNotificationQueue,
  reconcileNotificationDeliveries,
} = require("./onesignal");
const {
  updateCampaignMessageDelivery,
} = require("../services/campaignDeliveryService");
const {
  getNextRiyadhDayStart,
  getRiyadhDayKey,
} = require("./campaignSchedule");

const formatDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const processAutomatedReminders = async () => {
  try {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const todayStr = formatDate(now);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    const upcomingAppointments = await Appointment.find({
      status: "Booked",
      isReminded: false,
      date: { $in: [todayStr, yesterdayStr] },
    })
      .select("_id date timeSlot childName barberName customerId tenantId")
      .populate("tenantId", "settings salonName whatsappSettings")
      .populate("customerId", "phone")
      .lean();

    for (let app of upcomingAppointments) {
      if (!app.tenantId?.whatsappSettings?.isEnabled) continue;

      const customerPhone = app.customerId?.phone;
      if (!customerPhone) continue;

      const [appHour, appMinute] = app.timeSlot.split(":").map(Number);
      let appTime = new Date(now);
      const [year, month, day] = app.date.split("-").map(Number);
      appTime.setFullYear(year, month - 1, day);
      appTime.setHours(appHour, appMinute, 0, 0);

      const startHour = parseInt(
        app.tenantId?.settings?.startTime?.split(":")[0] || "12",
      );
      if (appHour < startHour) appTime.setDate(appTime.getDate() + 1);

      const diffMs = appTime - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > 0 && diffHours <= 2.5) {
        console.log(
          `🤖 [السكرتير الآلي]: جاري إرسال تذكير لـ ${app.childName} من ${app.tenantId?.salonName}...`,
        );

        const isSent = await sendReminderMessage(
          customerPhone,
          app.childName,
          app.timeSlot,
          app.barberName,
          app.tenantId,
        );

        if (isSent) {
          await Appointment.updateOne(
            { _id: app._id },
            { $set: { isReminded: true } },
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  } catch (error) {
    console.error("❌ خطأ في نظام التذكير الآلي:", error.message);
  }
};

const processSubscriptionReminders = async () => {
  try {
    console.log("⏳ [مدير الاشتراكات]: جاري فحص الصالونات...");
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const startOfDay = new Date(threeDaysFromNow.setHours(0, 0, 0, 0));
    const endOfDay = new Date(threeDaysFromNow.setHours(23, 59, 59, 999));

    const expiringTenants = await Tenant.find({
      "subscription.status": "Active",
      "subscription.endDate": { $gte: startOfDay, $lte: endOfDay },
    })
      .select("email ownerName salonName")
      .lean();

    for (let tenant of expiringTenants) {
      await sendRenewalReminderEmail(tenant.email, tenant.ownerName, 3).catch(
        (e) => {},
      );
      console.log(
        `✉️ [مدير الاشتراكات]: تم إرسال إيميل لصالون: ${tenant.salonName}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error("❌ خطأ في نظام فحص الاشتراكات:", error.message);
  }
};

const processRetentionCampaign = async () => {
  try {
    console.log("🔄 [مدير التسويق]: جاري فحص العملاء الغائبين...");
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const todayString = formatDate(now);

    const tenants = await Tenant.find({
      "settings.isRetentionEnabled": true,
      "whatsappSettings.isEnabled": true,
    })
      .select("_id settings salonName whatsappSettings")
      .lean();

    for (const tenant of tenants) {
      const daysThreshold = tenant.settings.retentionDays || 30;

      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - daysThreshold);
      targetDate.setHours(0, 0, 0, 0);

      const targetDateEnd = new Date(targetDate);
      targetDateEnd.setHours(23, 59, 59, 999);

      const customersToRemind = await Customer.find({
        tenantId: tenant._id,
        lastVisitDate: { $gte: targetDate, $lte: targetDateEnd },
      })
        .select("_id phone parentName children")
        .lean();

      for (const c of customersToRemind) {
        if (!c.phone) continue;

        const hasFutureBooking = await Appointment.exists({
          tenantId: tenant._id,
          customerId: c._id,
          status: "Booked",
          date: { $gte: todayString },
        });

        if (!hasFutureBooking) {
          const childName =
            c.children?.length > 0 ? c.children[0] : c.parentName;
          console.log(
            `🎯 [مدير التسويق]: إرسال رسالة "اشتقنالك" لـ ${childName} (صالون ${tenant.salonName})`,
          );

          await sendRetentionMessage(c.phone, childName, tenant);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  } catch (error) {
    console.error("❌ خطأ في نظام التسويق الآلي:", error.message);
  }
};

let isProcessingCampaigns = false;
let isReconcilingCampaignDeliveries = false;

const CAMPAIGN_BATCH_SIZE = 20;
const CAMPAIGN_MIN_DELAY_MS = 8000;
const CAMPAIGN_MAX_DELAY_MS = 15000;
const CAMPAIGN_LOCK_MS = 5 * 60 * 1000;
const CAMPAIGN_MAX_ATTEMPTS = 3;
const campaignWorkerId = `${os.hostname()}-${process.pid}-${crypto.randomUUID()}`;

const getCampaignDelay = () =>
  Math.floor(
    Math.random() * (CAMPAIGN_MAX_DELAY_MS - CAMPAIGN_MIN_DELAY_MS + 1),
  ) + CAMPAIGN_MIN_DELAY_MS;

const getCampaignRecipientCounts = (recipients = []) =>
  recipients.reduce(
    (counts, recipient) => {
      const status = recipient.status || "Pending";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    },
    {
      Pending: 0,
      Sending: 0,
      Sent: 0,
      Failed: 0,
      Uncertain: 0,
      Cancelled: 0,
    },
  );

const claimNextCampaign = async () => {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + CAMPAIGN_LOCK_MS);

  return Campaign.findOneAndUpdate(
    {
      status: { $in: ["Pending", "Processing"] },
      $and: [
        {
          $or: [
            { nextRunAt: { $lte: now } },
            { nextRunAt: null },
            { nextRunAt: { $exists: false } },
          ],
        },
        {
          $or: [
            { lockExpiresAt: { $lte: now } },
            { lockExpiresAt: null },
            { lockExpiresAt: { $exists: false } },
          ],
        },
      ],
    },
    {
      $set: {
        status: "Processing",
        lockOwner: campaignWorkerId,
        lockExpiresAt,
      },
    },
    {
      returnDocument: "after",
      sort: { lastProgressAt: 1, createdAt: 1 },
    },
  )
    .populate("tenantId", "salonName whatsappSettings")
    .lean();
};

const markInterruptedRecipientsAsUncertain = async (campaign) => {
  const interruptedRecipients = campaign.targetCustomers.filter(
    (recipient) => recipient.status === "Sending",
  );

  for (const recipient of interruptedRecipients) {
    await Campaign.updateOne(
      {
        _id: campaign._id,
        lockOwner: campaignWorkerId,
        "targetCustomers._id": recipient._id,
      },
      {
        $set: {
          "targetCustomers.$.status": "Uncertain",
          "targetCustomers.$.errorMessage":
            "توقف عامل الحملة أثناء الإرسال؛ لم تتم إعادة الرسالة لتجنب التكرار.",
          lastProgressAt: new Date(),
        },
        $inc: { uncertainCount: 1 },
      },
    );
    recipient.status = "Uncertain";
  }
};

const hasReachedCampaignDailyLimit = (campaign) => {
  const dailyMessageLimit = Number(campaign.dailyMessageLimit || 0);
  return (
    dailyMessageLimit > 0 &&
    Number(campaign.dailyAttemptCount || 0) >= dailyMessageLimit
  );
};

const prepareCampaignDailyWindow = async (campaign) => {
  const todayKey = getRiyadhDayKey();
  if (campaign.dailyWindowDate === todayKey) return true;

  const result = await Campaign.updateOne(
    {
      _id: campaign._id,
      status: "Processing",
      lockOwner: campaignWorkerId,
    },
    {
      $set: {
        dailyWindowDate: todayKey,
        dailyAttemptCount: 0,
      },
    },
  );
  if (result.matchedCount === 0) return false;

  campaign.dailyWindowDate = todayKey;
  campaign.dailyAttemptCount = 0;
  return true;
};

const finalizeCampaignBatch = async (campaignId) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const campaign = await Campaign.findOne({
      _id: campaignId,
      lockOwner: campaignWorkerId,
    })
      .select(
        "targetCustomers totalCount status dailyMessageLimit dailyAttemptCount dailyWindowDate",
      )
      .lean();
    if (!campaign) return;

    let counts = getCampaignRecipientCounts(campaign.targetCustomers);
    const isCancelled = campaign.status === "Cancelled";
    if (isCancelled && (counts.Pending > 0 || counts.Sending > 0)) {
      const settledAt = new Date();
      const cancellationSet = { lastProgressAt: settledAt };
      const arrayFilters = [];

      if (counts.Pending > 0) {
        cancellationSet["targetCustomers.$[pending].status"] = "Cancelled";
        cancellationSet["targetCustomers.$[pending].cancelledAt"] = settledAt;
        cancellationSet["targetCustomers.$[pending].nextAttemptAt"] = null;
        cancellationSet["targetCustomers.$[pending].errorMessage"] =
          "تم إلغاء الحملة قبل إرسال الرسالة.";
        arrayFilters.push({ "pending.status": "Pending" });
      }
      if (counts.Sending > 0) {
        cancellationSet["targetCustomers.$[sending].status"] = "Uncertain";
        cancellationSet["targetCustomers.$[sending].errorMessage"] =
          "أُلغيت الحملة أثناء الإرسال؛ لم تتم إعادة الرسالة لتجنب التكرار.";
        arrayFilters.push({ "sending.status": "Sending" });
      }

      const settleUpdate = await Campaign.updateOne(
        {
          _id: campaignId,
          status: "Cancelled",
          lockOwner: campaignWorkerId,
        },
        { $set: cancellationSet },
        { arrayFilters },
      );
      if (settleUpdate.modifiedCount > 0) continue;
    }

    counts = getCampaignRecipientCounts(campaign.targetCustomers);
    const hasPending = counts.Pending > 0 || counts.Sending > 0;
    const now = new Date();
    const pendingAttemptDates = campaign.targetCustomers
      .filter(
        (recipient) =>
          recipient.status === "Pending" && recipient.nextAttemptAt,
      )
      .map((recipient) => new Date(recipient.nextAttemptAt).getTime())
      .filter(Number.isFinite);
    const hasImmediatelyReadyRecipient = campaign.targetCustomers.some(
      (recipient) =>
        recipient.status === "Pending" && !recipient.nextAttemptAt,
    );
    const nextAttemptAt = hasImmediatelyReadyRecipient
      ? new Date(now.getTime() + 60 * 1000)
      : pendingAttemptDates.length > 0
        ? new Date(Math.min(...pendingAttemptDates))
        : new Date(now.getTime() + 60 * 1000);
    const hasErrors = counts.Failed > 0 || counts.Uncertain > 0;
    const isPaused = campaign.status === "Paused";
    const dailyAttemptCount =
      campaign.dailyWindowDate === getRiyadhDayKey(now)
        ? Number(campaign.dailyAttemptCount || 0)
        : 0;
    const isDailyLimitReached = Boolean(
      hasPending &&
        Number(campaign.dailyMessageLimit || 0) > 0 &&
        dailyAttemptCount >= Number(campaign.dailyMessageLimit),
    );
    const nextStatus = isCancelled
      ? "Cancelled"
      : !hasPending
        ? hasErrors
          ? "Completed_With_Errors"
          : "Completed"
        : isPaused
          ? "Paused"
          : "Processing";

    const result = await Campaign.updateOne(
      {
        _id: campaignId,
        status: campaign.status,
        lockOwner: campaignWorkerId,
      },
      {
        $set: {
          status: nextStatus,
          totalCount: campaign.totalCount || campaign.targetCustomers.length,
          sentCount: counts.Sent,
          failedCount: counts.Failed,
          uncertainCount: counts.Uncertain,
          cancelledCount: counts.Cancelled,
          completedAt: isCancelled || !hasPending ? now : null,
          nextRunAt:
            hasPending && !isPaused && !isCancelled
              ? isDailyLimitReached
                ? getNextRiyadhDayStart(now)
                : nextAttemptAt
              : null,
          lockOwner: null,
          lockExpiresAt: null,
        },
      },
    );

    if (result.matchedCount > 0) return;
  }
};

const processBroadcastCampaigns = async () => {
  if (isProcessingCampaigns) return;
  isProcessingCampaigns = true;
  let campaign = null;

  try {
    campaign = await claimNextCampaign();
    if (!campaign) return;

    if (!campaign.startedAt) {
      await Campaign.updateOne(
        { _id: campaign._id, lockOwner: campaignWorkerId },
        { $set: { startedAt: new Date() } },
      );
    }

    await markInterruptedRecipientsAsUncertain(campaign);

    const dailyWindowReady = await prepareCampaignDailyWindow(campaign);
    if (!dailyWindowReady) {
      await finalizeCampaignBatch(campaign._id);
      return;
    }

    console.log(
      `🚀 [مدير الحملات]: معالجة دفعة لصالون ${campaign.tenantId?.salonName}...`,
    );

    let processedInBatch = 0;
    while (processedInBatch < CAMPAIGN_BATCH_SIZE) {
      if (hasReachedCampaignDailyLimit(campaign)) break;

      const canContinue = await Campaign.exists({
        _id: campaign._id,
        status: "Processing",
        lockOwner: campaignWorkerId,
      });
      if (!canContinue) break;

      const now = new Date();
      const customer = campaign.targetCustomers.find(
        (recipient) =>
          recipient.status === "Pending" &&
          (!recipient.nextAttemptAt || new Date(recipient.nextAttemptAt) <= now),
      );
      if (!customer) break;

      const attemptNumber = Number(customer.attempts || 0) + 1;
      const recipientClaim = await Campaign.updateOne(
        {
          _id: campaign._id,
          status: "Processing",
          lockOwner: campaignWorkerId,
          targetCustomers: {
            $elemMatch: { _id: customer._id, status: "Pending" },
          },
        },
        {
          $set: {
            "targetCustomers.$.status": "Sending",
            "targetCustomers.$.lastAttemptAt": now,
            "targetCustomers.$.nextAttemptAt": null,
            lockExpiresAt: new Date(Date.now() + CAMPAIGN_LOCK_MS),
          },
          $inc: {
            "targetCustomers.$.attempts": 1,
            dailyAttemptCount: 1,
          },
        },
      );
      if (recipientClaim.modifiedCount === 0) {
        break;
      }

      customer.status = "Sending";
      customer.attempts = attemptNumber;
      campaign.dailyAttemptCount = Number(campaign.dailyAttemptCount || 0) + 1;
      const personalizedMessage = campaign.messageTemplate
        .replace(/\[الاسم\]/g, customer.name)
        .replace(/\[رقم الجوال\]/g, customer.phone);

      const sendResult = await sendCampaignMessage(
        customer.phone,
        personalizedMessage,
        campaign.tenantId,
      );
      const recipientUpdate = {
        lastProgressAt: new Date(),
        lockExpiresAt: new Date(Date.now() + CAMPAIGN_LOCK_MS),
      };
      let counterUpdate = null;

      if (sendResult.success) {
        recipientUpdate["targetCustomers.$.status"] = "Sent";
        recipientUpdate["targetCustomers.$.sentAt"] = new Date();
        recipientUpdate["targetCustomers.$.providerMessageId"] =
          sendResult.providerMessageId || null;
        recipientUpdate["targetCustomers.$.providerStatus"] =
          sendResult.providerStatus || "pending";
        recipientUpdate["targetCustomers.$.providerStatusCode"] =
          sendResult.providerStatusCode ?? 1;
        recipientUpdate["targetCustomers.$.providerStatusUpdatedAt"] =
          new Date();
        recipientUpdate["targetCustomers.$.errorMessage"] = "";
        counterUpdate = { sentCount: 1 };
        customer.status = "Sent";
        console.log(
          `✅ [Campaign] تم قبول رسالة ${customer.name} (${sendResult.providerMessageId || "بدون معرف"})`,
        );
      } else if (sendResult.uncertain) {
        recipientUpdate["targetCustomers.$.status"] = "Uncertain";
        recipientUpdate["targetCustomers.$.errorMessage"] =
          sendResult.errorMessage;
        counterUpdate = { uncertainCount: 1 };
        customer.status = "Uncertain";
      } else if (
        sendResult.retryable &&
        attemptNumber < CAMPAIGN_MAX_ATTEMPTS
      ) {
        const retryDelayMs = Math.max(
          Number(sendResult.retryAfterSeconds || 0) * 1000,
          attemptNumber * 60 * 1000,
        );
        recipientUpdate["targetCustomers.$.status"] = "Pending";
        recipientUpdate["targetCustomers.$.nextAttemptAt"] = new Date(
          Date.now() + retryDelayMs,
        );
        recipientUpdate["targetCustomers.$.errorMessage"] =
          sendResult.errorMessage;
        customer.status = "Pending";
        customer.nextAttemptAt =
          recipientUpdate["targetCustomers.$.nextAttemptAt"];
      } else {
        recipientUpdate["targetCustomers.$.status"] = "Failed";
        recipientUpdate["targetCustomers.$.errorMessage"] =
          sendResult.errorMessage;
        counterUpdate = { failedCount: 1 };
        customer.status = "Failed";
      }

      const campaignUpdate = { $set: recipientUpdate };
      if (counterUpdate) campaignUpdate.$inc = counterUpdate;
      await Campaign.updateOne(
        {
          _id: campaign._id,
          lockOwner: campaignWorkerId,
          "targetCustomers._id": customer._id,
        },
        campaignUpdate,
      );

      if (sendResult.success && sendResult.providerMessageId) {
        await Campaign.updateOne(
          {
            _id: campaign._id,
            "targetCustomers._id": customer._id,
          },
          {
            $inc: { "targetCustomers.$.deliveryCheckAttempts": 1 },
            $set: { "targetCustomers.$.lastDeliveryCheckAt": new Date() },
          },
        );
        const deliveryInfo = await getCampaignMessageInfo(
          sendResult.providerMessageId,
          campaign.tenantId,
        );
        if (deliveryInfo) {
          await updateCampaignMessageDelivery({
            tenantId: campaign.tenantId?._id || campaign.tenantId,
            identifiers: [
              sendResult.providerMessageId,
              deliveryInfo.providerWhatsappMessageId,
            ],
            whatsappMessageId: deliveryInfo.providerWhatsappMessageId,
            status: deliveryInfo.providerStatus,
          });
        }
      }

      processedInBatch += 1;
      const hasMoreReadyRecipients = campaign.targetCustomers.some(
        (recipient) =>
          recipient.status === "Pending" &&
          (!recipient.nextAttemptAt ||
            new Date(recipient.nextAttemptAt) <= new Date()),
      );
      if (
        processedInBatch < CAMPAIGN_BATCH_SIZE &&
        hasMoreReadyRecipients &&
        !hasReachedCampaignDailyLimit(campaign)
      ) {
        await new Promise((resolve) => setTimeout(resolve, getCampaignDelay()));
      }
    }

    await finalizeCampaignBatch(campaign._id);
  } catch (error) {
    console.error("❌ خطأ في معالجة الحملات التسويقية:", error.message);
    if (campaign?._id) {
      const retryUpdate = await Campaign.updateOne(
        {
          _id: campaign._id,
          status: { $nin: ["Paused", "Cancelled"] },
          lockOwner: campaignWorkerId,
        },
        {
          $set: {
            status: "Processing",
            lastError: error.message,
            nextRunAt: new Date(Date.now() + 60 * 1000),
            lockOwner: null,
            lockExpiresAt: null,
          },
        },
      ).catch(() => {});

      if (retryUpdate?.modifiedCount === 0) {
        await finalizeCampaignBatch(campaign._id).catch(() => {});
      }
    }
  } finally {
    isProcessingCampaigns = false;
  }
};

const reconcileCampaignDeliveries = async () => {
  if (isReconcilingCampaignDeliveries) return;
  isReconcilingCampaignDeliveries = true;

  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const campaigns = await Campaign.find({
      targetCustomers: {
        $elemMatch: {
          status: "Sent",
          providerMessageId: { $nin: [null, ""] },
          sentAt: { $gte: cutoff },
          providerStatusCode: { $in: [0, 1, 2] },
          deliveryCheckAttempts: { $lt: 12 },
        },
      },
    })
      .select(
        "tenantId targetCustomers._id targetCustomers.status targetCustomers.sentAt targetCustomers.providerMessageId targetCustomers.providerStatusCode targetCustomers.deliveryCheckAttempts targetCustomers.lastDeliveryCheckAt",
      )
      .populate("tenantId", "whatsappSettings")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    let checkedCount = 0;
    for (const campaign of campaigns) {
      if (!campaign.tenantId?.whatsappSettings?.apiKey) continue;

      for (const recipient of campaign.targetCustomers) {
        if (checkedCount >= 20) return;
        if (
          recipient.status !== "Sent" ||
          !recipient.providerMessageId ||
          !recipient.sentAt ||
          new Date(recipient.sentAt) < cutoff ||
          recipient.providerStatusCode === null ||
          recipient.providerStatusCode === undefined ||
          Number(recipient.providerStatusCode) >= 3 ||
          Number(recipient.deliveryCheckAttempts || 0) >= 12
        ) {
          continue;
        }

        checkedCount += 1;
        await Campaign.updateOne(
          {
            _id: campaign._id,
            "targetCustomers._id": recipient._id,
          },
          {
            $inc: { "targetCustomers.$.deliveryCheckAttempts": 1 },
            $set: { "targetCustomers.$.lastDeliveryCheckAt": new Date() },
          },
        );
        const deliveryInfo = await getCampaignMessageInfo(
          recipient.providerMessageId,
          campaign.tenantId,
        );
        if (!deliveryInfo) continue;

        await updateCampaignMessageDelivery({
          tenantId: campaign.tenantId._id,
          identifiers: [
            recipient.providerMessageId,
            deliveryInfo.providerWhatsappMessageId,
          ],
          whatsappMessageId: deliveryInfo.providerWhatsappMessageId,
          status: deliveryInfo.providerStatus,
        });
      }
    }
  } catch (error) {
    console.error("خطأ في مزامنة حالات وصول رسائل الحملات:", error.message);
  } finally {
    isReconcilingCampaignDeliveries = false;
  }
};

const cleanupPendingPayments = async () => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const expiredAppointments = await Appointment.find({
      status: "Pending_Payment",
      createdAt: { $lte: fifteenMinutesAgo },
    }).lean();

    if (expiredAppointments.length === 0) return;

    console.log(
      `🧹 [مدير التنظيف]: جاري إلغاء ${expiredAppointments.length} موعد معلق لم يتم سداد عربونه...`,
    );

    for (const app of expiredAppointments) {
      await Appointment.updateOne(
        { _id: app._id },
        {
          $set: {
            status: "Cancelled",
            cancelReason: "تجاوز مهلة الدفع (15 دقيقة)",
          },
        },
      );

      const startTime = new Date(app.createdAt);
      startTime.setSeconds(startTime.getSeconds() - 5);

      const endTime = new Date(app.createdAt);
      endTime.setSeconds(endTime.getSeconds() + 5);

      await Appointment.deleteMany({
        tenantId: app.tenantId,
        barberId: app.barberId,
        date: app.date,
        childName: "Padding Block",
        status: "Blocked",
        createdAt: { $gte: startTime, $lte: endTime },
      });
    }

    console.log(`✅ [مدير التنظيف]: تم تحرير الأوقات والمقاعد بنجاح.`);
  } catch (error) {
    console.error("❌ خطأ في نظام تنظيف المواعيد المعلقة:", error.message);
  }
};

const startCronJobs = () => {
  console.log("تم تشغيل نظام العمليات الخلفية (Cron Jobs) بنجاح...");

  processNotificationQueue().catch((error) =>
    console.error("خطأ في بدء طابور الإشعارات:", error.message),
  );

  cron.schedule("*/15 * * * *", processAutomatedReminders);

  cron.schedule("*/5 * * * *", cleanupPendingPayments);

  cron.schedule("0 8 * * *", processSubscriptionReminders);

  cron.schedule("0 10 * * *", processRetentionCampaign);

  cron.schedule("* * * * *", processBroadcastCampaigns);

  cron.schedule("*/5 * * * *", reconcileCampaignDeliveries);

  cron.schedule("*/15 * * * * *", processNotificationQueue);

  cron.schedule("* * * * *", reconcileNotificationDeliveries);

  cron.schedule("* * * * *", () => processPendingZakatySetups().catch((error) =>
    console.error('Zakaty setup recovery failed:', error.message)));
};

module.exports = {
  startCronJobs,
  processBroadcastCampaigns,
  reconcileCampaignDeliveries,
  processNotificationQueue,
  reconcileNotificationDeliveries,
};
