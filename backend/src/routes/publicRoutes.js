const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي للواجهة العامة

const {
  getPlatformStats,
  getPublicPricing,
  getTopClients,
} = require("../controllers/publicController");

// ==========================================
// 🛡️ حارس البوابة العامة (Public Rate Limiter)
// ==========================================
// يسمح بـ 100 طلب لكل IP خلال 15 دقيقة (كافية جداً لأي زائر طبيعي لصفحة الهبوط)
// ويصد أي هجوم (HTTP Flood) أو بوت يحاول إغراق السيرفر بالطلبات الوهمية
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100,
  message: {
    message: "تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================================================
// 🛣️ المسارات العامة (Public Routes - لا تتطلب تسجيل دخول)
// ======================================================

// 🚀 تطبيق الدرع على جميع المسارات العامة في هذا الملف
router.use(publicLimiter);

// مسار جلب الإحصائيات: /api/public/stats
router.get("/stats", getPlatformStats);

// مسار جلب الأسعار والتخفيضات: /api/public/pricing
router.get("/pricing", getPublicPricing);
router.get("/top-clients", getTopClients);
module.exports = router;
