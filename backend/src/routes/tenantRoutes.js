const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي

const { getTenantBySlug } = require("../controllers/tenantController");
const { validatePromoCode } = require("../controllers/promoController");

// ==========================================
// 🛡️ حراس البوابات (Rate Limiters)
// ==========================================

// 1. حماية الكوبونات من التخمين العشوائي (Brute-Force)
// 5 محاولات فقط كل 15 دقيقة لمنع الهاكرز من تجربة آلاف الأكواد
const promoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: "تجاوزت الحد المسموح لتجربة الكوبونات، حاول بعد قليل 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. حماية مسار الصالونات من سحب البيانات (Scraping & HTTP Floods)
// حد سخي جداً (300 طلب) للعملاء الطبيعيين، يوقف فقط البوتات العنيفة
const slugLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: "ضغط كبير على الرابط، يرجى تحديث الصفحة بعد قليل." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================================================
// 🛣️ المسارات (مرتبة أمنياً من الثابت إلى المتغير)
// ======================================================

// 🚀 1. المسارات الثابتة (Static Routes) يجب أن تكون دائماً في الأعلى
router.post("/validate-promo", promoLimiter, validatePromoCode);

// 🚀 2. المسارات المتغيرة (Dynamic Routes) توضع في قاع الملف حصراً
router.get("/:slug", slugLimiter, getTenantBySlug);

module.exports = router;
