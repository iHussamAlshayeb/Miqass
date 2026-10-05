require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const redisClient = require("./src/utils/redisClient");
const { startCronJobs, stopCronJobs } = require("./src/utils/cronJobs");
const { runStartupMigrations } = require("./src/utils/startupMigrations");
const { createShutdown } = require("./src/utils/shutdown");

let shutdown = null;

const startServer = async () => {
  try {
    console.log("⏳ جاري الاتصال بقاعدة البيانات...");
    await connectDB();
    console.log("✅ تم الاتصال بـ MongoDB بنجاح.");

    await runStartupMigrations();

    const cronEnabled = process.env.DISABLE_CRON_JOBS !== "true";
    if (cronEnabled) {
      startCronJobs();
    } else {
      console.log("⏸️ تم تعطيل المهام المجدولة عبر DISABLE_CRON_JOBS.");
    }

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
      console.log(`🌍 بيئة التشغيل: ${process.env.NODE_ENV || "development"}`);
    });

    // Docker يمنح 30 ثانية (stop_grace_period)؛ نُنهي خلال 25
    shutdown = createShutdown({
      server,
      stopCronJobs: cronEnabled ? stopCronJobs : null,
      mongoose,
      redisClient,
      timeoutMs: 25000,
    });
    process.on("SIGTERM", () => shutdown("SIGTERM", 0));
    process.on("SIGINT", () => shutdown("SIGINT", 0));
  } catch (error) {
    console.error("❌ فشل بدء تشغيل السيرفر:", error);
    process.exit(1);
  }
};

// وعد مرفوض بلا معالجة: نسجّله كاملاً ونكمل (أغلبها مهام خلفية غير حرجة،
// وإيقاف الخادم بسببها قد يُسقط الموقع بلا داعٍ)
process.on("unhandledRejection", (reason) => {
  console.error("🛑 Unhandled Rejection:", reason instanceof Error ? reason.stack : reason);
});

// استثناء غير ممسوك: حالة البرنامج غير مضمونة، فنُغلق بشكل منظم ويعيد Docker التشغيل
process.on("uncaughtException", (error) => {
  console.error("⚠️ Uncaught Exception:", error.stack || error);
  if (shutdown) shutdown("uncaughtException", 1);
  else process.exit(1);
});

startServer();
