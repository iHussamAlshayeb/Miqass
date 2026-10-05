const axios = require("axios");
const crypto = require("crypto");
const Tenant = require("../models/Tenant");
const { encrypt, hashForLookup } = require("../utils/encryption");
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
const {
  WHATSI_EVENT_STATUS,
  isWhatsiConfigured,
  createWhatsiSession,
  getWhatsiSession,
  getWhatsiQr,
  deleteWhatsiSession,
  normalizeWhatsiMessageStatus,
  normalizeWhatsiSessionStatus,
  verifyWhatsiSignature,
} = require("../utils/whatsi");

const WHATSAPP_PROVIDERS = ["wasender", "whatsi"];

const isWasenderConfigured = () => Boolean(String(process.env.WASENDER_MASTER_TOKEN || "").trim());

const describeProviderError = (error) =>
  error.response?.data?.message || error.response?.data?.error || error.message;

// الوسطاء المتاحون للربط حسب إعدادات الخادم
const getWhatsappProviders = async (req, res) => {
  res.status(200).json({
    providers: [
      { id: "wasender", name: "WaSender", available: isWasenderConfigured() },
      { id: "whatsi", name: "Whatsi", available: isWhatsiConfigured() },
    ],
  });
};

const createWhatsiSessionForTenant = async (req, res) => {
  if (!isWhatsiConfigured()) {
    return res.status(400).json({ message: "وسيط Whatsi غير مفعل على الخادم." });
  }
  const tenant = await Tenant.findById(req.tenantId).select("salonName slug").lean();
  if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

  try {
    const data = await createWhatsiSession(String(tenant._id), tenant.salonName || tenant.slug);
    const session = data.session || {};
    if (!session.id) throw new Error("Whatsi did not return a session id");

    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $set: {
          "whatsappSettings.provider": "whatsi",
          "whatsappSettings.sessionId": session.id,
          "whatsappSettings.sessionStatus": normalizeWhatsiSessionStatus(session.status),
          "whatsappSettings.isEnabled": true,
          // Whatsi يستخدم مفتاح تكامل المنصة، فلا نخزن مفتاحاً لكل صالون
          "whatsappSettings.apiKey": null,
          "whatsappSettings.apiKeyHash": null,
          "whatsappSettings.webhookSecret": null,
        },
      },
    );

    return res.status(200).json({
      message: "تم إنشاء طلب الربط عبر Whatsi",
      session: { id: session.id, status: normalizeWhatsiSessionStatus(session.status), provider: "whatsi" },
    });
  } catch (error) {
    console.error("❌ Whatsi create session error:", describeProviderError(error));
    return res.status(502).json({ message: "تعذر الاتصال بوسيط Whatsi، حاول لاحقاً." });
  }
};

const getWhatsiSessionData = async (req, res, tenant) => {
  const externalAccountId = String(tenant._id);
  try {
    const data = await getWhatsiSession(externalAccountId);
    const status = normalizeWhatsiSessionStatus(data.session?.status);
    const session = { id: data.session?.id, status, provider: "whatsi", phone_number: data.session?.phoneNumber || null };

    if (status !== "CONNECTED") {
      try {
        const qr = await getWhatsiQr(externalAccountId);
        if (qr.qrType === "DATA_URL") session.qr_code = qr.qr;
        else if (qr.qr) session.qr_raw = qr.qr;
        if (qr.status) session.status = normalizeWhatsiSessionStatus(qr.status);
      } catch (qrError) {
        console.log(`⏳ رمز Whatsi غير متوفر حالياً: ${describeProviderError(qrError)}`);
      }
    }

    Tenant.updateOne(
      { _id: tenant._id },
      { $set: { "whatsappSettings.sessionStatus": session.status } },
    ).catch((err) => console.error("Error updating status silently:", err));

    return res.status(200).json({ session });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ message: "لا توجد جلسة نشطة، يرجى إنشاء جلسة أولاً." });
    }
    console.error("❌ Whatsi session error:", describeProviderError(error));
    return res.status(502).json({ message: "حدث خطأ أثناء جلب بيانات الواتساب" });
  }
};

const safelyMatchesSecret = (receivedSecret, expectedSecret) => {
  const received = Buffer.from(String(receivedSecret || ""));
  const expected = Buffer.from(String(expectedSecret || ""));
  return (
    received.length > 0 &&
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
};

const createWhatsappSession = async (req, res) => {
  const requestedProvider = String(req.body?.provider || "wasender").toLowerCase();
  if (!WHATSAPP_PROVIDERS.includes(requestedProvider)) {
    return res.status(400).json({ message: "وسيط الواتساب غير معروف." });
  }
  if (requestedProvider === "whatsi") return createWhatsiSessionForTenant(req, res);

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
    const sessionId = tenant?.whatsappSettings?.sessionId;

    if (!sessionId) {
      return res
        .status(404)
        .json({ message: "لا توجد جلسة نشطة، يرجى إنشاء جلسة أولاً." });
    }

    if (tenant.whatsappSettings.provider === "whatsi") {
      return getWhatsiSessionData(req, res, tenant);
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

    if (sessionId && tenant.whatsappSettings.provider === "whatsi") {
      await deleteWhatsiSession(String(req.tenantId)).catch((error) =>
        console.log("⚠️ تعذر فصل جلسة Whatsi:", describeProviderError(error)),
      );
    } else if (sessionId) {
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

// Webhook من Whatsi: موقّع بـ HMAC على الجسم الخام، والصالون يُعرف من sessionId
const handleWhatsiWebhook = async (req, res) => {
  try {
    const valid = verifyWhatsiSignature({
      rawBody: req.rawBody,
      timestamp: req.headers["x-whatsi-timestamp"],
      signature: req.headers["x-whatsi-signature"],
    });
    if (!valid) {
      console.warn("تم رفض Webhook Whatsi بتوقيع غير صالح.");
      return res.status(401).json({ received: false });
    }

    const event = String(req.body?.event || "");
    const data = req.body?.data || {};
    const sessionId = String(data.sessionId || "").trim();
    if (!sessionId) return res.status(200).json({ received: true });

    const tenant = await Tenant.findOne({
      "whatsappSettings.provider": "whatsi",
      "whatsappSettings.sessionId": sessionId,
    })
      .select("_id salonName")
      .lean();
    if (!tenant) {
      // جلسة لا تخص أي صالون حالياً (مثلاً بعد فك الربط)
      return res.status(200).json({ received: true });
    }

    if (event.startsWith("session.")) {
      const status =
        event === "session.connected"
          ? "CONNECTED"
          : normalizeWhatsiSessionStatus(data.status || (event === "session.error" ? "ERROR" : "DISCONNECTED"));
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
  handleWhatsiWebhook,
  createWhatsappSession,
  getWhatsappSessionData,
  disconnectWhatsappSession,
  handleWhatsappWebhook,
};
