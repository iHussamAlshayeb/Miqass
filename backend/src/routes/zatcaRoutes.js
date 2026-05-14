const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const zatcaController = require("../controllers/zatcaController");
const { protect } = require("../middlewares/authMiddleware");

const onboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2,
  message: {
    message:
      "لقد قمت بعدة محاولات للربط. يرجى الانتظار 15 دقيقة لضمان سلامة الشهادات الرقمية 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalZatcaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "تجاوزت الحد المسموح من الطلبات، يرجى المحاولة لاحقاً." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/onboard", protect, onboardLimiter, zatcaController.onboardZatca);

router.use(generalZatcaLimiter);

router.get("/status", protect, zatcaController.checkZatcaStatus);
router.patch("/sync", protect, zatcaController.syncTenantZatcaInfo);
router.delete("/disconnect", protect, zatcaController.disconnectZatca);

module.exports = router;
