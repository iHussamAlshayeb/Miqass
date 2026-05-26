const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

// 💡 1. تم إضافة استدعاء موديل Appointment ودالة sendWhatsAppMessage
const Appointment = require("../models/Appointment");
const { getWhatsAppStatus, sendWhatsAppMessage } = require("../utils/whatsapp");
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
  getBarberSettings,
  updateBarberSettings,
  updateWhatsappSettings,
  getAllUpcomingAppointments,
  resendSingleWhatsApp,
  getTenantCustomers,
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

// ==========================================
// 🚨 2. بداية سكربت الطوارئ (يُحذف بعد الاستخدام)
// ==========================================
let isRecoveryRunning = false;

router.get("/run-emergency-recovery-once", async (req, res) => {
  if (isRecoveryRunning) {
    return res
      .status(400)
      .json({ message: "العملية قيد التشغيل بالفعل، الرجاء الانتظار... ⏳" });
  }

  isRecoveryRunning = true;
  res.status(200).json({
    message: "بدأت عملية إرسال الرسائل لجميع الصالونات في الخلفية بنجاح 🚀",
  });

  try {
    console.log(
      "🚀 [نظام الطوارئ الشامل]: جاري جلب المواعيد لجميع الصالونات لآخر 48 ساعة...",
    );

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const missedAppointments = await Appointment.find({
      createdAt: { $gte: fortyEightHoursAgo },
      status: { $in: ["Booked", "Completed"] },
      childName: { $ne: "Padding Block" },
    })
      .populate(
        "tenantId",
        "salonName whatsappSettings slug ownerPhone branding taxSettings settings",
      )
      .populate("customerId", "phone")
      .lean();

    if (missedAppointments.length === 0) {
      console.log("✅ [نظام الطوارئ الشامل]: لا توجد مواعيد تحتاج إرسال.");
      isRecoveryRunning = false;
      return;
    }

    console.log(
      `📦 [نظام الطوارئ الشامل]: تم العثور على ${missedAppointments.length} موعد لجميع الصالونات.`,
    );

    let sentCount = 0;

    for (let app of missedAppointments) {
      if (!app.tenantId?.whatsappSettings?.isEnabled) continue;

      const customerPhone = app.customerId?.phone;
      if (!customerPhone || customerPhone === "0000000000") continue;

      console.log(
        `✉️ جاري الإرسال لعميل صالون [${app.tenantId.salonName}] - رقم العميل: ${customerPhone}`,
      );

      try {
        await sendWhatsAppMessage(
          customerPhone,
          app.childName,
          app.date,
          app.timeSlot,
          app.barberName,
          app.tenantId,
        );
        sentCount++;
      } catch (err) {
        console.error(
          `❌ فشل الإرسال للعميل ${customerPhone} في صالون ${app.tenantId.salonName}:`,
          err.message,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    console.log(
      `🏁 [نظام الطوارئ الشامل]: انتهت العملية! تم إرسال ${sentCount} رسالة لعملاء جميع الصالونات.`,
    );
  } catch (error) {
    console.error("❌ خطأ فادح في نظام الاسترجاع:", error.message);
  } finally {
    isRecoveryRunning = false;
  }
});
// ==========================================
// 🚨 نهاية سكربت الطوارئ
// ==========================================

router.get("/available", getAvailableSlots);
router.post("/book", bookingLimiter, createAppointment);
router.put("/cancel/:appointmentId", cancelAppointment);
router.get("/loyalty/:tenantId/:phone", getCustomerLoyalty);

router.get("/live-queue/:slug", queueLimiter, getLiveQueue);
router.post("/barber-portal/queue", barberLimiter, getBarberQueue);
router.put("/barber-portal/status/:appointmentId", barberUpdateStatus);

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
router.post("/block", blockTimeSlot);
router.post("/resend-whatsapp/:id", resendSingleWhatsApp);

router.get("/customers", getTenantCustomers);
router.get("/reviews", getTenantReviews);
router.post("/import-customers", importCustomers);
router.post("/broadcast", sendBroadcastCampaign);
router.post("/webhook/moyasar", moyasarWebhook);
router.get("/invoice/:id", getInvoiceData);

module.exports = router;
