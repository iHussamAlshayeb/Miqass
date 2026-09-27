const cron = require("node-cron");
const crypto = require("crypto");
const os = require("os");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const { createSaleFromAppointment } = require("../services/salesService");

const {
  sendReminderMessage,
  sendReviewRequestMessage,
  sendRetentionMessage,
  sendCampaignMessage,
} = require("./whatsapp");
const { sendRenewalReminderEmail } = require("./emailService");

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

const processReviewRequests = async () => {
  try {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const todayStr = formatDate(now);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    const finishedAppointments = await Appointment.find({
      status: { $in: ["Booked", "Completed"] },
      isReviewRequested: false,
      date: { $in: [todayStr, yesterdayStr] },
    })
      .select("_id status date timeSlot childName customerId tenantId")
      .populate("tenantId", "settings salonName whatsappSettings")
      .populate("customerId", "phone")
      .lean();

    for (let app of finishedAppointments) {
      if (
        !app.tenantId?.settings?.enableGoogleReviews ||
        !app.tenantId?.whatsappSettings?.isEnabled
      )
        continue;

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

      const diffMs = now - appTime;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours >= 1.5 && diffHours <= 12) {
        console.log(
          `⭐ [مدير التقييمات]: جاري إرسال طلب تقييم لـ ${app.childName} من ${app.tenantId?.salonName}...`,
        );

        const isSent = await sendReviewRequestMessage(
          customerPhone,
          app.childName,
          app.tenantId,
          app._id,
        );

        if (isSent) {
          const updateData = { $set: { isReviewRequested: true } };
          if (app.status === "Booked") updateData.$set.status = "Completed";

          await Appointment.updateOne({ _id: app._id }, updateData);

          if (app.status === "Booked") {
            const completedAppointment = await Appointment.findById(app._id)
              .populate("customerId", "phone parentName children")
              .exec();
            await createSaleFromAppointment(completedAppointment);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  } catch (error) {
    console.error("❌ خطأ في نظام التقييم الآلي:", error.message);
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
    { Pending: 0, Sending: 0, Sent: 0, Failed: 0, Uncertain: 0 },
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

const finalizeCampaignBatch = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId)
    .select("targetCustomers totalCount")
    .lean();
  if (!campaign) return;

  const counts = getCampaignRecipientCounts(campaign.targetCustomers);
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
  const nextAttemptAt =
    hasImmediatelyReadyRecipient
      ? new Date(now.getTime() + 60 * 1000)
      : pendingAttemptDates.length > 0
      ? new Date(Math.min(...pendingAttemptDates))
      : new Date(now.getTime() + 60 * 1000);
  const hasErrors = counts.Failed > 0 || counts.Uncertain > 0;

  await Campaign.updateOne(
    { _id: campaignId, lockOwner: campaignWorkerId },
    {
      $set: {
        status: hasPending
          ? "Processing"
          : hasErrors
            ? "Completed_With_Errors"
            : "Completed",
        totalCount: campaign.totalCount || campaign.targetCustomers.length,
        sentCount: counts.Sent,
        failedCount: counts.Failed,
        uncertainCount: counts.Uncertain,
        completedAt: hasPending ? null : now,
        nextRunAt: hasPending ? nextAttemptAt : null,
        lockOwner: null,
        lockExpiresAt: null,
      },
    },
  );
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

    console.log(
      `🚀 [مدير الحملات]: معالجة دفعة لصالون ${campaign.tenantId?.salonName}...`,
    );

    let processedInBatch = 0;
    while (processedInBatch < CAMPAIGN_BATCH_SIZE) {
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
          $inc: { "targetCustomers.$.attempts": 1 },
        },
      );
      if (recipientClaim.modifiedCount === 0) {
        customer.status = "Uncertain";
        continue;
      }

      customer.status = "Sending";
      customer.attempts = attemptNumber;
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
          sendResult.providerStatus || "in_progress";
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

      processedInBatch += 1;
      const hasMoreReadyRecipients = campaign.targetCustomers.some(
        (recipient) =>
          recipient.status === "Pending" &&
          (!recipient.nextAttemptAt ||
            new Date(recipient.nextAttemptAt) <= new Date()),
      );
      if (
        processedInBatch < CAMPAIGN_BATCH_SIZE &&
        hasMoreReadyRecipients
      ) {
        await new Promise((resolve) => setTimeout(resolve, getCampaignDelay()));
      }
    }

    await finalizeCampaignBatch(campaign._id);
  } catch (error) {
    console.error("❌ خطأ في معالجة الحملات التسويقية:", error.message);
    if (campaign?._id) {
      await Campaign.updateOne(
        { _id: campaign._id, lockOwner: campaignWorkerId },
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
    }
  } finally {
    isProcessingCampaigns = false;
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

  cron.schedule("*/15 * * * *", processAutomatedReminders);

  cron.schedule("*/5 * * * *", cleanupPendingPayments);

  cron.schedule("0 8 * * *", processSubscriptionReminders);

  cron.schedule("*/30 * * * *", processReviewRequests);

  cron.schedule("0 10 * * *", processRetentionCampaign);

  cron.schedule("* * * * *", processBroadcastCampaigns);
};

module.exports = { startCronJobs, processBroadcastCampaigns };
