const axios = require("axios");
const crypto = require("crypto");
const Tenant = require("../models/Tenant");
const { encrypt, decrypt, hashForLookup } = require("../utils/encryption");
const {
  WASENDER_WEBHOOK_EVENTS,
  extractWasenderEventDate,
  extractWasenderMessageIdentifiers,
  extractWasenderSessionIdentifiers,
  extractWasenderWebhookStatus,
  extractWasenderWhatsappMessageId,
} = require("../utils/wasender");
const {
  updateCampaignMessageDelivery,
} = require("../services/campaignDeliveryService");
const mongoose = require("mongoose");
const {
  WHATSI_EVENT_STATUS,
  isWhatsiApiKeyFormat,
  normalizeWhatsiNumber,
  verifyWhatsiApiKey,
  normalizeWhatsiMessageStatus,
  verifyWhatsiSignature,
} = require("../utils/whatsi");

const WHATSAPP_PROVIDERS = ["wasender", "whatsi"];

const isWasenderConfigured = () => Boolean(String(process.env.WASENDER_MASTER_TOKEN || "").trim());

const getBackendUrl = () => String(process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");

// رابط الـ Webhook الخاص بكل صالون، يُضاف في صفحة Webhooks داخل تطبيق Whatsi
const getWhatsiWebhookUrl = (tenantId) => {
  const backendUrl = getBackendUrl();
  return backendUrl ? `${backendUrl}/api/whatsapp/whatsi/webhook/${tenantId}` : "";
};

const presentWhatsiSettings = (tenant) => ({
  provider: "whatsi",
  status: String(tenant.whatsappSettings?.sessionStatus || "CONNECTED").toUpperCase(),
  from: tenant.whatsappSettings?.whatsiFrom || "",
  hasWebhookSecret: Boolean(tenant.whatsappSettings?.whatsiWebhookSecret),
  webhookUrl: getWhatsiWebhookUrl(tenant._id),
});

// الوسطاء المتاحون للربط
const getWhatsappProviders = async (req, res) => {
  res.status(200).json({
    providers: [
      { id: "wasender", name: "WaSender", available: isWasenderConfigured() },
      { id: "whatsi", name: "Whatsi", available: true },
    ],
  });
};

const WHATSI_KEY_ERRORS = {
  invalid_key: "مفتاح Whatsi غير صحيح أو ملغى. أنشئ مفتاحاً جديداً من صفحة «الربط و API» في Whatsi.",
  account_inactive: "حساب Whatsi موقوف. تواصل مع إدارة Whatsi.",
  unreachable: "تعذر الوصول إلى Whatsi للتحقق من المفتاح، حاول بعد قليل.",
};

// ربط Whatsi بمفتاح API الخاص بالصالون (أو تحديث رقم الإرسال وسر الـ Webhook)
const saveWhatsiSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("_id whatsappSettings.provider whatsappSettings.apiKey whatsappSettings.sessionId whatsappSettings.sessionStatus whatsappSettings.whatsiFrom whatsappSettings.whatsiWebhookSecret")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const settings = tenant.whatsappSettings || {};
    const linkedWhatsi = settings.provider === "whatsi" && Boolean(settings.apiKey);
    if (settings.provider !== "whatsi" && settings.sessionId) {
      return res.status(409).json({ message: "ألغِ ربط WaSender أولاً قبل التحويل إلى Whatsi." });
    }

    const { apiKey, fromNumber, webhookSecret } = req.body || {};
    const changes = {};

    const trimmedKey = typeof apiKey === "string" ? apiKey.trim() : "";
    if (trimmedKey) {
      if (!isWhatsiApiKeyFormat(trimmedKey)) {
        return res.status(400).json({ message: "صيغة المفتاح غير صحيحة؛ مفتاح Whatsi يبدأ بـ wg_live_." });
      }
      const check = await verifyWhatsiApiKey(trimmedKey);
      if (!check.valid) {
        return res.status(check.reason === "unreachable" ? 502 : 400).json({ message: WHATSI_KEY_ERRORS[check.reason] });
      }
      changes["whatsappSettings.apiKey"] = encrypt(trimmedKey);
      changes["whatsappSettings.apiKeyHash"] = hashForLookup(trimmedKey);
      changes["whatsappSettings.sessionStatus"] = "CONNECTED";
    } else if (!linkedWhatsi) {
      return res.status(400).json({ message: "الصق مفتاح API من تطبيق Whatsi لإتمام الربط." });
    }

    if (typeof fromNumber === "string") {
      if (fromNumber.trim()) {
        const normalized = normalizeWhatsiNumber(fromNumber);
        if (!normalized) {
          return res.status(400).json({ message: "رقم الإرسال غير صالح؛ اكتبه بالصيغة الدولية مثل 966500000001." });
        }
        changes["whatsappSettings.whatsiFrom"] = normalized;
      } else {
        changes["whatsappSettings.whatsiFrom"] = "";
      }
    }

    if (typeof webhookSecret === "string" && webhookSecret.trim()) {
      const secret = webhookSecret.trim();
      if (secret.length < 8 || secret.length > 300) {
        return res.status(400).json({ message: "سر توقيع الـ Webhook غير صالح." });
      }
      changes["whatsappSettings.whatsiWebhookSecret"] = encrypt(secret);
    }

    Object.assign(changes, {
      "whatsappSettings.provider": "whatsi",
      "whatsappSettings.isEnabled": true,
      "whatsappSettings.sessionId": null,
      "whatsappSettings.webhookSecret": null,
    });

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $set: changes },
      { returnDocument: "after", select: "_id whatsappSettings" },
    ).lean();

    return res.status(200).json({
      message: trimmedKey ? "تم ربط الواتساب عبر Whatsi بنجاح." : "تم حفظ إعدادات Whatsi.",
      session: presentWhatsiSettings(updated),
    });
  } catch (error) {
    console.error("❌ Whatsi settings error:", error.message);
    return res.status(500).json({ message: "حدث خطأ أثناء حفظ إعدادات Whatsi." });
  }
};

