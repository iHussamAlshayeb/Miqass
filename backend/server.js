require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { startCronJobs } = require("./src/utils/cronJobs");

const startServer = async () => {
  try {
    console.log("⏳ جاري الاتصال بقاعدة البيانات...");
    await connectDB();
    console.log("✅ تم الاتصال بـ MongoDB بنجاح.");

    startCronJobs();

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
      console.log(`🌍 بيئة التشغيل: ${process.env.NODE_ENV || "development"}`);
    });

    process.on("SIGTERM", () => {
      console.log("⚠️ تم استلام إشارة SIGTERM، جاري إغلاق السيرفر بهدوء...");
      server.close(() => {
        console.log("🏁 تم إنهاء جميع العمليات وإغلاق السيرفر بنجاح.");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("❌ فشل بدء تشغيل السيرفر:", error.message);
    process.exit(1);
  }
};

process.on("unhandledRejection", (err) => {
  console.error("🛑 خطأ غير متوقع (Unhandled Rejection):", err.message);
});

process.on("uncaughtException", (err) => {
  console.error("⚠️ خطأ برمي (Uncaught Exception):", err.message);
  process.exit(1);
});

startServer();
