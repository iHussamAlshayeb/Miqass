const express = require("express");
const router = express.Router();
const rateLimit = require("../middlewares/rateLimit");

const {
  registerTenant,
  loginTenant,
  verifyPaymentAndActivate,
  submitBankTransfer,
  forgotPassword,
  resetPassword,
  freeActivation,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");

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

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة
  max: 5,
  message: {
    message: "تم إنشاء عدة حسابات من نفس الجهاز. حاول مجدداً بعد ساعة 🛑",
  },
});

const resetTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "محاولات كثيرة، حاول بعد 15 دقيقة 🛑" },
});

router.post("/register", registerLimiter, registerTenant);
router.post("/login", loginLimiter, loginTenant);
router.post("/verify-payment", protect, verifyPaymentAndActivate);
router.post("/submit-bank-transfer", protect, submitBankTransfer);
router.post("/free-activation", protect, freeActivation);
router.post("/forgot-password", passwordLimiter, forgotPassword);
router.post("/reset-password/:token", resetTokenLimiter, resetPassword);

module.exports = router;