const createWhatsappSession = async (req, res) => {
  const requestedProvider = String(req.body?.provider || "wasender").toLowerCase();
  if (!WHATSAPP_PROVIDERS.includes(requestedProvider)) {
    return res.status(400).json({ message: "وسيط الواتساب غير معروف." });
  }
  if (requestedProvider === "whatsi") {
    return res.status(400).json({ message: "Whatsi يُربط بمفتاح API من تطبيق Whatsi، وليس برمز QR هنا." });
  }

  try {
    const tenantId = req.tenantId;

    const tenant = await Tenant.findById(tenantId)
      .select("slug ownerPhone")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    let cleanPhone = "966500000000";
    if (tenant.ownerPhone) {
      let extracted = tenant.ownerPhone.replace(/\D/g, "");
      if (extracted.startsWith("05")) {
        extracted = "966" + extracted.substring(1);
      } else if (extracted.startsWith("00966")) {
        extracted = extracted.substring(2);
      }
      if (extracted.length > 8) {
        cleanPhone = extracted;
      }
    }
    const finalPhoneNumber = "+" + cleanPhone;

    const backendUrl = String(process.env.BACKEND_URL || "")
      .trim()
      .replace(/\/+$/, "");
    if (!backendUrl) {
      return res.status(500).json({
        message: "رابط النظام العام غير مضبوط، تعذر تجهيز Webhook الواتساب.",
      });
    }
    const validWebhookUrl = `${backendUrl}/api/whatsapp/webhook`;

    const payload = {
      name: `MiqassApp_${tenant.slug}`,
      phone_number: finalPhoneNumber,
      account_protection: false,
      always_online: false,
      log_messages: true,
      read_incoming_messages: false,
      webhook_url: validWebhookUrl,
      webhook_enabled: !/(localhost|127\.0\.0\.1)/i.test(backendUrl),
      webhook_events: [...WASENDER_WEBHOOK_EVENTS],
    };

    console.log("🚀 جاري إرسال الطلب لـ WASender:", payload.name);

    const response = await axios.post(
      "https://www.wasenderapi.com/api/whatsapp-sessions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WASENDER_MASTER_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    const sessionId = response.data.data.id;

    try {
      console.log(`⚙️ جاري تشغيل محرك الواتساب للجلسة ${sessionId}...`);
      await axios.post(
        `https://www.wasenderapi.com/api/whatsapp-sessions/${sessionId}/connect`,
        {},
        {
          headers: {
            Authorization: `Bearer ${process.env.WASENDER_MASTER_TOKEN}`,
          },
        },
      );
      console.log(
        `✅ تم إرسال أمر التشغيل بنجاح! السيرفر يجهز الباركود الآن...`,
      );
    } catch (startError) {
      console.error(
        "⚠️ ملاحظة أثناء محاولة التشغيل:",
        startError.response?.data || startError.message,
      );
    }

    // 🚀 التحديث الذري (Atomic Update): أسرع ولا يتعارض مع أي عملية حفظ أخرى للصالون!
    await Tenant.updateOne(
      { _id: tenantId },
      {
        $set: {
          "whatsappSettings.provider": "wasender",
          "whatsappSettings.sessionId": sessionId,
          "whatsappSettings.sessionStatus": "STARTING",
          // المفتاح يُخزَّن مشفراً، والـ hash للبحث عنه في الـ webhook
          "whatsappSettings.apiKey": encrypt(response.data.data.api_key),
          "whatsappSettings.apiKeyHash": hashForLookup(response.data.data.api_key),
          "whatsappSettings.webhookSecret": response.data.data.webhook_secret,
          "whatsappSettings.isEnabled": true,
        },
      },
    );

    res.status(200).json({
      message: "تم إنشاء طلب الربط وبدء التشغيل بنجاح",
      session: response.data.data,
    });
  } catch (error) {
    console.error(
      "❌ WASender API Error Details:",
      error.response?.data || error.message,
    );
    res.status(500).json({ message: "حدث خطأ في الاتصال بمزود خدمة الواتساب" });
  }
};

const getWhatsappSessionData = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("whatsappSettings")
      .lean();
    if (tenant?.whatsappSettings?.provider === "whatsi") {
      if (!tenant.whatsappSettings.apiKey) {
        return res.status(404).json({ message: "لا يوجد ربط نشط." });
      }
      return res.status(200).json({ session: presentWhatsiSettings(tenant) });
    }

    const sessionId = tenant?.whatsappSettings?.sessionId;

    if (!sessionId) {
      return res
        .status(404)
        .json({ message: "لا توجد جلسة نشطة، يرجى إنشاء جلسة أولاً." });
    }

    const sessionResponse = await axios.get(
      `https://www.wasenderapi.com/api/whatsapp-sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WASENDER_MASTER_TOKEN}`,
        },
      },
    );

    let sessionData = sessionResponse.data.data;
    let currentStatus = sessionData.status
      ? sessionData.status.toUpperCase()
      : "CREATED";

    Tenant.updateOne(
      { _id: req.tenantId },
      { $set: { "whatsappSettings.sessionStatus": currentStatus } },
    ).catch((err) => console.error("Error updating status silently:", err));

    if (currentStatus !== "CONNECTED" && currentStatus !== "WORKING") {
      try {
        const qrResponse = await axios.get(
          `https://www.wasenderapi.com/api/whatsapp-sessions/${sessionId}/qrcode`,
          {
            headers: {
              Authorization: `Bearer ${process.env.WASENDER_MASTER_TOKEN}`,
            },
          },
        );

        let rawQr =
          qrResponse.data?.data?.qrCode || qrResponse.data?.data?.qr_code;

        if (typeof rawQr === "string" && rawQr.trim() !== "") {
          if (!rawQr.startsWith("http") && !rawQr.startsWith("data:image")) {
            sessionData.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(rawQr)}`;
          } else {
            sessionData.qr_code = rawQr;
          }
        }
      } catch (qrError) {
        console.log(`⏳ الباركود غير متوفر حالياً لجلسة ${sessionId}`);
      }
    }

    res.status(200).json({ session: { ...sessionData, provider: "wasender" } });
  } catch (error) {
    console.error(
      "❌ Fetch Session Error:",
      error.response?.data || error.message,
    );
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات الواتساب" });
  }
};

const disconnectWhatsappSession = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("whatsappSettings")
      .lean();
    const sessionId = tenant?.whatsappSettings?.sessionId;

    // Whatsi: الرقم يبقى مربوطاً في تطبيق Whatsi، ونحذف المفتاح من مقص فقط
    if (sessionId && tenant.whatsappSettings.provider !== "whatsi") {
      await axios
        .post(
          `https://www.wasenderapi.com/api/whatsapp-sessions/${sessionId}/disconnect`,
          {},
          {
            headers: {
              Authorization: `Bearer ${process.env.WASENDER_MASTER_TOKEN}`,
            },
          },
        )
        .catch(() =>
          console.log(
            "⚠️ ملاحظة: الجلسة قد تكون مفصولة أو غير موجودة مسبقاً في WASender",
          ),
        );
    }

    await Tenant.updateOne(
      { _id: req.tenantId },
      {
        $set: {
          "whatsappSettings.sessionId": null,
          "whatsappSettings.sessionStatus": "DISCONNECTED",
          "whatsappSettings.isEnabled": false,
          "whatsappSettings.apiKey": null,
          "whatsappSettings.apiKeyHash": null,
          "whatsappSettings.whatsiFrom": "",
          "whatsappSettings.whatsiWebhookSecret": "",
        },
      },
    );

    res.status(200).json({ message: "تم إلغاء ربط الواتساب بنجاح" });
  } catch (error) {
    console.error(
      "❌ Disconnect Error:",
      error.response?.data || error.message,
    );
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء الربط" });
  }
};

