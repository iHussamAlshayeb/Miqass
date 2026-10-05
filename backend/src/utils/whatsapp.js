const axios = require("axios");
const { normalizeWasenderMessageStatus } = require("./wasender");
const { renderTemplate } = require("./whatsappTemplates");
const { decrypt } = require("./encryption");
const {
  sendWhatsiText,
  getWhatsiMessage,
  isWhatsiNumberError,
  normalizeWhatsiMessageStatus,
} = require("./whatsi");

// مفتاح WaSender مخزّن مشفراً؛ نفكه فقط لحظة الإرسال
const getTenantApiKey = (tenant) => decrypt(tenant?.whatsappSettings?.apiKey) || null;

const WASENDER_API_BASE_URL = "https://www.wasenderapi.com";
const API_URL = `${WASENDER_API_BASE_URL}/api/send-message`;

// وسيط الواتساب لكل صالون: wasender (الافتراضي) أو whatsi
const isWhatsiTenant = (tenant) => tenant?.whatsappSettings?.provider === "whatsi";

// مفتاح الإرسال للصالون (WaSender أو Whatsi) مخزن مشفراً؛ null إن لم يكن الربط جاهزاً
const getSendCredential = (tenant) => getTenantApiKey(tenant);

// عند رفض Whatsi لأن رقم الصالون غير متصل، نحدّث حالة الربط ليظهر التنبيه في لوحة التحكم
const markWhatsiNumberDisconnected = (tenant) => {
  if (!tenant?._id) return;
  // تحميل متأخر لتجنب الاعتماد الدائري بين النماذج والأدوات
  const Tenant = require("../models/Tenant");
  Tenant.updateOne(
    { _id: tenant._id, "whatsappSettings.provider": "whatsi" },
    { $set: { "whatsappSettings.sessionStatus": "DISCONNECTED" } },
  ).catch(() => {});
};

const isWhatsappReady = (tenant) =>
  Boolean(tenant?.whatsappSettings?.isEnabled && getSendCredential(tenant));

// إرسال نص عبر وسيط الصالون. Whatsi يقبل الرسالة في الطابور ويرجع 202 مباشرة.
const postText = async (tenant, credential, body, options = {}) => {
  if (isWhatsiTenant(tenant)) {
    try {
      const data = await sendWhatsiText(credential, {
        to: body.to,
        text: body.text,
        from: tenant?.whatsappSettings?.whatsiFrom || undefined,
        clientMessageId: options.clientMessageId,
      });
      return { data: { success: true, data } };
    } catch (error) {
      if (isWhatsiNumberError(error)) markWhatsiNumberDisconnected(tenant);
      throw error;
    }
  }
  return axios.post(API_URL, body, {
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    timeout: 8000,
  });
};

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
    const customApiKey = getSendCredential(tenant);
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const friendlyTime = formatTimeForMessage(time);
    const salonName = tenant?.salonName || "الصالون";
    const locationUrl =
      tenant?.settings?.locationUrl || "رابط الموقع غير متوفر";
    const publicPhone = tenant?.settings?.contactPhone || tenant?.ownerPhone;
    const contactPhone = publicPhone
      ? `\n📞 للتواصل: ${publicPhone}`
      : "";
    const seatName = barberName ? `\n💈 الكرسي/الحلاق: ${barberName}` : "";

    const message = renderTemplate(tenant, 'confirmation', {
      اسم_الصالون: salonName, اسم_العميل: childName, التاريخ: date,
      الوقت: friendlyTime, الحلاق: seatName, الموقع: locationUrl,
      رقم_التواصل: contactPhone,
    });

    await postText(tenant, customApiKey, { to: formattedPhone, text: message });

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
    const customApiKey = getSendCredential(tenant);
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const salonName = tenant?.salonName || "الصالون";
    const slug = tenant?.slug || "";
    const bookingLink = slug ? `https://www.miqass.app/${slug}` : "رابط الصالون";
    const reasonText = reason ? `\n*سبب الإلغاء:* ${reason}\n` : "";
    const seatName = barberName ? `(عند ${barberName}) ` : "";

    const message = renderTemplate(tenant, 'cancellation', {
      اسم_الصالون: salonName, اسم_العميل: childName, الحلاق: seatName,
      سبب_الإلغاء: reasonText, رابط_الحجز: bookingLink,
    });

    await postText(tenant, customApiKey, { to: formattedPhone, text: message });

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
    const customApiKey = getSendCredential(tenant);
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const friendlyTime = formatTimeForMessage(time);
    const salonName = tenant?.salonName || "الصالون";
    const locationUrl = tenant?.settings?.locationUrl || "";
    const publicPhone = tenant?.settings?.contactPhone || tenant?.ownerPhone;
    const contactPhone = publicPhone
      ? `\n📞 للاستفسار: ${publicPhone}`
      : "";
    const seatName = barberName ? `\n💈 الكرسي/الحلاق: ${barberName}` : "";

    const message = renderTemplate(tenant, 'reminder', {
      اسم_الصالون: salonName, اسم_العميل: childName, الوقت: friendlyTime,
      الحلاق: seatName, الموقع: locationUrl, رقم_التواصل: contactPhone,
    });

    await postText(tenant, customApiKey, { to: formattedPhone, text: message });

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
    const customApiKey = getSendCredential(tenant);
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.log(`⚠️ [WhatsApp] تم تخطي الإرسال لأن الرقم غير صالح أو وهمي.`);
      return false;
    }

    const salonName = tenant?.salonName || "الصالون";
    const reviewUrl = `https://www.miqass.app/rate/${appointmentId}`;

    const message = renderTemplate(tenant, 'review', {
      اسم_الصالون: salonName, اسم_العميل: childName, رابط_التقييم: reviewUrl,
    });

    await postText(tenant, customApiKey, { to: formattedPhone, text: message });

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
    const customApiKey = getSendCredential(tenant);
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const salonName = tenant?.salonName || "الصالون";
    const slug = tenant?.slug || "";
    const bookingLink = slug ? `https://www.miqass.app/${slug}` : "رابط الصالون";

    const message = renderTemplate(tenant, 'loyalty', {
      اسم_الصالون: salonName, اسم_العميل: customerName, رابط_الحجز: bookingLink,
    });

    await postText(tenant, customApiKey, { to: formattedPhone, text: message });

    console.log(`✅ تم إرسال رسالة مكافأة الولاء لعميل صالون ${salonName}.`);
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة الولاء", error);
    return false;
  }
};

