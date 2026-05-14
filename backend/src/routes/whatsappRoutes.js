const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { protect } = require("../middlewares/authMiddleware");

const {
  createWhatsappSession,
  getWhatsappSessionData,
  disconnectWhatsappSession,
  handleWhatsappWebhook,
} = require("../controllers/whatsappController");

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

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { message: "Too many webhook requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/create-session",
  protect,
  createSessionLimiter,
  createWhatsappSession,
);

router.get("/session-data", protect, getWhatsappSessionData);
router.post("/disconnect", protect, disconnectWhatsappSession);
router.post("/webhook", webhookLimiter, handleWhatsappWebhook);

module.exports = router;
