const SystemSettings = require("../models/SystemSettings");
const redisClient = require("../utils/redisClient"); // 🚀 استدعاء الكاش

const checkMaintenanceMode = async (req, res, next) => {
  try {
    if (req.path.startsWith("/api/admin")) {
      return next();
    }

    let isMaintenanceMode = false;
    let maintenanceMessage =
      "النظام تحت الصيانة حالياً لتقديم خدمة أفضل، سنعود قريباً.";

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

        return next();
      }
    } catch (cacheError) {}

    const settings = await SystemSettings.findOne({ isGlobal: true }).lean();

    if (settings) {
      isMaintenanceMode = settings.isMaintenanceMode;
      if (settings.maintenanceMessage)
        maintenanceMessage = settings.maintenanceMessage;

      try {
        await redisClient.set(
          "system_maintenance_mode",
          String(isMaintenanceMode),
        );
        await redisClient.set("system_maintenance_message", maintenanceMessage);
      } catch (e) {}
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