const sendRetentionMessage = async (phone, customerName, tenant) => {
  try {
    const customApiKey = getSendCredential(tenant);
    const isEnabled = tenant?.whatsappSettings?.isEnabled;

    if (!isEnabled || !customApiKey) return false;

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return false;

    const salonName = tenant?.salonName || "الصالون";
    const slug = tenant?.slug || "";
    const bookingLink = slug ? `https://www.miqass.app/${slug}` : 'رابط الصالون';

    const message = renderTemplate(tenant, 'retention', {
      اسم_الصالون: salonName, اسم_العميل: customerName, رابط_الحجز: bookingLink,
    });

    await postText(tenant, customApiKey, { to: formattedPhone, text: message });

    console.log(
      `✅ تم إرسال رسالة إعادة الاستهداف للعميل ${customerName} - صالون ${salonName}`,
    );
    return true;
  } catch (error) {
    handleWhatsAppError("رسالة إعادة الاستهداف", error);
    return false;
  }
};

const sendCampaignMessage = async (phone, messageText, tenant, options = {}) => {
  const customApiKey = getSendCredential(tenant);
  const isEnabled = tenant?.whatsappSettings?.isEnabled;

  if (!isEnabled || !customApiKey) {
    return {
      success: false,
      retryable: false,
      uncertain: false,
      errorMessage: "خدمة واتساب غير مفعلة أو مفتاح الربط غير متوفر.",
    };
  }

  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) {
    return {
      success: false,
      retryable: false,
      uncertain: false,
      errorMessage: "رقم الجوال غير صالح للإرسال.",
    };
  }

  try {
    const response = await postText(
      tenant,
      customApiKey,
      { to: formattedPhone, text: messageText },
      { clientMessageId: options.clientMessageId },
    );

    if (isWhatsiTenant(tenant)) {
      const queued = response.data?.data || {};
      const whatsiStatus = normalizeWhatsiMessageStatus(queued.status) || { code: 1, status: "pending" };
      return {
        success: true,
        providerMessageId: String(queued.id || ""),
        providerStatus: whatsiStatus.status,
        providerStatusCode: whatsiStatus.code,
      };
    }

    if (response.data?.success === false) {
      return {
        success: false,
        retryable: false,
        uncertain: false,
        errorMessage: response.data?.message || "رفض مزود واتساب الرسالة.",
      };
    }

    const providerStatus = normalizeWasenderMessageStatus(
      response.data?.data?.status || response.data?.status,
      1,
    );

    return {
      success: true,
      providerMessageId: String(
        response.data?.data?.msgId || response.data?.msgId || "",
      ),
      providerStatus: providerStatus?.status || "pending",
      providerStatusCode: providerStatus?.code ?? 1,
    };
  } catch (error) {
    handleWhatsAppError("رسالة الحملة التسويقية", error);
    const status = error.response?.status;
    const isRateLimited = status === 429;
    const isConnectionRejected = ["ENOTFOUND", "ECONNREFUSED"].includes(
      error.code,
    );
    const isUncertain =
      error.code === "ECONNABORTED" ||
      status === 408 ||
      (typeof status === "number" && status >= 500) ||
      (!error.response && !isConnectionRejected);

    return {
      success: false,
      retryable: isRateLimited || isConnectionRejected,
      uncertain: isUncertain,
      retryAfterSeconds: Number(
        error.response?.headers?.["retry-after"] ||
          error.response?.data?.retry_after ||
          0,
      ),
      errorMessage:
        error.response?.data?.message || error.message || "فشل إرسال الرسالة.",
    };
  }
};

