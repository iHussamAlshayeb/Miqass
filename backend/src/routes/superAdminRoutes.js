const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  getAllTenants,
  updateTenantStatus,
  deleteTenant,
  impersonateTenant,
  forceDisconnectZatca,
  toggleMaintenanceMode,
  getSystemPricing,
  updateSystemPricing,
} = require("../controllers/superAdminController");

const {
  createPromoCode,
  getAllPromoCodes,
  togglePromoCode,
} = require("../controllers/promoController");

const superAdminAuth = require("../middlewares/superAdminAuth");

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    message:
      "تم إيقاف الطلبات مؤقتاً لحماية السيرفر من لوب (Loop) غير مقصود في الواجهة الأمامية 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminLimiter);
router.use(superAdminAuth);
router.get("/tenants", getAllTenants);
router.get("/promos", getAllPromoCodes);
router.get("/pricing", getSystemPricing);
router.post("/tenants/:id/impersonate", impersonateTenant);
router.post("/promos", createPromoCode);
router.put("/tenants/:id/status", updateTenantStatus);
router.put("/system-settings/maintenance", toggleMaintenanceMode);
router.put("/pricing", updateSystemPricing);
router.put("/promos/:id/toggle", togglePromoCode);
router.delete("/tenants/:id", deleteTenant);
router.delete("/tenants/:id/zatca", forceDisconnectZatca);

module.exports = router;
