const Review = require("../models/Review");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Customer = require("../models/Customer");
const { sendReviewNotification } = require("../utils/onesignal");

// 1. جلب بيانات الحجز لصفحة التقييم
const getReviewPageData = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // 🚀 1. فحص صاروخي: هل قيم مسبقاً؟ (استخدام exists أسرع بـ 10 مرات من findOne)
    const isReviewed = await Review.exists({ appointmentId });
    if (isReviewed) {
      return res
        .status(400)
        .json({ message: "تم تقييم هذا الحجز مسبقاً، شكراً لك!" });
    }

    // 🚀 2. جلب الحقول المطلوبة فقط باستخدام select و lean لعدم إرهاق الـ RAM
    const appointment = await Appointment.findById(appointmentId)
      .select("tenantId childName barberName status")
      .populate("tenantId", "salonName")
      .lean();

    if (!appointment)
      return res.status(404).json({ message: "الحجز غير موجود." });

    res.status(200).json({
      salonName: appointment.tenantId.salonName,
      childName: appointment.childName,
      barberName: appointment.barberName,
    });
  } catch (error) {
    res.status(500).json({ message: "خطأ في جلب البيانات" });
  }
};

// 2. استلام التقييم من العميل (أو تسجيل عدم حضوره)
const submitReview = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { rating, comment, didNotAttend } = req.body;

    // جلب الموعد وإعدادات الصالون (لجوجل ماب)
    const appointment = await Appointment.findById(appointmentId).populate(
      "tenantId",
      "settings _id",
    );
    if (!appointment)
      return res.status(404).json({ message: "الحجز غير موجود." });

    // 🛡️ حماية منطقية: لا يمكن تقييم موعد ملغي مسبقاً!
    if (appointment.status === "Cancelled") {
      return res
        .status(400)
        .json({ message: "عذراً، هذا الموعد ملغي ولا يمكن تقييمه." });
    }

    const tenant = appointment.tenantId;

    // ==========================================
    // 💡 1. إذا صرح العميل بأنه "لم يحضر"
    // ==========================================
    if (didNotAttend) {
      appointment.status = "Cancelled";
      appointment.cancelReason = "أفاد العميل بعدم الحضور من خلال رابط التقييم";
      await appointment.save();
      return res.status(200).json({ message: "تم تسجيل عدم الحضور بنجاح." });
    }

    // ==========================================
    // 💡 2. إذا حضر العميل وقام بالتقييم الفعلي
    // ==========================================
    if (appointment.status !== "Completed") {
      appointment.status = "Completed";
      await appointment.save();

      // 🚀 التحديث الذري للولاء (Atomic Update) لمنع تعارض البيانات
      if (appointment.customerId) {
        await Customer.updateOne(
          { _id: appointment.customerId },
          {
            $inc: { totalVisits: 1 },
            $set: { lastVisitDate: new Date() },
          },
        ).catch((err) => console.error("Loyalty update error:", err));
      }
    }

    // 💡 حفظ التقييم
    await Review.create({
      tenantId: tenant._id,
      appointmentId: appointment._id,
      customerId: appointment.customerId,
      barberId: appointment.barberId,
      rating: Number(rating),
      comment: comment || "",
    });

    // 🚀 إرسال الإشعار في الخلفية (Fire and Forget) لعدم تأخير استجابة العميل
    sendReviewNotification(
      appointment.childName,
      rating,
      comment,
      tenant._id,
    ).catch((e) => console.error(e));

    // ==========================================
    // 💡 3. الفلترة الذكية لجوجل ماب
    // ==========================================
    let redirectToGoogle = false;
    let googleUrl = "";

    if (
      rating >= 4 &&
      tenant.settings?.enableGoogleReviews &&
      tenant.settings?.googleReviewLink
    ) {
      redirectToGoogle = true;
      googleUrl = tenant.settings.googleReviewLink;
    }

    res.status(200).json({
      message: "تم حفظ التقييم بنجاح",
      redirectToGoogle,
      googleUrl,
    });
  } catch (error) {
    console.error("❌ حدث خطأ أثناء حفظ التقييم:", error);
    // حماية إضافية: إذا ضغط العميل مرتين بسرعة وتم إنشاء التقييم
    if (error.code === 11000)
      return res
        .status(400)
        .json({ message: "تم إرسال التقييم مسبقاً، شكراً لك!" });

    res.status(500).json({ message: "حدث خطأ أثناء حفظ التقييم" });
  }
};

// 3. جلب جميع تقييمات الصالون (للوحة التحكم CRM)
const getTenantReviews = async (req, res) => {
  try {
    // 🚀 حماية السيرفر والرام: جلب آخر 100 تقييم فقط واستخدام lean
    const limit = parseInt(req.query.limit) || 100;

    const reviews = await Review.find({ tenantId: req.tenantId })
      .populate("appointmentId", "childName barberName")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const mappedReviews = reviews.map((r) => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      reply: r.reply,
      createdAt: r.createdAt,
      customerName: r.appointmentId?.childName || "عميل",
      barberName: r.appointmentId?.barberName || "غير محدد",
    }));

    res.status(200).json(mappedReviews);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "خطأ في جلب التقييمات" });
  }
};

module.exports = { getReviewPageData, submitReview, getTenantReviews };
