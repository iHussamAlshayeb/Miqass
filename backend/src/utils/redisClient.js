const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    // 💡 1. الحفاظ على الاتصال حياً (Heartbeat) لمنع Upstash من إغلاقه
    keepAlive: 10000, // عشر ثوانٍ

    // 💡 2. إعادة الاتصال التلقائي عند حدوث خطأ مفاجئ
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("❌ فشل Redis في إعادة الاتصال بعد 10 محاولات.");
        return new Error("Redis maximum retries reached");
      }
      return Math.min(retries * 100, 3000); // زيادة وقت الانتظار تدريجياً
    },

    // 💡 3. منع الخطأ الذي ظهر لك عبر إرسال Ping دوري
    pingInterval: 60000, // يرسل Ping كل دقيقة
  },
});

// التعامل مع الأخطاء بصمت لكي لا ينهار السيرفر الأساسي
redisClient.on("error", (err) => {
  if (err.message.includes("Socket closed unexpectedly")) {
    console.warn("⚠️ Redis Socket closed. Attempting to reconnect...");
  } else {
    console.error("❌ Redis Error:", err);
  }
});

redisClient.on("connect", () => console.log("🚀 Redis Connected!"));

// تشغيل الاتصال
(async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    console.error("🛑 Redis Connection Failed:", err.message);
  }
})();

module.exports = redisClient;