const handleWhatsappWebhook = async (req, res) => {
  try {
    const signature = String(req.headers["x-webhook-signature"] || "").trim();
    const payload = req.body || {};
    if (!signature || !payload.event) {
      return res.status(401).json({ received: false });
    }

    const sessionIdentifiers = extractWasenderSessionIdentifiers(payload);
    const tenantConditions = sessionIdentifiers.flatMap((identifier) => [
      { "whatsappSettings.sessionId": identifier },
      { "whatsappSettings.apiKeyHash": hashForLookup(identifier) },
    ]);
    tenantConditions.push({ "whatsappSettings.webhookSecret": signature });

    const tenant = await Tenant.findOne({ $or: tenantConditions })
      .select(
        "salonName whatsappSettings.sessionId whatsappSettings.webhookSecret",
      )
      .lean();

    if (!tenant) {
      console.warn("تم رفض Webhook WaSender لجلسة غير معروفة.");
      return res.status(401).json({ received: false });
    }

    const expectedSecret = tenant.whatsappSettings.webhookSecret;
    if (!safelyMatchesSecret(signature, expectedSecret)) {
      console.warn(`توقيع Webhook WaSender غير صالح: ${tenant.salonName}`);
      return res.status(401).json({ received: false });
    }

    console.log(
      `حدث جديد من WaSender للصالون [${tenant.salonName}]:`,
      payload.event,
    );

    if (payload.event === "session.status") {
      const newStatus = String(payload.data?.status || "UNKNOWN").toUpperCase();

      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { "whatsappSettings.sessionStatus": newStatus } },
      );

      console.log(`تم تحديث حالة واتساب الصالون إلى: ${newStatus}`);
    } else if (["message.sent", "messages.update"].includes(payload.event)) {
      const identifiers = extractWasenderMessageIdentifiers(payload);
      const providerStatus = extractWasenderWebhookStatus(payload);

      if (identifiers.length > 0 && providerStatus) {
        const updateResult = await updateCampaignMessageDelivery({
          tenantId: tenant._id,
          identifiers,
          whatsappMessageId: extractWasenderWhatsappMessageId(payload),
          status: providerStatus,
          eventAt: extractWasenderEventDate(payload),
        });

        if (!updateResult.matched) {
          console.log(
            `حدث ${payload.event} لا يخص رسالة حملة محفوظة للصالون ${tenant.salonName}.`,
          );
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook WaSender Error:", error.message);
    return res.status(500).json({ received: false });
  }
};

// Webhook من Whatsi: لكل صالون رابط خاص، موقّع بـ HMAC على الجسم الخام بسر الصالون
const handleWhatsiWebhook = async (req, res) => {
  try {
    const tenantId = String(req.params?.tenantId || "");
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(404).json({ received: false });
    }

    const tenant = await Tenant.findOne({ _id: tenantId, "whatsappSettings.provider": "whatsi" })
      .select("_id salonName whatsappSettings.whatsiFrom whatsappSettings.whatsiWebhookSecret")
      .lean();
    const secret = decrypt(tenant?.whatsappSettings?.whatsiWebhookSecret || "");
    const valid = Boolean(tenant) && verifyWhatsiSignature({
      rawBody: req.rawBody,
      timestamp: req.headers["x-whatsi-timestamp"],
      signature: req.headers["x-whatsi-signature"],
      secret,
    });
    if (!valid) {
      console.warn("تم رفض Webhook Whatsi بتوقيع غير صالح.");
      return res.status(401).json({ received: false });
    }

    const event = String(req.body?.event || "");
    const data = req.body?.data || {};

    if (event.startsWith("session.")) {
      // في حساب متعدد الأرقام نتابع رقم الإرسال المحدد فقط
      const salonFrom = tenant.whatsappSettings?.whatsiFrom;
      const eventNumber = String(data.phoneNumber || "").replace(/\D/g, "");
      if (salonFrom && eventNumber && eventNumber !== salonFrom) {
        return res.status(200).json({ received: true });
      }
      const status =
        event === "session.connected"
          ? "CONNECTED"
          : String(data.status || (event === "session.error" ? "ERROR" : "DISCONNECTED")).toUpperCase();
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { "whatsappSettings.sessionStatus": status } },
      );
      console.log(`حالة واتساب (Whatsi) للصالون ${tenant.salonName}: ${status}`);
    } else if (WHATSI_EVENT_STATUS[event] && data.messageId) {
      const status = normalizeWhatsiMessageStatus(WHATSI_EVENT_STATUS[event]);
      const eventAt = new Date(data.occurredAt || data.sentAt || data.failedAt || req.body?.occurredAt || Date.now());
      await updateCampaignMessageDelivery({
        tenantId: tenant._id,
        identifiers: [data.messageId],
        whatsappMessageId: data.waMessageId || null,
        status,
        eventAt: Number.isNaN(eventAt.getTime()) ? new Date() : eventAt,
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook Whatsi Error:", error.message);
    return res.status(500).json({ received: false });
  }
};

module.exports = {
  getWhatsappProviders,
  saveWhatsiSettings,
  handleWhatsiWebhook,
  createWhatsappSession,
  getWhatsappSessionData,
  disconnectWhatsappSession,
  handleWhatsappWebhook,
};
