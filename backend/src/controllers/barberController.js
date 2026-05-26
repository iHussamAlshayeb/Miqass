const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");

const {
  sendCancellationMessage,
  sendLoyaltyRewardMessage,
  sendReviewRequestMessage,
} = require("../utils/whatsapp");

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

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      updateData,
      { returnDocument: "after" },
    ).populate("customerId");

    if (!updatedAppointment) {
      return res.status(404).json({ message: "لم يتم العثور على الموعد" });
    }

    if (status === "Cancelled" || status === "Completed") {
      const tenant = await Tenant.findById(updatedAppointment.tenantId);

      if (status === "Cancelled") {
        sendCancellationMessage(
          updatedAppointment.customerId.phone,
          updatedAppointment.childName,
          updatedAppointment.barberName,
          tenant,
          cancelReason,
        ).catch(() => {});
      }

      if (status === "Completed") {
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

          if (
            tenant.settings?.enableGoogleReviews &&
            tenant.settings?.googleReviewLink
          ) {
            sendReviewRequestMessage(
              customer.phone,
              updatedAppointment.childName,
              tenant,
              updatedAppointment._id,
            ).catch(() => {});
          }
        }
      }
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
    const { slug, barberName, pin, date } = req.body;

    const tenant = await Tenant.findOne({ slug })
      .select("_id salonName")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const barber = await Barber.findOne({
      tenantId: tenant._id,
      name: barberName,
      pin,
    })
      .select("_id name")
      .lean();

    if (!barber) {
      return res.status(401).json({ message: "رمز الدخول (PIN) غير صحيح ❌" });
    }

    let targetDate = date;
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
      requestedDate: targetDate,
    });
  } catch (error) {
    console.error("Queue Error:", error);
    res.status(500).json({ message: "حدث خطأ داخلي" });
  }
};

// 4. تحديث حالة الحجز مباشرة من شاشة الحلاق المفتوحة (تتطلب PIN لتأكيد الهوية)
const barberUpdateStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status, pin, slug, barberName } = req.body;

    const tenant = await Tenant.findOne({ slug }).select("_id settings").lean();
    const barber = await Barber.exists({
      tenantId: tenant._id,
      name: barberName,
      pin,
    });

    if (!barber) return res.status(401).json({ message: "غير مصرح" });

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { status },
      { returnDocument: "after" },
    ).populate("customerId");

    if (!updatedAppointment) {
      return res.status(404).json({ message: "الموعد غير موجود" });
    }

    if (status === "Completed") {
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

      if (
        tenant.settings?.enableGoogleReviews &&
        tenant.settings?.googleReviewLink
      ) {
        sendReviewRequestMessage(
          updatedAppointment.customerId.phone,
          updatedAppointment.childName,
          tenant,
          updatedAppointment._id,
        ).catch(() => {});
      }
    }

    res.status(200).json({
      message: "تم التحديث بنجاح",
      appointment: mapAppointmentForFrontend(updatedAppointment),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};

module.exports = {
  getBarberAppointments,
  updateAppointmentStatus,
  getBarberQueue,
  barberUpdateStatus,
};
