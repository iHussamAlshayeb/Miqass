const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي

const {
  registerTenant,
  loginTenant,
  verifyPaymentAndActivate,
  submitBankTransfer,
  forgotPassword,
  resetPassword,
  freeActivation, // 💡 تم إضافة الدالة المفقودة
} = require("../controllers/authController");

// ==========================================
// 🛡️ حراس البوابات (Rate Limiters)
// ==========================================

// 1. حماية تسجيل الدخول (5 محاولات فقط كل ربع ساعة لكل IP)
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

// 2. حماية استعادة كلمة المرور (3 محاولات فقط كل ساعة لمنع إزعاج الصالونات بآلاف الإيميلات)
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة واحدة
  max: 3,
  message: {
    message: "تجاوزت الحد المسموح لطلبات استعادة كلمة المرور، جرب بعد ساعة 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// 🛣️ المسارات (Routes)
// ==========================================

router.post("/register", registerTenant);

// 🛡️ تطبيق الدرع على تسجيل الدخول
router.post("/login", loginLimiter, loginTenant);

router.post("/verify-payment", verifyPaymentAndActivate);
router.post("/submit-bank-transfer", submitBankTransfer);

// 💡 إضافة مسار التفعيل المجاني الذي كان مفقوداً
router.post("/free-activation", freeActivation);

// 🛡️ تطبيق الدرع على استعادة كلمة المرور
router.post("/forgot-password", passwordLimiter, forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;
