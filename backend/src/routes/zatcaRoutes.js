const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي
const zatcaController = require("../controllers/zatcaController");
const { protect } = require("../middlewares/authMiddleware");

// ==========================================
// 🛡️ حراس بوابات الزكاة (ZATCA Shields)
// ==========================================

// 1. درع الربط (Onboarding Shield) - صارم جداً
// يسمح بمحاولتين فقط كل 15 دقيقة (لأن العملية حساسة وتتضمن توليد مفاتيح OpenSSL)
const onboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2,
  message: {
    message:
      "لقد قمت بعدة محاولات للربط. يرجى الانتظار 15 دقيقة لضمان سلامة الشهادات الرقمية 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. درع فحص الحالة والمزامنة (General ZATCA Limiter)
// يسمح بـ 20 طلب كل 15 دقيقة (كافية جداً لإدارة الإعدادات الضريبية)
const generalZatcaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "تجاوزت الحد المسموح من الطلبات، يرجى المحاولة لاحقاً." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================================================
// 🛣️ مسارات الزكاة (كلها محمية بميدل وير protect)
// ======================================================

// 🚀 تطبيق الدرع الصارم على عملية الربط وإصدار الشهادات
router.post("/onboard", protect, onboardLimiter, zatcaController.onboardZatca);

// تطبيق الدرع العام على باقي العمليات
router.use(generalZatcaLimiter);

router.get("/status", protect, zatcaController.checkZatcaStatus);
router.patch("/sync", protect, zatcaController.syncTenantZatcaInfo);
router.delete("/disconnect", protect, zatcaController.disconnectZatca);

module.exports = router;
