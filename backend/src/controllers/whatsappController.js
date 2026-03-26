const axios = require("axios");
const Tenant = require("../models/Tenant");

// 1. إنشاء جلسة واتساب جديدة (توليد الـ QR)
const createWhatsappSession = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 🚀 جلب الحقول المطلوبة فقط لتوفير الـ RAM
    const tenant = await Tenant.findById(tenantId)
      .select("slug ownerPhone")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    // 1. فلترة الرقم
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
    const validWebhookUrl = backendUrl.includes("localhost")
      ? "https://miqass.app/api/whatsapp/webhook"
      : `${backendUrl}/api/whatsapp/webhook`;

    const payload = {
      name: `Miqass_${tenant.slug}`,
      phone_number: finalPhoneNumber,
      account_protection: true,
      log_messages: true,
      read_incoming_messages: false,
      webhook_url: validWebhookUrl,
      webhook_enabled: !backendUrl.includes("localhost"),
      webhook_events: ["session.status"],
    };

    console.log("🚀 جاري إرسال الطلب لـ WASender:", payload.name);

    // 💡 الخطوة الأولى: إنشاء الجلسة
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

    // 💡 الخطوة السحرية الجديدة: إعطاء أمر "التشغيل"
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

// 2. جلب تفاصيل الجلسة (لإظهار الـ QR Code)
const getWhatsappSessionData = async (req, res) => {
  try {
    // 🚀 استخدام lean و select لتسريع قراءة حالة الجلسة
    const tenant = await Tenant.findById(req.tenantId)
      .select("whatsappSettings")
      .lean();
    const sessionId = tenant?.whatsappSettings?.sessionId;

    if (!sessionId) {
      return res
        .status(404)
        .json({ message: "لا توجد جلسة نشطة، يرجى إنشاء جلسة أولاً." });
    }

    // 1. الاستعلام المباشر من WASender
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

    // 🚀 تحديث الداتا بيس بصمت (Fire and Forget) لكي لا نؤخر إرسال الباركود للعميل!
    Tenant.updateOne(
      { _id: req.tenantId },
      { $set: { "whatsappSettings.sessionStatus": currentStatus } },
    ).catch((err) => console.error("Error updating status silently:", err));

    // 3. إذا لم يكن متصلاً، نحاول جلب الباركود
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

// 3. فصل الواتساب وإلغاء الجلسة
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

    // 🚀 تصفير الإعدادات جذرياً بضربة واحدة
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

// 4. استقبال تحديثات الحالة من WASender (Webhook)
const handleWhatsappWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const payload = req.body;

    // الرد فوراً بـ 200 لكي لا يعيد WASender إرسال الطلب
    res.status(200).json({ received: true });

    if (!payload.data || !payload.data.id) return;

    const sessionId = payload.data.id;

    // 🚀 جلب البيانات الأساسية للتحقق فقط (سريع جداً)
    const tenant = await Tenant.findOne({
      "whatsappSettings.sessionId": sessionId,
    })
      .select("salonName whatsappSettings.webhookSecret")
      .lean();

    if (!tenant) {
      console.warn(`⚠️ ويب هوك لجلسة غير معروفة: ${sessionId}`);
      return;
    }

    // التحقق من التوقيع الأمني
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

    // 💡 معالجة الأحداث والتحديث الذري للحالة لتجنب تداخل البيانات
    if (payload.event === "session.status") {
      const newStatus = payload.data.status;

      // 🚀 التحديث الذري (هذا السطر ينقذ السيرفر من أخطاء VersionError)
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
