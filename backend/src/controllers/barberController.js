const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");

const {
  sendCancellationMessage,
  sendLoyaltyRewardMessage,
} = require("../utils/whatsapp");
const { sendReviewAfterCompletion } = require("../services/reviewRequestService");
const {
  hashPin,
  signBarberToken,
  verifyBarberToken,
  verifyPin,
} = require("../utils/barberPin");

const PORTAL_TENANT_FIELDS =
  "_id settings salonName whatsappSettings slug ownerPhone";

const portalError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * مصادقة بوابة الحلاق:
 * 1) توكن البوابة في الهيدر X-Barber-Token (بعد أول دخول)، أو
 * 2) slug + اسم الحلاق + PIN (تسجيل الدخول) ويُرجَع توكن جديد.
 * كل المدخلات تُحوَّل لنصوص لمنع حقن عوامل MongoDB مثل {"$ne": null}.
 */
const authenticateBarberPortal = async (req) => {
  const portalToken = req.get("x-barber-token");

  if (portalToken) {
    let payload;
    try {
      payload = verifyBarberToken(portalToken);
    } catch (error) {
      throw portalError("انتهت جلسة البوابة، سجّل الدخول مجدداً.", 401);
    }

    const [tenant, barber] = await Promise.all([
      Tenant.findOne({ _id: payload.tenantId, deletedAt: null }).select(PORTAL_TENANT_FIELDS).lean(),
      Barber.findOne({
        _id: payload.barberId,
        tenantId: payload.tenantId,
        isActive: { $ne: false },
      })
        .select("_id name")
        .lean(),
    ]);

    if (!tenant || !barber) {
      throw portalError("انتهت جلسة البوابة، سجّل الدخول مجدداً.", 401);
    }
    return { tenant, barber, token: null };
  }

  const slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : "";
  const barberName =
    typeof req.body?.barberName === "string" ? req.body.barberName.trim() : "";
  if (!slug || !barberName) throw portalError("بيانات الدخول ناقصة", 400);

  const tenant = await Tenant.findOne({ slug, deletedAt: null })
    .select(PORTAL_TENANT_FIELDS)
    .lean();
  if (!tenant) throw portalError("الصالون غير موجود", 404);

  const barber = await Barber.findOne({
    tenantId: tenant._id,
    name: barberName,
    isActive: { $ne: false },
  })
    .select("_id name +pin")
    .lean();

  const result = barber
    ? await verifyPin(barber.pin, req.body?.pin)
    : { ok: false };
  if (!result.ok) throw portalError("رمز الدخول (PIN) غير صحيح ❌", 401);

  if (result.needsUpgrade) {
    // ترحيل تلقائي: الرمز القديم المخزن كنص صريح يُشفَّر عند أول دخول ناجح
    await Barber.updateOne(
      { _id: barber._id, pin: barber.pin },
      { $set: { pin: await hashPin(barber.pin) } },
    );
  }

  return {
    tenant,
    barber: { _id: barber._id, name: barber.name },
    token: signBarberToken({ tenantId: tenant._id, barberId: barber._id }),
  };
};

// دالة مساعدة لتجهيز الموعد لشاشات العرض
const mapAppointmentForFrontend = (app) => {
  return {
    ...(app._doc ? app._doc : app),
    customerPhone: app.customerId?.phone || "غير معروف",
    chair: app.barberName,
  };
};

// 1. جلب مواعيد الحلاقين لبناء الجدول الزمني لليوم (من لوحة التحكم المحمية)
const getBarberAppointments = async (req, res) => {
  try {
    const { date } = req.query;
    const appointments = await Appointment.find({
      tenantId: req.tenantId,
      date,
    })
      .populate("customerId", "phone parentName children")
      .lean();

    const mappedAppointments = appointments.map(mapAppointmentForFrontend);
    const sortedAppointments = mappedAppointments.sort((a, b) => {
      const getVal = (slot) => {
        const h = parseInt(slot.split(":")[0], 10);
        return h < 12 ? h + 24 : h;
      };
      return getVal(a.timeSlot) - getVal(b.timeSlot);
    });

    res.status(200).json({ appointments: sortedAppointments });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب المواعيد" });
  }
};

