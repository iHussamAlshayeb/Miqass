const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const { getTenantBySlug } = require("../controllers/tenantController");
const { validatePromoCode } = require("../controllers/promoController");

const promoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: "تجاوزت الحد المسموح لتجربة الكوبونات، حاول بعد قليل 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const slugLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: "ضغط كبير على الرابط، يرجى تحديث الصفحة بعد قليل." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/validate-promo", promoLimiter, validatePromoCode);
router.get("/:slug", slugLimiter, getTenantBySlug);

module.exports = router;
