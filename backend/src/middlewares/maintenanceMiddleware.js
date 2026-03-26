const SystemSettings = require("../models/SystemSettings");
const redisClient = require("../utils/redisClient"); // 🚀 استدعاء الكاش

const checkMaintenanceMode = async (req, res, next) => {
  try {
    // 💡 1. السماح لك (السوبر آدمن) بالمرور دائماً لكي تستطيع إغلاق/تشغيل الصيانة
    if (req.path.startsWith("/api/admin")) {
      return next();
    }

    let isMaintenanceMode = false;
    let maintenanceMessage =
      "النظام تحت الصيانة حالياً لتقديم خدمة أفضل، سنعود قريباً.";

    // ==========================================
    // 🚀 2. الفحص الصاروخي عبر الكاش (Redis) - استجابة في 0.1 ملي ثانية
    // ==========================================
    try {
      const cachedStatus = await redisClient.get("system_maintenance_mode");
      if (cachedStatus !== null) {
        isMaintenanceMode = cachedStatus === "true";

        if (isMaintenanceMode) {
          const cachedMessage = await redisClient.get(
            "system_maintenance_message",
          );
          if (cachedMessage) maintenanceMessage = cachedMessage;

          return res.status(503).json({
            isMaintenance: true,
            message: maintenanceMessage,
          });
        }

        // إذا كان الكاش يقول أن الصيانة (False)، نعبر فوراً بدون لمس الداتا بيس!
        return next();
      }
    } catch (cacheError) {
      // نتجاهل خطأ الكاش بصمت وننتقل للداتا بيس كخطة بديلة (Fallback)
    }

    // ==========================================
    // 🐌 3. الخطة البديلة: الاستعلام من قاعدة البيانات (إذا كان الكاش فارغاً)
    // ==========================================
    // نستخدم isGlobal: true و lean لتقليل الضغط
    const settings = await SystemSettings.findOne({ isGlobal: true }).lean();

    if (settings) {
      isMaintenanceMode = settings.isMaintenanceMode;
      if (settings.maintenanceMessage)
        maintenanceMessage = settings.maintenanceMessage;

      // 💾 حفظ النتيجة في الكاش للطلبات القادمة لتخفيف الضغط
      try {
        await redisClient.set(
          "system_maintenance_mode",
          String(isMaintenanceMode),
        );
        await redisClient.set("system_maintenance_message", maintenanceMessage);
      } catch (e) {}
    }

    // 💡 4. اتخاذ القرار النهائي
    if (isMaintenanceMode) {
      return res.status(503).json({
        isMaintenance: true,
        message: maintenanceMessage,
      });
    }

    next();
  } catch (error) {
    console.error("Maintenance Middleware Error:", error);
    next(); // في حال حدوث خطأ كارثي، لا نوقف النظام تماماً
  }
};

module.exports = checkMaintenanceMode;
