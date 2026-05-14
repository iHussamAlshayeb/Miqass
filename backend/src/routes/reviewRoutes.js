const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  getReviewPageData,
  submitReview,
} = require("../controllers/reviewController");

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 5,
  message: {
    message: "عذراً، قمت بمحاولات كثيرة جداً. يرجى المحاولة لاحقاً 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/data/:appointmentId", getReviewPageData);
router.post("/submit/:appointmentId", reviewLimiter, submitReview);

module.exports = router;