// 2. تحديث حالة الموعد من لوحة تحكم الإدارة (تحديث، إكمال، إلغاء)
const updateAppointmentStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status, cancelReason } = req.body;

    const validStatuses = ["Booked", "Completed", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "حالة الموعد غير صالحة" });
    }

    const updateData = { status };
    if (status === "Cancelled" && cancelReason) {
      updateData.cancelReason = cancelReason;
    }

    const updatedAppointment = await Appointment.findOne({
      _id: appointmentId,
      tenantId: req.tenantId,
    }).populate("customerId");

    if (!updatedAppointment) {
      return res.status(404).json({ message: "لم يتم العثور على الموعد" });
    }

    if (updatedAppointment.saleId && status !== "Completed") {
      return res.status(409).json({ message: "لا يمكن تغيير حالة حجز مرتبط بعملية بيع." });
    }

    const previousStatus = updatedAppointment.status;
    updatedAppointment.set(updateData);
    await updatedAppointment.save();

    let tenant;
    if (
      (status === "Cancelled" || status === "Completed") &&
      previousStatus !== status
    ) {
      tenant = await Tenant.findById(req.tenantId);

      if (status === "Cancelled") {
        sendCancellationMessage(
          updatedAppointment.customerId.phone,
          updatedAppointment.childName,
          updatedAppointment.barberName,
          tenant,
          cancelReason,
        ).catch(() => {});
      }

      if (status === "Completed" && updatedAppointment.customerId?._id) {
        await Customer.updateOne(
          { _id: updatedAppointment.customerId._id },
          { $inc: { totalVisits: 1 }, $set: { lastVisitDate: new Date() } },
        );

        if (tenant.settings?.isLoyaltyEnabled) {
          const customer = await Customer.findById(
            updatedAppointment.customerId._id,
          ).select("totalVisits phone");
          const requiredVisits = tenant.settings.loyaltyVisitsRequired || 5;

          if (
            customer.totalVisits % requiredVisits === 0 &&
            customer.totalVisits > 0
          ) {
            sendLoyaltyRewardMessage(
              customer.phone,
              updatedAppointment.childName,
              tenant,
            ).catch(() => {});
          }

        }

      }
    }

    if (
      status === "Completed" &&
      updatedAppointment.bookingSource === "kiosk_walk_in" &&
      !updatedAppointment.isReviewRequested
    ) {
      tenant ||= await Tenant.findById(req.tenantId);
      if (tenant) await sendReviewAfterCompletion(updatedAppointment, tenant);
    }

    res.status(200).json({
      message: "تم التحديث بنجاح",
      appointment: mapAppointmentForFrontend(updatedAppointment),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};

// 3. شاشة الحلاق العامة - جلب طابور الحلاق بناءً على الـ PIN والـ Slug
const getBarberQueue = async (req, res) => {
  try {
    const { tenant, barber, token } = await authenticateBarberPortal(req);

    const requestedDate =
      typeof req.body?.date === "string" ? req.body.date : "";
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : "";
    if (!targetDate) {
      const ksaDate = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
      );
      targetDate = `${ksaDate.getFullYear()}-${String(ksaDate.getMonth() + 1).padStart(2, "0")}-${String(ksaDate.getDate()).padStart(2, "0")}`;
    }

    const appointments = await Appointment.find({
      tenantId: tenant._id,
      $or: [{ barberId: barber._id }, { barberName: barber.name }],
      date: targetDate,
      status: { $ne: "Cancelled" },
    })
      .populate("customerId", "phone")
      .lean();

    const mappedAppointments = appointments.map(mapAppointmentForFrontend);

    const sortedAppointments = mappedAppointments.sort((a, b) => {
      const getVal = (slot) => {
        if (!slot) return 0;
        const [hourStr, minStr] = slot.split(":");
        const h = parseInt(hourStr, 10);
        const m = parseInt(minStr, 10) || 0;
        const adjustedHour = h < 12 ? h + 24 : h;
        return adjustedHour * 60 + m;
      };
      return getVal(a.timeSlot) - getVal(b.timeSlot);
    });

    res.status(200).json({
      appointments: sortedAppointments,
      tenantId: tenant._id,
      salonName: tenant.salonName,
      barberName: barber.name,
      requestedDate: targetDate,
      ...(token ? { token } : {}),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Queue Error:", error);
    res.status(500).json({ message: "حدث خطأ داخلي" });
  }
};

// 4. تحديث حالة الحجز مباشرة من شاشة الحلاق المفتوحة (تتطلب PIN لتأكيد الهوية)
const barberUpdateStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status, cancelReason } = req.body;

    const validStatuses = ["Booked", "Completed", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "حالة الموعد غير صالحة" });
    }

    if (!mongoose.isValidObjectId(appointmentId)) {
      return res.status(400).json({ message: "رقم الموعد غير صالح" });
    }

    const { tenant, barber } = await authenticateBarberPortal(req);

    const updateData = { status };
    if (status === "Cancelled" && typeof cancelReason === "string" && cancelReason) {
      updateData.cancelReason = cancelReason.slice(0, 200);
    }

    const updatedAppointment = await Appointment.findOne({
      _id: appointmentId,
      tenantId: tenant._id,
      $or: [{ barberId: barber._id }, { barberName: barber.name }],
    }).populate("customerId");

    if (!updatedAppointment) {
      return res.status(404).json({ message: "الموعد غير موجود" });
    }

    if (updatedAppointment.saleId && status !== "Completed") {
      return res.status(409).json({ message: "لا يمكن إلغاء حجز مرتبط بعملية بيع." });
    }

    const previousStatus = updatedAppointment.status;
    updatedAppointment.set(updateData);
    await updatedAppointment.save();

    if (status === "Completed" && previousStatus !== status) {
      await Customer.updateOne(
        { _id: updatedAppointment.customerId._id },
        { $inc: { totalVisits: 1 }, $set: { lastVisitDate: new Date() } },
      );

      if (tenant.settings?.isLoyaltyEnabled) {
        const customer = await Customer.findById(
          updatedAppointment.customerId._id,
        ).select("totalVisits phone");
        const requiredVisits = tenant.settings.loyaltyVisitsRequired || 5;

        if (
          customer.totalVisits % requiredVisits === 0 &&
          customer.totalVisits > 0
        ) {
          sendLoyaltyRewardMessage(
            customer.phone,
            updatedAppointment.childName,
            tenant,
          ).catch(() => {});
        }
      }

      await sendReviewAfterCompletion(updatedAppointment, tenant);
    }

    res.status(200).json({
      message: "تم التحديث بنجاح",
      appointment: mapAppointmentForFrontend(updatedAppointment),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};

module.exports = {
  getBarberAppointments,
  updateAppointmentStatus,
  getBarberQueue,
  barberUpdateStatus,
};
