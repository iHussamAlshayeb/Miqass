const { createClient } = require("redis");

// Redis هنا كاش فقط (وضع الصيانة وملفات الصالونات العامة)؛ الموقع يعمل بدونه.
// لذلك: لا نتوقف عن إعادة الاتصال أبداً، ولا ننتظر Redis في أي طلب وهو منقطع
// (انظر utils/redisCache.js)، ونطبع سطراً واحداً بدل سيل الأخطاء أثناء الانقطاع.
const { reconnectDelay } = require("./redisReconnect");

let downSince = null;
let lastErrorLogAt = 0;

const redisClient = createClient({
  url: process.env.REDIS_URL,
  // الأوامر أثناء الانقطاع تفشل فوراً بدل أن تنتظر في طابور حتى يعود الاتصال
  disableOfflineQueue: true,
  socket: {
    keepAlive: 10000,
    connectTimeout: 10000,
    reconnectStrategy: (retries) => reconnectDelay(retries),
    pingInterval: 60000,
  },
});

redisClient.on("error", (err) => {
  const now = Date.now();
  if (!downSince) {
    downSince = now;
    console.warn(`⚠️ انقطع الاتصال بـ Redis (${err.name || "Error"}: ${err.message}). الموقع يعمل من قاعدة البيانات، ومحاولة إعادة الاتصال مستمرة...`);
    lastErrorLogAt = now;
  } else if (now - lastErrorLogAt > 5 * 60 * 1000) {
    console.warn(`⚠️ Redis ما زال منقطعاً منذ ${Math.round((now - downSince) / 60000)} دقيقة (${err.message}).`);
    lastErrorLogAt = now;
  }
});

redisClient.on("ready", () => {
  if (downSince) {
    console.log(`🚀 عاد الاتصال بـ Redis بعد ${Math.round((Date.now() - downSince) / 1000)} ثانية.`);
    downSince = null;
  } else {
    console.log("🚀 Redis Connected!");
  }
});

(async () => {
  // بدون REDIS_URL (الاختبارات والتشغيل المحلي) لا نتصل أصلاً؛ الكاش يُتخطى تلقائياً
  if (!process.env.REDIS_URL) return;
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    console.error("🛑 Redis Connection Failed:", err.message);
  }
})();

module.exports = redisClient;
