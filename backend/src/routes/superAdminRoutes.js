const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 شبكة الأمان للمدير

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

// ==========================================
// 🛡️ شبكة الأمان (Admin Fail-Safe)
// ==========================================
// حد سخي جداً (1000 طلب) لن يزعجك كمدير،
// ولكنه سينقذ السيرفر إذا دخلت الواجهة الأمامية (React) في Infinite Loop بالخطأ!
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

// تطبيق شبكة الأمان
router.use(adminLimiter);

// 🧱 الجدار الفولاذي: أي مسار تحت هذا السطر يجب أن يمتلك المفتاح السري
router.use(superAdminAuth);

// ==========================================
// 🛣️ مسارات الصالونات وإدارة النظام
// ==========================================
router.get("/tenants", getAllTenants);
router.put("/tenants/:id/status", updateTenantStatus);
router.delete("/tenants/:id", deleteTenant);

router.post("/tenants/:id/impersonate", impersonateTenant);
router.delete("/tenants/:id/zatca", forceDisconnectZatca);

router.put("/system-settings/maintenance", toggleMaintenanceMode);

// ==========================================
// 💸 مسارات الأسعار والتخفيضات (System Settings)
// ==========================================
router.get("/pricing", getSystemPricing);
router.put("/pricing", updateSystemPricing);

// ==========================================
// 🎁 مسارات إدارة الكوبونات
// ==========================================
router.post("/promos", createPromoCode);
router.get("/promos", getAllPromoCodes);
router.put("/promos/:id/toggle", togglePromoCode);

module.exports = router;
