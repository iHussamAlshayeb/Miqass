require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { startCronJobs } = require("./src/utils/cronJobs");

// ==========================================
// 🚀 محرك تشغيل المنصة (The Engine Start)
// ==========================================
const startServer = async () => {
  try {
    // 1. الربط مع قاعدة البيانات أولاً
    console.log("⏳ جاري الاتصال بقاعدة البيانات...");
    await connectDB();
    console.log("✅ تم الاتصال بـ MongoDB بنجاح.");

    // 2. تشغيل المهام الخلفية (الكرون جوبز)
    startCronJobs();

    // 3. فتح المنفذ (Port)
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
      console.log(`🌍 بيئة التشغيل: ${process.env.NODE_ENV || "development"}`);
    });

    // ==========================================
    // 🛡️ نظام الإغلاق الآمن (Graceful Shutdown)
    // ==========================================
    // يضمن عدم ضياع بيانات العملاء عند إعادة تشغيل السيرفر
    process.on("SIGTERM", () => {
      console.log("⚠️ تم استلام إشارة SIGTERM، جاري إغلاق السيرفر بهدوء...");
      server.close(() => {
        console.log("🏁 تم إنهاء جميع العمليات وإغلاق السيرفر بنجاح.");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("❌ فشل بدء تشغيل السيرفر:", error.message);
    process.exit(1); // إغلاق العملية بكود خطأ
  }
};

// ==========================================
// 🛡️ شبكة الأمان للأخطاء غير المتوقعة
// ==========================================
process.on("unhandledRejection", (err) => {
  console.error("🛑 خطأ غير متوقع (Unhandled Rejection):", err.message);
  // نترك السيرفر يعمل ولا نقتله إلا في الحالات الحرجة جداً
});

process.on("uncaughtException", (err) => {
  console.error("⚠️ خطأ برمي (Uncaught Exception):", err.message);
  process.exit(1);
});

// إقلاع!
startServer();
