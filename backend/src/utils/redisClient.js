const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    keepAlive: 10000,

    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("❌ فشل Redis في إعادة الاتصال بعد 10 محاولات.");
        return new Error("Redis maximum retries reached");
      }
      return Math.min(retries * 100, 3000);
    },

    pingInterval: 60000,
  },
});

redisClient.on("error", (err) => {
  if (err.message.includes("Socket closed unexpectedly")) {
    console.warn("⚠️ Redis Socket closed. Attempting to reconnect...");
  } else {
    console.error("❌ Redis Error:", err);
  }
});

redisClient.on("connect", () => console.log("🚀 Redis Connected!"));

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
