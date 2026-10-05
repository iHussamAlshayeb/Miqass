const express = require("express");
const router = express.Router();
const rateLimit = require("../middlewares/rateLimit");
// وسيط الفوترة الإلكترونية الوحيد: Zakaty
const zatcaController = require("../controllers/zatcaController");
const { protect } = require("../middlewares/authMiddleware");

const generalZatcaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "تجاوزت الحد المسموح من الطلبات، يرجى المحاولة لاحقاً." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/zakaty/config', protect, zatcaController.getZakatyConfig);

router.use(generalZatcaLimiter);

router.put('/zakaty/config', protect, zatcaController.updateZakatyConfig);
router.delete('/zakaty/config', protect, zatcaController.disconnectZakatyConfig);
router.post('/zakaty/setup', protect, zatcaController.startAutomaticZakatySetup);
router.post('/zakaty/setup/otp', protect, zatcaController.completeAutomaticZakatySetup);
router.post('/zakaty/provision', protect, zatcaController.provisionZakatySalon);
router.post('/zakaty/issue-key', protect, zatcaController.issueZakatyKey);
router.get('/zakaty/device', protect, zatcaController.getZakatyDevice);
router.post('/zakaty/device/:step', protect, zatcaController.stepZakatyDevice);

module.exports = router;