const sendBookingAccessCode = async (phone, code, tenant) => {
  const apiKey = getSendCredential(tenant);
  const formattedPhone = formatPhoneNumber(phone);
  if (!tenant?.whatsappSettings?.isEnabled || !apiKey || !formattedPhone) return false;

  try {
    await postText(tenant, apiKey, {
        to: formattedPhone,
        text: `رمز عرض وإدارة مواعيدك لدى ${tenant.salonName}: ${code}\nصالح لمدة 5 دقائق. لا تشاركه مع أحد.`,
      });
    return true;
  } catch (error) {
    handleWhatsAppError("رمز إدارة المواعيد", error);
    return false;
  }
};

const sendRescheduleMessage = async (phone, childName, date, time, barberName, tenant) => {
  const apiKey = getSendCredential(tenant);
  const formattedPhone = formatPhoneNumber(phone);
  if (!tenant?.whatsappSettings?.isEnabled || !apiKey || !formattedPhone) return false;
  try {
    await postText(tenant, apiKey, {
        to: formattedPhone,
        text: `تم تعديل موعد ${childName} لدى ${tenant.salonName}.\nالموعد الجديد: ${date} الساعة ${formatTimeForMessage(time)}\nالموظف: ${barberName}`,
      });
    return true;
  } catch (error) {
    handleWhatsAppError("تعديل الموعد", error);
    return false;
  }
};

const getCampaignMessageInfo = async (providerMessageId, tenant) => {
  const normalizedMessageId = String(providerMessageId ?? "").trim();
  if (isWhatsiTenant(tenant)) {
    const whatsiKey = getSendCredential(tenant);
    if (!whatsiKey || !normalizedMessageId) return null;
    try {
      const message = await getWhatsiMessage(whatsiKey, normalizedMessageId);
      const providerStatus = normalizeWhatsiMessageStatus(message.status);
      if (!providerStatus) return null;
      return {
        providerStatus,
        providerWhatsappMessageId: String(message.waMessageId || "").trim(),
      };
    } catch (error) {
      if (error.response?.status !== 404) {
        console.warn(`تعذر مزامنة حالة رسالة Whatsi ${normalizedMessageId}:`, error.response?.status || error.message);
      }
      return null;
    }
  }
  const customApiKey = getTenantApiKey(tenant);
  if (!customApiKey || !normalizedMessageId) return null;

  try {
    const response = await axios.get(
      `${WASENDER_API_BASE_URL}/api/messages/${encodeURIComponent(normalizedMessageId)}/info`,
      {
        headers: { Authorization: `Bearer ${customApiKey}` },
        timeout: 8000,
      },
    );
    const data = response.data?.data || {};
    const providerStatus = normalizeWasenderMessageStatus(data.status);
    if (!providerStatus) return null;

    return {
      providerStatus,
      providerWhatsappMessageId: String(data.key?.id || data.id || "").trim(),
    };
  } catch (error) {
    if (error.response?.status !== 404) {
      console.warn(
        `تعذر مزامنة حالة رسالة WaSender ${normalizedMessageId}:`,
        error.response?.status || error.message,
      );
    }
    return null;
  }
};

const getWhatsAppStatus = () => ({ status: "API_ACTIVE", qr: "" });

module.exports = {
  isWhatsappReady,
  sendWhatsAppMessage,
  sendBookingAccessCode,
  sendRescheduleMessage,
  sendCancellationMessage,
  sendReminderMessage,
  getWhatsAppStatus,
  sendReviewRequestMessage,
  sendLoyaltyRewardMessage,
  sendRetentionMessage,
  sendCampaignMessage,
  getCampaignMessageInfo,
};
