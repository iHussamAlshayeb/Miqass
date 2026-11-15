// خدمة whatsapp-service المستقلة: ترسل رسائل واتساب وتشغّل مهامها المجدولة
// (التذكيرات، "اشتقنالك"، الحملات ومتابعتها، وطابور الرسائل) بعيداً عن خادم الموقع.
//
// تعمل فقط في وضع الطابور (WHATSAPP_DELIVERY=queue). في الوضع الافتراضي inline
// يبقى الإرسال في الخادم كما كان، والخدمة في وضع الاستعداد لا ترسل شيئاً،
// حتى لا تتكرر أي رسالة أبداً.
require("dotenv").config();
process.env.MIQASS_ROLE = "whatsapp";

const http = require("http");
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const WhatsAppMessage = require("./src/models/WhatsAppMessage");
const { startWhatsappJobs, stopCronJobs, dispatchWhatsappQueue } = require("./src/utils/cronJobs");
const { shouldRunWhatsappJobs, isQueueMode } = require("./src/services/whatsappOutbox");
const { createShutdown } = require("./src/utils/shutdown");

const PORT = Number(process.env.WHATSAPP_SERVICE_PORT || 5100);
const state = { active: false, startedAt: new Date(), lastDispatchAt: null, sentSinceStart: 0, changeStream: false };
let shutdown = null;
let kickTimer = null;
let kickAgain = false;
let kicking = false;

/** إرسال فوري عند وصول رسالة جديدة للطابور (لرموز الدخول خصوصاً)، بدل انتظار الدورة التالية */
const kick = () => {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(async () => {
    if (kicking) { kickAgain = true; return; }
    kicking = true;
    try {
      do {
        kickAgain = false;
        // eslint-disable-next-line no-await-in-loop
        state.sentSinceStart += await dispatchWhatsappQueue();
        state.lastDispatchAt = new Date();
      } while (kickAgain);
    } finally {
      kicking = false;
    }
  }, 300);
};

const watchQueue = () => {
  try {
    const stream = WhatsAppMessage.watch([{ $match: { operationType: "insert", "fullDocument.status": "queued" } }]);
    stream.on("change", kick);
    stream.on("error", (error) => {
      state.changeStream = false;
      console.warn("⚠️ توقفت متابعة الطابور الفورية، الإرسال مستمر كل 10 ثوانٍ:", error.message);
      setTimeout(watchQueue, 30000);
    });
    state.changeStream = true;
  } catch (error) {
    console.warn("⚠️ المتابعة الفورية غير متاحة، الإرسال كل 10 ثوانٍ:", error.message);
  }
};

const health = async () => {
  const [queued, oldest, failedLastHour] = await Promise.all([
    WhatsAppMessage.countDocuments({ status: "queued" }),
    WhatsAppMessage.findOne({ status: "queued" }).sort({ createdAt: 1 }).select("createdAt").lean(),
    WhatsAppMessage.countDocuments({ status: "failed", updatedAt: { $gte: new Date(Date.now() - 3600000) } }),
  ]);
  return {
    service: "whatsapp-service",
    mode: isQueueMode() ? "queue" : "inline",
    active: state.active,
    database: mongoose.connection.readyState === 1,
    instantPickup: state.changeStream,
    queued,
    oldestQueuedSeconds: oldest ? Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 1000) : 0,
    failedLastHour,
    sentSinceStart: state.sentSinceStart,
    lastDispatchAt: state.lastDispatchAt,
    startedAt: state.startedAt,
  };
};

const start = async () => {
  console.log("⏳ whatsapp-service: الاتصال بقاعدة البيانات...");
  await connectDB();
  console.log("✅ whatsapp-service: تم الاتصال بـ MongoDB.");

  const jobsAllowed = process.env.DISABLE_CRON_JOBS !== "true";
  state.active = jobsAllowed && shouldRunWhatsappJobs();
  if (state.active) {
    startWhatsappJobs();
    watchQueue();
    kick();
    console.log("📨 whatsapp-service تعمل: هي من ترسل رسائل واتساب الآن (وضع الطابور).");
  } else {
    console.log(jobsAllowed
      ? "💤 whatsapp-service في وضع الاستعداد: الإرسال ما زال في الخادم. للتبديل أضف MIQASS_WHATSAPP_DELIVERY=queue في Miqass.env ثم أعد تشغيل app وwhatsapp."
      : "⏸️ whatsapp-service متوقفة عبر DISABLE_CRON_JOBS.");
  }

  const server = http.createServer(async (req, res) => {
    if (req.url !== "/health") { res.writeHead(404).end(); return; }
    try {
      const body = await health();
      res.writeHead(body.database ? 200 : 503, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    } catch (error) {
      res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
    }
  });
  server.listen(PORT, () => console.log(`🩺 whatsapp-service: فحص الحالة على المنفذ ${PORT}/health`));

  shutdown = createShutdown({
    server,
    stopCronJobs: state.active ? stopCronJobs : null,
    mongoose,
    timeoutMs: 25000,
  });
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
  process.on("SIGINT", () => shutdown("SIGINT", 0));
};

process.on("unhandledRejection", (reason) => {
  console.error("🛑 whatsapp-service Unhandled Rejection:", reason instanceof Error ? reason.stack : reason);
});
process.on("uncaughtException", (error) => {
  console.error("⚠️ whatsapp-service Uncaught Exception:", error.stack || error);
  if (shutdown) shutdown("uncaughtException", 1);
  else process.exit(1);
});

start().catch((error) => {
  console.error("❌ فشل تشغيل whatsapp-service:", error);
  process.exit(1);
});
