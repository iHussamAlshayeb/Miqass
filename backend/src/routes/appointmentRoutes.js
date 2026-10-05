const express = require("express");
const router = express.Router();
const rateLimit = require("../middlewares/rateLimit");

const { getWhatsAppStatus } = require("../utils/whatsapp");
const { getTenantReviews } = require("../controllers/reviewController");
const { protect } = require("../middlewares/authMiddleware");
const {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  getLiveQueue,
  blockTimeSlot,
  sendCustomerAccessCode,
  verifyCustomerAccessCode,
  getCustomerAppointments,
  getCustomerProfile,
  cancelCustomerAppointment,
  rescheduleCustomerAppointment,
} = require("../controllers/bookingController");

const {
  moyasarWebhook,
  getInvoiceData,
} = require("../controllers/paymentController");

const {
  getCustomerLoyalty,
  getBarberSettings,
  updateBarberSettings,
  updateWhatsappSettings,
  getAllUpcomingAppointments,
  getAppointmentHistory,
  resendSingleWhatsApp,
  updateWhatsappTemplates,
  getTenantCustomers,
  exportTenantCustomers,
  getBroadcastAudienceCounts,
  getBroadcastCampaigns,
  pauseBroadcastCampaign,
  cancelBroadcastCampaign,
  updateBroadcastCampaign,
  resumeBroadcastCampaign,
  sendBroadcastTest,
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

const barberActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: "طلبات كثيرة، انتظر دقيقة 🛑" },
});

const queueLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
});

const broadcastTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: "تم إرسال عدة اختبارات. انتظر 15 دقيقة قبل المحاولة مجدداً.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const customerAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

const loyaltyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "محاولات كثيرة، حاول بعد قليل." },
});

const customerActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/available", getAvailableSlots);
router.post("/book", bookingLimiter, createAppointment);
router.post("/customer/send-code", customerAccessLimiter, sendCustomerAccessCode);
router.post("/customer/verify-code", customerAccessLimiter, verifyCustomerAccessCode);
router.get("/customer/appointments", customerActionLimiter, getCustomerAppointments);
router.get("/customer/profile", customerActionLimiter, getCustomerProfile);
router.post("/customer/appointments/:appointmentId/cancel", customerActionLimiter, cancelCustomerAppointment);
router.post("/customer/appointments/:appointmentId/reschedule", customerActionLimiter, rescheduleCustomerAppointment);
router.get("/loyalty/:tenantId/:phone", loyaltyLimiter, getCustomerLoyalty);

router.get("/live-queue/:slug", queueLimiter, getLiveQueue);
router.post("/barber-portal/queue", barberLimiter, getBarberQueue);
router.put("/barber-portal/status/:appointmentId", barberActionLimiter, barberUpdateStatus);
router.post("/webhook/moyasar", moyasarWebhook);

// 🔒 Middleware الحماية (الراوتس التي تلي هذا السطر تتطلب Token)
router.use(protect);

router.get("/settings", getBarberSettings);
router.put("/settings", updateBarberSettings);
router.put("/settings/whatsapp", updateWhatsappSettings);
router.put("/settings/whatsapp/templates", updateWhatsappTemplates);

router.get("/whatsapp-status", (req, res) => {
  res.json(getWhatsAppStatus());
});

router.get("/barber", getBarberAppointments);
router.get("/all-upcoming", getAllUpcomingAppointments);
router.get("/history", getAppointmentHistory);
router.put("/status/:appointmentId", updateAppointmentStatus);
router.put("/cancel/:appointmentId", cancelAppointment);
router.post("/block", blockTimeSlot);
router.post("/resend-whatsapp/:id", resendSingleWhatsApp);

router.get("/customers", getTenantCustomers);
router.get("/customers/export", exportTenantCustomers);
router.get("/reviews", getTenantReviews);
router.post("/import-customers", importCustomers);
router.get("/broadcast/audience-counts", getBroadcastAudienceCounts);
router.get("/broadcast/campaigns", getBroadcastCampaigns);
router.post("/broadcast/campaigns/:campaignId/pause", pauseBroadcastCampaign);
router.post("/broadcast/campaigns/:campaignId/cancel", cancelBroadcastCampaign);
router.patch("/broadcast/campaigns/:campaignId", updateBroadcastCampaign);
router.post("/broadcast/campaigns/:campaignId/resume", resumeBroadcastCampaign);
router.post("/broadcast/test", broadcastTestLimiter, sendBroadcastTest);
router.post("/broadcast", sendBroadcastCampaign);
router.get("/invoice/:id", getInvoiceData);

module.exports = router;
