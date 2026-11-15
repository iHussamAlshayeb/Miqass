const { getMaintenanceState } = require("../services/maintenanceState");

const checkMaintenanceMode = async (req, res, next) => {
  try {
    if (
      req.path.startsWith("/api/admin") ||
      req.path === "/api/whatsapp/webhook"
    ) {
      return next();
    }

    const { isMaintenanceMode, message } = await getMaintenanceState();
    if (isMaintenanceMode) {
      return res.status(503).json({
        isMaintenance: true,
        message,
      });
    }

    next();
  } catch (error) {
    console.error("Maintenance Middleware Error:", error.message);
    next();
  }
};

module.exports = checkMaintenanceMode;
