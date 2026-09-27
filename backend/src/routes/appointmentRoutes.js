const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

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
  stcBankWebhook,
  getInvoiceData,
} = require("../controllers/paymentController");

const {
  getCustomerLoyalty,
  getBarberSettings,
  updateBarberSettings,
  updateWhatsappSettings,
  getAllUpcomingAppointments,
  resendSingleWhatsApp,
  getTenantCustomers,
  exportTenantCustomers,
  importCustomers,
  sendBroadcastCampaign,
} = require("../controllers/dashboardController");

const {
  getBarberAppointments,
  updateAppointmentStatus,
  getBarberQueue,
  barberUpdateStatus,
} = require("../controllers/barberController");

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: "عذراً، قمت بمحاولات حجز كثيرة. يرجى الانتظار قليلاً 🛑",
  },
});

const barberLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "محاولات دخول خاطئة كثيرة، حاول بعد 15 دقيقة 🛑" },
});

const queueLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
});

router.get("/available", getAvailableSlots);
router.post("/book", bookingLimiter, createAppointment);
router.get("/loyalty/:tenantId/:phone", getCustomerLoyalty);

router.get("/live-queue/:slug", queueLimiter, getLiveQueue);
router.post("/barber-portal/queue", barberLimiter, getBarberQueue);
router.put("/barber-portal/status/:appointmentId", barberUpdateStatus);
router.post("/webhook/moyasar", moyasarWebhook);
router.post("/webhook/stc-bank", stcBankWebhook);

// 🔒 Middleware الحماية (الراوتس التي تلي هذا السطر تتطلب Token)
router.use(protect);

router.get("/settings", getBarberSettings);
router.put("/settings", updateBarberSettings);
router.put("/settings/whatsapp", updateWhatsappSettings);

router.get("/whatsapp-status", (req, res) => {
  res.json(getWhatsAppStatus());
});

router.get("/barber", getBarberAppointments);
router.get("/all-upcoming", getAllUpcomingAppointments);
router.put("/status/:appointmentId", updateAppointmentStatus);
router.put("/cancel/:appointmentId", cancelAppointment);
router.post("/block", blockTimeSlot);
router.post("/resend-whatsapp/:id", resendSingleWhatsApp);

router.get("/customers", getTenantCustomers);
router.get("/customers/export", exportTenantCustomers);
router.get("/reviews", getTenantReviews);
router.post("/import-customers", importCustomers);
router.post("/broadcast", sendBroadcastCampaign);
router.get("/invoice/:id", getInvoiceData);

module.exports = router;
