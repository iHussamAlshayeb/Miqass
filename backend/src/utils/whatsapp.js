const axios = require("axios");

const API_URL = "https://www.wasenderapi.com/api/send-message";

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

const formatPhoneNumber = (phone) => {
  if (!phone) return null;

  let cleanPhone = phone.toString().replace(/\D/g, "");

  if (cleanPhone === "0000000000" || cleanPhone.length < 9) return null;

  if (cleanPhone.startsWith("05")) {
    cleanPhone = "966" + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith("00966")) {
    cleanPhone = cleanPhone.substring(2);
  } else if (cleanPhone.startsWith("966")) {
    cleanPhone = cleanPhone;
  } else if (cleanPhone.startsWith("5")) {
    cleanPhone = "966" + cleanPhone;
  }

  return cleanPhone;
};

const handleWhatsAppError = (actionName, error) => {
  if (error.response) {
    const data = error.response.data;
    const isHtml =
      typeof data === "string" && data.toLowerCase().includes("<html");

    if (error.response.status === 403) {
      console.error(
        `❌ [WhatsApp - ${actionName}]: خطأ 403 - غير مصرح (تأكد من صلاحية الـ API Key).`,
      );
    } else if (isHtml) {
      console.error(
        `❌ [WhatsApp - ${actionName}]: خطأ ${error.response.status} (السيرفر أرجع صفحة ويب بدلاً من JSON).`,
      );
    } else {
      console.error(`❌ [WhatsApp - ${actionName}]:`, data);
    }
  } else {
    console.error(`❌ [WhatsApp - ${actionName}]:`, error.message);
  }
};

const sendWhatsAppMessage = async (
  phone,
  childName,
  date,
  time,
  barberName,
  tenant,
) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const friendlyTime = formatTimeForMessage(time);
    const salonName = tenant?.salonName || "الصالون";
    const locationUrl =
      tenant?.settings?.locationUrl || "رابط الموقع غير متوفر";
    const contactPhone = tenant?.ownerPhone
      ? `\n📞 للتواصل: ${tenant.ownerPhone}`
      : "";
    const seatName = barberName ? `\n💈 الكرسي/الحلاق: ${barberName}` : "";

    const message = `يا هلا والله فيك بـ ${salonName} 👋
تم تأكيد حجز *${childName}* بنجاح! ✂️

📅 التاريخ: ${date}
⏰ الوقت: ${friendlyTime}${seatName}

📍 موقعنا على الخريطة:
${locationUrl}${contactPhone}

يا ليت تشرفنا قبل الموعد بـ 15 دقيقة، 
وإذا صار لك ظرف وما بتقدر تحضر، ياليت تبلغنا بوقت كافي.

ننتظرك، ويومك سعيد! ✨`;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: message },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    console.log(`✅ تم إرسال رسالة التأكيد لصالون ${salonName} بنجاح.`);
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة التأكيد", error);
    return false;
  }
};

const sendCancellationMessage = async (
  phone,
  childName,
  barberName,
  tenant,
  reason = "",
) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const salonName = tenant?.salonName || "الصالون";
    const slug = tenant?.slug || "";
    const bookingLink = slug ? `https://miqass.app/${slug}` : "رابط الصالون";
    const reasonText = reason ? `\n*سبب الإلغاء:* ${reason}\n` : "";
    const seatName = barberName ? `(عند ${barberName}) ` : "";

    const message = `يا هلا فيك من ${salonName} 👋
حبينا نبلغك إنه تم إلغاء حجز *${childName}* ${seatName}بناءً على طلبكم أو لظرف طارئ.
${reasonText}
نتمنى نشوفك بوقت ثاني! تقدر تحجز موعد جديد متى ما ناسبك بكل سهولة من هنا:
${bookingLink}

في أمان الله! ✨`;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: message },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    console.log(`✅ تم إرسال رسالة الإلغاء لصالون ${salonName}.`);
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة الإلغاء", error);
    return false;
  }
};

