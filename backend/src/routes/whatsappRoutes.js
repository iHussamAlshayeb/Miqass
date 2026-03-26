const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي

const { protect } = require("../middlewares/authMiddleware");

const {
  createWhatsappSession,
  getWhatsappSessionData,
  disconnectWhatsappSession,
  handleWhatsappWebhook,
} = require("../controllers/whatsappController");

// ==========================================
// 🛡️ حراس بوابات الواتساب (Rate Limiters)
// ==========================================

// 1. درع توليد الجلسات (لمنع استنزاف الـ API الخارجي)
// يسمح للصالون بـ 3 محاولات فقط كل 15 دقيقة لتوليد الباركود
const createSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: {
    message:
      "حاولت توليد الباركود عدة مرات. يرجى الانتظار 15 دقيقة ثم المحاولة 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. درع الويب هوك (لمنع هجمات الـ DDoS)
// حد سخي جداً (3000 طلب كل 15 دقيقة) لكي لا نمنع تحديثات WASender السريعة أثناء الحملات،
// ولكنه سيوقف أي هجوم إغراق (Flood Attack) خبيث.
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { message: "Too many webhook requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================================================
// 🛣️ مسارات الواتساب
// ======================================================

// 🚀 تطبيق الدرع الصارم على زر إنشاء الجلسة
router.post(
  "/create-session",
  protect,
  createSessionLimiter,
  createWhatsappSession,
);

// مسارات آمنة لا تتطلب دروعاً معقدة لأنها محمية بالـ protect
router.get("/session-data", protect, getWhatsappSessionData);
router.post("/disconnect", protect, disconnectWhatsappSession);

// 🚀 تطبيق الدرع المرن على الويب هوك المكشوف
router.post("/webhook", webhookLimiter, handleWhatsappWebhook);

module.exports = router;
