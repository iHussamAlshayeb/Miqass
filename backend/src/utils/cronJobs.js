const cron = require("node-cron");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");

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

const processBroadcastCampaigns = async () => {
  if (isProcessingCampaigns) return;
  isProcessingCampaigns = true;

  try {
    let campaign = await Campaign.findOneAndUpdate(
      { status: "Pending" },
      { $set: { status: "Processing" } },
      { returnDocument: "after" },
    )
      .populate("tenantId", "salonName whatsappSettings")
      .lean();

    if (!campaign) {
      campaign = await Campaign.findOne({ status: "Processing" })
        .populate("tenantId", "salonName whatsappSettings")
        .lean();
    }

    if (!campaign) return;

    console.log(
      `🚀 [مدير الحملات]: بدء معالجة حملة لصالون ${campaign.tenantId?.salonName}...`,
    );

    const customers = campaign.targetCustomers;
    let sentCount = campaign.sentCount || 0;

    for (let i = sentCount; i < customers.length; i++) {
      const customer = customers[i];
      const personalizedMessage = campaign.messageTemplate.replace(
        /\[الاسم\]/g,
        customer.name,
      );

      try {
        await sendCampaignMessage(
          customer.phone,
          personalizedMessage,
          campaign.tenantId,
        );
        console.log(
          `✅ [Campaign] تم الإرسال لـ ${customer.name} (${i + 1}/${customers.length})`,
        );

        await Campaign.updateOne(
          { _id: campaign._id, "targetCustomers._id": customer._id },
          {
            $set: { "targetCustomers.$.status": "Sent" },
            $inc: { sentCount: 1 },
          },
        );
      } catch (err) {
        console.error(`❌ [Campaign] فشل الإرسال لـ ${customer.name}`);
        await Campaign.updateOne(
          { _id: campaign._id, "targetCustomers._id": customer._id },
          {
            $set: {
              "targetCustomers.$.status": "Failed",
              "targetCustomers.$.errorMessage": err.message,
            },
          },
        );
      }

      if (i < customers.length - 1) {
        const delay = Math.floor(Math.random() * (25000 - 10000 + 1)) + 10000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { status: "Completed", completedAt: new Date() } },
    );
    console.log(
      `🏁 [مدير الحملات]: تم الانتهاء من حملة صالون ${campaign.tenantId?.salonName} بنجاح!`,
    );
  } catch (error) {
    console.error("❌ خطأ في معالجة الحملات التسويقية:", error.message);
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

module.exports = { startCronJobs };
