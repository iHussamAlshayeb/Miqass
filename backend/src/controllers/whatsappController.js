const axios = require("axios");
const crypto = require("crypto");
const Tenant = require("../models/Tenant");
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
          "whatsappSettings.sessionId": sessionId,
          "whatsappSettings.sessionStatus": "STARTING",
          "whatsappSettings.apiKey": response.data.data.api_key,
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

    res.status(200).json({ session: sessionData });
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

    if (sessionId) {
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
      { "whatsappSettings.apiKey": identifier },
    ]);
    tenantConditions.push({ "whatsappSettings.webhookSecret": signature });

    const tenant = await Tenant.findOne({ $or: tenantConditions })
      .select(
        "salonName whatsappSettings.sessionId whatsappSettings.apiKey whatsappSettings.webhookSecret",
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

module.exports = {
  createWhatsappSession,
  getWhatsappSessionData,
  disconnectWhatsappSession,
  handleWhatsappWebhook,
};
