const axios = require("axios");
const Tenant = require("../models/Tenant");

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

    const backendUrl = process.env.BACKEND_URL;
    const validWebhookUrl = `${backendUrl}/api/whatsapp/webhook`;

    const payload = {
      name: `MiqassApp_${tenant.slug}`,
      phone_number: finalPhoneNumber,
      account_protection: true,
      log_messages: true,
      read_incoming_messages: false,
      webhook_url: validWebhookUrl,
      webhook_enabled: !backendUrl.includes("localhost"),
      webhook_events: ["session.status"],
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
    const signature = req.headers["x-webhook-signature"];
    const payload = req.body;

    res.status(200).json({ received: true });

    if (!payload.data || !payload.data.id) return;

    const sessionId = payload.data.id;

    const tenant = await Tenant.findOne({
      "whatsappSettings.sessionId": sessionId,
    })
      .select("salonName whatsappSettings.webhookSecret")
      .lean();

    if (!tenant) {
      console.warn(`⚠️ ويب هوك لجلسة غير معروفة: ${sessionId}`);
      return;
    }

    const expectedSecret = tenant.whatsappSettings.webhookSecret;
    if (expectedSecret && signature !== expectedSecret) {
      console.warn(
        `🛑 محاولة اختراق أو توقيع غير صالح للصالون: ${tenant.salonName}`,
      );
      return;
    }

    console.log(
      `🔔 حدث جديد من WASender للصالون [${tenant.salonName}]:`,
      payload.event,
    );

    if (payload.event === "session.status") {
      const newStatus = payload.data.status;

      await Tenant.updateOne(
        { "whatsappSettings.sessionId": sessionId },
        { $set: { "whatsappSettings.sessionStatus": newStatus } },
      );

      console.log(`✅ تم تحديث حالة واتساب الصالون إلى: ${newStatus}`);
    }
  } catch (error) {
    console.error("❌ Webhook Error:", error.message);
  }
};

module.exports = {
  createWhatsappSession,
  getWhatsappSessionData,
  disconnectWhatsappSession,
  handleWhatsappWebhook,
};
