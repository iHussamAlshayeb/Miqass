const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  registerTenant,
  loginTenant,
  verifyPaymentAndActivate,
  submitBankTransfer,
  forgotPassword,
  resetPassword,
  freeActivation,
} = require("../controllers/authController");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 5,
  message: {
    message:
      "محاولات تسجيل دخول كثيرة جداً، يرجى المحاولة لاحقاً بعد 15 دقيقة 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة واحدة
  max: 3,
  message: {
    message: "تجاوزت الحد المسموح لطلبات استعادة كلمة المرور، جرب بعد ساعة 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", registerTenant);
router.post("/login", loginLimiter, loginTenant);
router.post("/verify-payment", verifyPaymentAndActivate);
router.post("/submit-bank-transfer", submitBankTransfer);
router.post("/free-activation", freeActivation);
router.post("/forgot-password", passwordLimiter, forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;
