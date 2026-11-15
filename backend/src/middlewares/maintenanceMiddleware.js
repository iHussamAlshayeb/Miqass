const SystemSettings = require("../models/SystemSettings");
const redisCache = require("../utils/redisCache"); // كاش لا ينتظر Redis إذا كان منقطعاً

const checkMaintenanceMode = async (req, res, next) => {
  try {
    if (
      req.path.startsWith("/api/admin") ||
      req.path === "/api/whatsapp/webhook"
    ) {
      return next();
    }

    let isMaintenanceMode = false;
    let maintenanceMessage =
      "النظام تحت الصيانة حالياً لتقديم خدمة أفضل، سنعود قريباً.";

    const cachedStatus = await redisCache.get("system_maintenance_mode");
    if (cachedStatus !== null) {
      isMaintenanceMode = cachedStatus === "true";

      if (isMaintenanceMode) {
        const cachedMessage = await redisCache.get("system_maintenance_message");
        if (cachedMessage) maintenanceMessage = cachedMessage;

        return res.status(503).json({
          isMaintenance: true,
          message: maintenanceMessage,
        });
      }

      return next();
    }

    const settings = await SystemSettings.findOne({ isGlobal: true }).lean();

    if (settings) {
      isMaintenanceMode = settings.isMaintenanceMode;
      if (settings.maintenanceMessage)
        maintenanceMessage = settings.maintenanceMessage;

      // صلاحية دقيقة: لو تغيّر الوضع وRedis منقطع، يتصحح الكاش وحده بعد عودته
      await redisCache.set("system_maintenance_mode", String(isMaintenanceMode), { EX: 60 });
      await redisCache.set("system_maintenance_message", maintenanceMessage, { EX: 60 });
    }

    if (isMaintenanceMode) {
      return res.status(503).json({
        isMaintenance: true,
        message: maintenanceMessage,
      });
    }

    next();
  } catch (error) {
    console.error("Maintenance Middleware Error:", error);
    next();
  }
};

module.exports = checkMaintenanceMode;
