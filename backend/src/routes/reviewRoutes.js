const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي

const {
  getReviewPageData,
  submitReview,
} = require("../controllers/reviewController");

// ==========================================
// 🛡️ حارس التقييمات (Anti-Spam Shield)
// ==========================================
// يمنع السبام: يسمح بـ 5 محاولات فقط لكل IP خلال 15 دقيقة
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 5,
  message: {
    message: "عذراً، قمت بمحاولات كثيرة جداً. يرجى المحاولة لاحقاً 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================================================
// 🛣️ المسارات التي سيستخدمها العميل (بدون تسجيل دخول)
// ======================================================

// مسار جلب البيانات (آمن وسريع)
router.get("/data/:appointmentId", getReviewPageData);

// 🚀 تطبيق الدرع على مسار الإرسال لمنع إغراق الداتا بيس
router.post("/submit/:appointmentId", reviewLimiter, submitReview);

module.exports = router;
