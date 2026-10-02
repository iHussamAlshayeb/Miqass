const axios = require("axios");
const crypto = require("crypto");
const os = require("os");
const NotificationDelivery = require("../models/NotificationDelivery");
const PushDevice = require("../models/PushDevice");

const ONESIGNAL_API_URL = "https://api.onesignal.com/notifications";
const MAX_SEND_ATTEMPTS = 5;
const MAX_BATCH_SIZE = 10;
const LOCK_DURATION_MS = 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const notificationWorkerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;

let isProcessingNotifications = false;
let isReconcilingNotifications = false;

const formatTimeForMessage = (timeStr) => {
  if (!timeStr) return "";
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  let period = "صباحاً";
  if (hour >= 12 && hour < 18) period = "عصراً";
  else if (hour >= 18 && hour < 24) period = "مساءً";
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${minStr} ${period}`;
};

const getTargetUrl = () =>
  process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/+$/, "")}/dashboard`
    : "https://www.miqass.app/dashboard";

const getDedupeKey = (type, tenantId, providedKey) =>
  providedKey
    ? `${type}:${tenantId}:${providedKey}`
    : `${type}:${tenantId}:${crypto.randomUUID()}`;

const enqueueNotification = async ({
  tenantId,
  type,
  dedupeKey,
  headings,
  contents,
  url = getTargetUrl(),
}) => {
  if (!tenantId) throw new Error("Notification tenantId is required");

  return NotificationDelivery.findOneAndUpdate(
    { dedupeKey: getDedupeKey(type, tenantId, dedupeKey) },
    {
      $setOnInsert: {
        tenantId,
        type,
        headings,
        contents,
        url,
        status: "Pending",
        nextAttemptAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
};

const sendAdminNotification = async (
  customerName,
  date,
  time,
  barberName,
  tenantId,
  options = {},
) => {
  const friendlyTime = formatTimeForMessage(time);
  const messageText = `هلا والله! جاكم حجز جديد من ${customerName} ✨\n📅 متى؟ ${date} الساعة ${friendlyTime}\n💈 عند مين؟ ${barberName || "غير محدد"}\nشيكوا المواعيد وجهزوا العدة! ✂️`;

  return enqueueNotification({
    tenantId,
    type: "booking",
    dedupeKey: options.dedupeKey,
    headings: { en: "🎉 حجز جديد وصلك!", ar: "🎉 حجز جديد وصلك!" },
    contents: { en: messageText, ar: messageText },
  });
};

const sendReviewNotification = async (
  customerName,
  rating,
  comment,
  tenantId,
  options = {},
) => {
  const stars = "⭐".repeat(rating);
  const intro =
    rating >= 4
      ? "كفو! عميلك مستانس من الشغل 🤩"
      : "وصلك تقييم يحتاج انتباهك ورضاهم غايتنا 👀";
  const commentText = comment
    ? `يقول: "${comment}"`
    : "العميل قيّم بالنجوم بس وما كتب تعليق.";
  const messageText = `${intro}\nالعميل: ${customerName}\nالتقييم: ${stars}\n💬 ${commentText}`;

  return enqueueNotification({
    tenantId,
    type: "review",
    dedupeKey: options.dedupeKey,
    headings: {
      en: "⭐ تقييم جديد لصالونك!",
      ar: "⭐ تقييم جديد لصالونك!",
    },
    contents: { en: messageText, ar: messageText },
  });
};

const scheduleRetry = async (notification, error, noRecipients = false) => {
  const attempts = Number(notification.attempts || 0);
  const isFinal = attempts >= MAX_SEND_ATTEMPTS;
  const status = isFinal
    ? noRecipients
      ? "NoRecipients"
      : "Failed"
    : "Retrying";
  const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];

  await NotificationDelivery.updateOne(
    { _id: notification._id, lockOwner: notificationWorkerId },
    {
      $set: {
        status,
        lastError: String(error?.message || error || "Unknown notification error").slice(0, 1000),
        nextAttemptAt: status === "Retrying" ? new Date(Date.now() + delay) : null,
        lockOwner: null,
        lockExpiresAt: null,
      },
    },
  );
};

const deactivateInvalidSubscriptions = async (errors) => {
  const invalidIds = [
    ...(errors?.invalid_player_ids || []),
    ...(errors?.invalid_subscription_ids || []),
  ].filter(Boolean);
  if (invalidIds.length === 0) return;

  await PushDevice.updateMany(
    { subscriptionId: { $in: invalidIds } },
    { $set: { active: false, disabledAt: new Date() } },
  );
};

const deliverNotification = async (notification) => {
  if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY) {
    throw new Error("OneSignal credentials are not configured");
  }

  const devices = await PushDevice.find({
    tenantId: notification.tenantId,
    active: true,
  })
    .select("subscriptionId")
    .lean();
  const subscriptionIds = [...new Set(devices.map((device) => device.subscriptionId))];

  if (subscriptionIds.length === 0) {
    const error = new Error("No active push subscriptions for this tenant");
    error.noRecipients = true;
    throw error;
  }

  const response = await axios.post(
    ONESIGNAL_API_URL,
    {
      app_id: process.env.ONESIGNAL_APP_ID,
      target_channel: "push",
      idempotency_key: notification.providerIdempotencyKey,
      name: `miqass-${notification.type}-${notification._id}`,
      include_subscription_ids: subscriptionIds,
      headings: notification.headings,
      contents: notification.contents,
      url: notification.url,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${process.env.ONESIGNAL_API_KEY}`,
      },
      timeout: 10_000,
    },
  );

  const providerResponse = response.data || {};
  await deactivateInvalidSubscriptions(providerResponse.errors);
  const hasRecipientCount = providerResponse.recipients !== undefined;
  const acceptedCount = hasRecipientCount
    ? Number(providerResponse.recipients || 0)
    : subscriptionIds.length;

  if (!providerResponse.id || (hasRecipientCount && acceptedCount <= 0)) {
    const error = new Error(
      providerResponse.errors
        ? `OneSignal rejected recipients: ${JSON.stringify(providerResponse.errors)}`
        : "OneSignal accepted zero recipients",
    );
    error.noRecipients = true;
    throw error;
  }

  await NotificationDelivery.updateOne(
    { _id: notification._id, lockOwner: notificationWorkerId },
    {
      $set: {
        status: "Sent",
        providerNotificationId: providerResponse.id,
        targetedCount: subscriptionIds.length,
        acceptedCount,
        providerErrors: providerResponse.errors || null,
        sentAt: new Date(),
        lastError: "",
        lockOwner: null,
        lockExpiresAt: null,
      },
    },
  );
};

const claimNextNotification = () => {
  const now = new Date();
  return NotificationDelivery.findOneAndUpdate(
    {
      status: { $in: ["Pending", "Retrying", "Processing"] },
      nextAttemptAt: { $lte: now },
      $or: [
        { lockExpiresAt: null },
        { lockExpiresAt: { $exists: false } },
        { lockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "Processing",
        lastAttemptAt: now,
        lockOwner: notificationWorkerId,
        lockExpiresAt: new Date(now.getTime() + LOCK_DURATION_MS),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { createdAt: 1 } },
  );
};

const processNotificationQueue = async () => {
  if (isProcessingNotifications) return;
  isProcessingNotifications = true;

  try {
    for (let index = 0; index < MAX_BATCH_SIZE; index += 1) {
      const notification = await claimNextNotification();
      if (!notification) break;

      try {
        await deliverNotification(notification);
      } catch (error) {
        console.error(`OneSignal delivery failed (${notification._id}):`, error.message);
        await scheduleRetry(notification, error, error.noRecipients === true);
      }
    }
  } finally {
    isProcessingNotifications = false;
  }
};

const reconcileNotificationDeliveries = async () => {
  if (isReconcilingNotifications) return;
  if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY) return;
  isReconcilingNotifications = true;

  try {
    const staleCheck = new Date(Date.now() - 60 * 1000);
    const notifications = await NotificationDelivery.find({
      status: "Sent",
      providerNotificationId: { $nin: [null, ""] },
      completedAt: null,
      reconciliationAttempts: { $lt: 12 },
      $or: [
        { lastDeliveryCheckAt: null },
        { lastDeliveryCheckAt: { $lte: staleCheck } },
      ],
    })
      .sort({ sentAt: 1 })
      .limit(20);

    for (const notification of notifications) {
      try {
        const response = await axios.get(
          `${ONESIGNAL_API_URL}/${notification.providerNotificationId}`,
          {
            params: { app_id: process.env.ONESIGNAL_APP_ID },
            headers: { Authorization: `Key ${process.env.ONESIGNAL_API_KEY}` },
            timeout: 10_000,
          },
        );
        const data = response.data || {};
        const confirmedCount = Number(data.received || 0);
        const isComplete = Boolean(data.completed_at) || Number(data.remaining || 0) === 0;

        await NotificationDelivery.updateOne(
          { _id: notification._id },
          {
            $set: {
              status: confirmedCount > 0 ? "Delivered" : "Sent",
              successfulCount: Number(data.successful || 0),
              failedCount: Number(data.failed || 0),
              confirmedCount,
              providerErrors: data.errors || notification.providerErrors,
              completedAt: isComplete ? new Date() : null,
              lastDeliveryCheckAt: new Date(),
            },
            $inc: { reconciliationAttempts: 1 },
          },
        );
      } catch (error) {
        await NotificationDelivery.updateOne(
          { _id: notification._id },
          {
            $set: {
              lastDeliveryCheckAt: new Date(),
              lastError: `Delivery check failed: ${error.message}`.slice(0, 1000),
            },
            $inc: { reconciliationAttempts: 1 },
          },
        );
      }
    }
  } finally {
    isReconcilingNotifications = false;
  }
};

module.exports = {
  sendAdminNotification,
  sendReviewNotification,
  processNotificationQueue,
  reconcileNotificationDeliveries,
};
