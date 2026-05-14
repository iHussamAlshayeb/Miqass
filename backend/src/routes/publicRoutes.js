const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  getPlatformStats,
  getPublicPricing,
  getTopClients,
} = require("../controllers/publicController");

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100,
  message: {
    message: "تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(publicLimiter);
router.get("/stats", getPlatformStats);
router.get("/pricing", getPublicPricing);
router.get("/top-clients", getTopClients);
module.exports = router;
