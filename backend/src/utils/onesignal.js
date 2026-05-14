const axios = require("axios");

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

const sendAdminNotification = async (
  customerName,
  date,
  time,
  barberName,
  tenantId,
) => {
  if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY) {
    console.log(
      "⚠️ لم يتم إرسال الإشعار: مفاتيح OneSignal غير متوفرة في ملف .env",
    );
    return;
  }

  try {
    const friendlyTime = formatTimeForMessage(time);

    const messageText = `هلا والله! جاكم حجز جديد من ${customerName} ✨\n📅 متى؟ ${date} الساعة ${friendlyTime}\n💈 عند مين؟ ${barberName || "غير محدد"}\nشيكوا المواعيد وجهزوا العدة! ✂️`;

    const targetUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/dashboard`
      : "https://miqass.app/dashboard";

    await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: process.env.ONESIGNAL_APP_ID,
        filters: [
          {
            field: "tag",
            key: "tenantId",
            relation: "=",
            value: tenantId.toString(),
          },
        ],
        headings: { en: `🎉 حجز جديد وصلك!`, ar: `🎉 حجز جديد وصلك!` },
        contents: { en: messageText, ar: messageText },
        url: targetUrl,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.ONESIGNAL_API_KEY}`,
        },
        timeout: 5000,
      },
    );

    console.log(`🔔 تم إرسال إشعار الحجز لـ OneSignal (صالون: ${tenantId})`);
  } catch (error) {
    console.log("❌ خطأ أو تأخير في إرسال إشعار OneSignal (الحجز)");
  }
};

const sendReviewNotification = async (
  customerName,
  rating,
  comment,
  tenantId,
) => {
  if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY) return;

  try {
    let stars = "⭐".repeat(rating);
    let intro =
      rating >= 4
        ? "كفو! عميلك مستانس من الشغل 🤩"
        : "وصلك تقييم يحتاج انتباهك ورضاهم غايتنا 👀";

    let commentText = comment
      ? `يقول: "${comment}"`
      : "العميل قيّم بالنجوم بس وما كتب تعليق.";

    const messageText = `${intro}\nالعميل: ${customerName}\nالتقييم: ${stars}\n💬 ${commentText}`;

    const targetUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/dashboard`
      : "https://miqass.app/dashboard";

    await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: process.env.ONESIGNAL_APP_ID,
        filters: [
          {
            field: "tag",
            key: "tenantId",
            relation: "=",
            value: tenantId.toString(),
          },
        ],
        headings: {
          en: `⭐ تقييم جديد لصالونك!`,
          ar: `⭐ تقييم جديد لصالونك!`,
        },
        contents: { en: messageText, ar: messageText },
        url: targetUrl,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.ONESIGNAL_API_KEY}`,
        },
        timeout: 5000,
      },
    );

    console.log(`🔔 تم إرسال إشعار التقييم لـ OneSignal (صالون: ${tenantId})`);
  } catch (error) {
    console.log("❌ خطأ أو تأخير في إرسال إشعار OneSignal (التقييم)");
  }
};

module.exports = { sendAdminNotification, sendReviewNotification };