const sendReminderMessage = async (
  phone,
  childName,
  time,
  barberName,
  tenant,
) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const friendlyTime = formatTimeForMessage(time);
    const salonName = tenant?.salonName || "الصالون";
    const locationUrl = tenant?.settings?.locationUrl || "";
    const contactPhone = tenant?.ownerPhone
      ? `\n📞 للاستفسار: ${tenant.ownerPhone}`
      : "";
    const seatName = barberName ? `\n💈 الكرسي/الحلاق: ${barberName}` : "";

    const message = `يا هلا بك مرة ثانية من ${salonName} 👋

مجرد تذكير بسيط بموعد حلاقة *${childName}* ✂️✨

⏰ موعدنا: اليوم الساعة ${friendlyTime}${seatName}

📍 موقعنا:
${locationUrl}${contactPhone}

يا ليت تشرفنا قبل الموعد بـ 15 دقيقة عشان نخدمك بأفضل شكل.. بانتظارك!

*(وإذا صار لك أي طارئ حاب تلغي، ياليت تتواصل معنا).*`;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: message },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    console.log(`✅ تم إرسال رسالة التذكير لصالون ${salonName}.`);
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة التذكير", error);
    return false;
  }
};

const sendReviewRequestMessage = async (
  phone,
  childName,
  tenant,
  appointmentId,
) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.log(`⚠️ [WhatsApp] تم تخطي الإرسال لأن الرقم غير صالح أو وهمي.`);
      return false;
    }

    const salonName = tenant?.salonName || "الصالون";
    const reviewUrl = `https://miqass.app/rate/${appointmentId}`;

    const message = `يا هلا والله من ${salonName} 👋
نتمنى إن تجربة الحلاقة لـ *${childName}* كانت ممتازة ونالت إعجابكم! ✂️✨

رأيك يهمنا مرة ويساعدنا نتطور ونقدم الأفضل دايماً.
ياليت تتكرم وتقيم تجربتك عبر الرابط السريع هذا:
⭐ ${reviewUrl}

شكراً لثقتك فينا، ونتمنى نشوفك قريب! 🌟`;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: message },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    console.log(
      `✅ [WhatsApp] تم إرسال رابط التقييم لـ ${childName} (${reviewUrl})`,
    );
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة التقييم", error);
    return false;
  }
};

const sendLoyaltyRewardMessage = async (phone, customerName, tenant) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const salonName = tenant?.salonName || "الصالون";
    const slug = tenant?.slug || "";
    const bookingLink = slug ? `https://miqass.app/${slug}` : "رابط الصالون";

    const message = `يا هلا والله بـ ${customerName}، عميلنا المميز في ${salonName} 👑

حبينا نبلغك إنك كملت معنا 5 زيارات، وهذا يعني إن **حلاقتك الجاية علينا (مـجـانـاً)!** 🎁✂️

تقديراً لولائك وثقتك فينا، احجز موعدك الجاي متى ما حبيت من هنا، وبلغ الكاشير إن عندك مكافأة ولاء:
${bookingLink}

ننتظرك تنورنا! ✨`;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: message },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    console.log(`✅ تم إرسال رسالة مكافأة الولاء لعميل صالون ${salonName}.`);
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة الولاء", error);
    return false;
  }
};

const sendRetentionMessage = async (phone, customerName, tenant) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const salonName = tenant?.salonName || "الصالون";
    const slug = tenant?.slug || "";
    const bookingLink = slug ? `https://miqass.app/${slug}` : "رابط الصالون";

    const message = `يا هلا والله بـ ${customerName} 👋
طالت الغيبة! اشتقنا لزيارتك لنا في ${salonName} ✂️✨

حبينا نذكرك إن وقت حلاقتك قرّب، وتقدر تحجز موعدك وتختار حلاقك المفضل بكل سهولة وفي ثواني عبر الرابط:
👇👇
${bookingLink}

ننتظرك تنورنا! 🤍`;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: message },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    console.log(
      `✅ تم إرسال رسالة إعادة الاستهداف للعميل ${customerName} - صالون ${salonName}`,
    );
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة إعادة الاستهداف", error);
    return false;
  }
};

const sendCampaignMessage = async (phone, messageText, tenant) => {
  try {
    const customApiKey = tenant?.whatsappSettings?.apiKey;
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    await axios.post(
      API_URL,
      { to: formattedPhone, text: messageText },
      {
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    return true;
  } catch (error) {
    handleWhatsAppError("رسالة الحملة التسويقية", error);
    return false;
  }
};

const getWhatsAppStatus = () => ({ status: "API_ACTIVE", qr: "" });

module.exports = {
  sendWhatsAppMessage,
  sendCancellationMessage,
  sendReminderMessage,
  getWhatsAppStatus,
  sendReviewRequestMessage,
  sendLoyaltyRewardMessage,
  sendRetentionMessage,
  sendCampaignMessage,
};
