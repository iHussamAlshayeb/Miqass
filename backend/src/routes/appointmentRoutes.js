const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit"); // 🚀 الدرع الواقي

const { getWhatsAppStatus } = require("../utils/whatsapp");
const { getTenantReviews } = require("../controllers/reviewController");
const { protect } = require("../middlewares/authMiddleware");
const {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  getLiveQueue,
  blockTimeSlot,
} = require("../controllers/bookingController");

const {
  moyasarWebhook,
  getInvoiceData,
} = require("../controllers/paymentController");

const {
  getCustomerLoyalty,
  barberUpdateStatus,
  getBarberQueue,
  getBarberSettings,
  updateBarberSettings,
  updateWhatsappSettings,
  getBarberAppointments,
  getAllUpcomingAppointments,
  updateAppointmentStatus,
  resendSingleWhatsApp,
  getTenantCustomers,
  importCustomers,
  sendBroadcastCampaign,
} = require("../controllers/dashboardController");

// ==========================================
// 🛡️ حراس البوابات (Rate Limiters)
// ==========================================

// 1. حماية الحجوزات (تمنع السبام والحجوزات الوهمية)
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: "عذراً، قمت بمحاولات حجز كثيرة. يرجى الانتظار قليلاً 🛑",
  },
});

// 2. حماية بوابة الحلاقين (تمنع تخمين الـ PIN)
const barberLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "محاولات دخول خاطئة كثيرة، حاول بعد 15 دقيقة 🛑" },
});

// 3. حماية شاشة الانتظار (تمنع الإغراق من البوتات)
const queueLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // دقيقة واحدة
  max: 30, // كافية جداً للتحديث التلقائي للشاشة
});

// ======================================================
// 🌍 1. المسارات العامة (للعملاء - لا تتطلب توكن)
// ======================================================
router.get("/available", getAvailableSlots);
router.post("/book", bookingLimiter, createAppointment); // 🛡️ محمي ضد السبام
router.put("/cancel/:appointmentId", cancelAppointment);
router.get("/loyalty/:tenantId/:phone", getCustomerLoyalty);

// ======================================================
// 📺 2. مسارات شاشات الصالون (الانتظار وبوابة الحلاقين)
// ======================================================
router.get("/live-queue/:slug", queueLimiter, getLiveQueue); // 🛡️ محمي ضد الإغراق
router.post("/barber-portal/queue", barberLimiter, getBarberQueue); // 🛡️ محمي ضد تخمين الـ PIN
router.put("/barber-portal/status/:appointmentId", barberUpdateStatus);

// ======================================================
// 🔐 3. المسارات المحمية (تتطلب التوكن الإداري JWT)
// ======================================================
// نطبق حماية protect على كل ما يلي بضربة واحدة
router.use(protect);

// ⚙️ الإعدادات
router.get("/settings", getBarberSettings);
router.put("/settings", updateBarberSettings);
router.put("/settings/whatsapp", updateWhatsappSettings);

// 📱 حالة الواتساب
router.get("/whatsapp-status", (req, res) => {
  res.json(getWhatsAppStatus());
});

// 📅 إدارة المواعيد والسجلات
router.get("/barber", getBarberAppointments);
router.get("/all-upcoming", getAllUpcomingAppointments);
router.put("/status/:appointmentId", updateAppointmentStatus);
router.post("/block", blockTimeSlot);
router.post("/resend-whatsapp/:id", resendSingleWhatsApp);

// 👥 إدارة العملاء والتسويق (CRM)
router.get("/customers", getTenantCustomers);
router.get("/reviews", getTenantReviews);
router.post("/import-customers", importCustomers);
router.post("/broadcast", sendBroadcastCampaign);
router.post("/webhook/moyasar", moyasarWebhook);
// 🧾 الفوترة الإلكترونية ZATCA
router.get("/invoice/:id", getInvoiceData);

module.exports = router;
