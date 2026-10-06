// الحجز العام والكشك: الأوقات المتاحة وإنشاء الموعد
const Appointment = require("../../models/Appointment");
const Tenant = require("../../models/Tenant");
const Customer = require("../../models/Customer");
const Barber = require("../../models/Barber");
const Service = require("../../models/Service");
const mongoose = require("mongoose");
const { sendWhatsAppMessage } = require("../../utils/whatsapp");
const { sendAdminNotification } = require("../../utils/onesignal");
const { isBarberOnLeave } = require("../../utils/barberLeave");
const {
  createBookingPaymentSession,
  getEnabledProvider,
  isOnlinePaymentConfigured,
  toMoney,
} = require("../../services/paymentGatewayService");
const {
  BOOKING_SOURCE_KIOSK_WALK_IN,
  WALK_IN_BARBER_NAME,
  generateTimeSlots,
  getNextTimeSlot,
  getKsaNow,
  isKioskBookingSource,
  isKioskWalkInBookingSource,
  formatKsaDate,
  formatWalkInTimeSlot,
  isSlotBookableByTime,
  isSlotDuringBreak,
  normalizeSelectedServiceIds,
} = require("./helpers");
const { hasActiveKioskAccess } = require("./kioskController");

// 1. إنشاء موعد جديد
const createAppointment = async (req, res) => {
  try {
    await Appointment.init();
    const {
      tenantId,
      date,
      timeSlot,
      customerPhone,
      childrenNames,
      chair,
      selectedServices,
      bookingSource,
    } = req.body;
    const isWalkInBooking = isKioskWalkInBookingSource(bookingSource);
    const effectiveDate = isWalkInBooking ? formatKsaDate() : date;

    if (
      !tenantId ||
      !customerPhone ||
      !childrenNames ||
      childrenNames.length === 0 ||
      (!isWalkInBooking && (!date || !timeSlot || !chair))
    ) {
      return res
        .status(400)
        .json({ message: "الرجاء إكمال جميع بيانات الحجز" });
    }

    const tenant = await Tenant.findById(tenantId)
      .select("settings subscription paymentSettings deletedAt kioskTokenVersion")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    // الكشك خدمة داخلية: حجوزاته (الحلاقة المباشرة والحجز المتأخر) تتطلب جهازاً مفعّلاً من لوحة التحكم
    if (
      (isWalkInBooking || isKioskBookingSource(bookingSource)) &&
      !hasActiveKioskAccess(req, tenant)
    ) {
      return res.status(403).json({
        message: "هذا الجهاز غير مفعّل ككشك لهذا الصالون.",
        code: "KIOSK_NOT_ACTIVATED",
      });
    }
    if (tenant.deletedAt || tenant.subscription?.status !== "Active") {
      return res.status(403).json({ message: "الصالون غير متاح للحجز حالياً." });
    }

    const start = tenant.settings?.startTime || "16:00";
    if (
      !isWalkInBooking &&
      !isSlotBookableByTime({
        date,
        timeSlot,
        startTime: start,
        bookingSource,
      })
    ) {
      return res.status(400).json({
        message:
          "عذراً، انتهت مهلة حجز هذا الوقت. يمكن الحجز بعد بداية الموعد بعشر دقائق فقط من بوابة الكشك داخل الصالون.",
      });
    }

    // فحص الباقة المجانية
    if (tenant.subscription?.plan === "Free") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const currentMonthBookings = await Appointment.countDocuments({
        tenantId: tenant._id,
        createdAt: { $gte: startOfMonth },
      });
      if (currentMonthBookings >= 150) {
        return res.status(403).json({
          message:
            "عذراً، الصالون وصل للحد الأقصى المجاني من الحجوزات لهذا الشهر.",
          limitReached: true,
        });
      }
    }

    // تجهيز العميل
    let customer = await Customer.findOne({
      tenantId: tenant._id,
      phone: customerPhone,
    });
    if (!customer) {
      customer = await Customer.create({
        tenantId: tenant._id,
        phone: customerPhone,
        children: childrenNames,
      });
    } else {
      const newChildren = childrenNames.filter(
        (name) => !customer.children.includes(name),
      );
      if (newChildren.length > 0) {
        await Customer.updateOne(
          { _id: customer._id },
          { $push: { children: { $each: newChildren } } },
        );
      }
    }

    // تجهيز الحلاق: الحلاقة المباشرة تُسجل باسم الحلاق المختار من الكشك،
    // ولا تُستخدم التسمية العامة إلا إذا لم يُختر حلاق (صالون بلا طاقم مسجل)
    const walkInChair =
      isWalkInBooking && typeof chair === "string" ? chair.trim() : "";
    const effectiveChair = isWalkInBooking
      ? walkInChair || WALK_IN_BARBER_NAME
      : chair.trim();
    let barber = null;
    if (!isWalkInBooking || walkInChair) {
      barber = await Barber.findOne({
        tenantId: tenant._id,
        name: effectiveChair,
        isActive: { $ne: false },
      }).select("_id name leaves");
      if (!barber) {
        return res.status(400).json({
          message: "الحلاق المختار غير متاح للحجز.",
        });
      }
      if (isBarberOnLeave(barber, effectiveDate)) {
        return res.status(409).json({
          message: "الحلاق المختار في إجازة خلال هذا التاريخ.",
          code: "BARBER_ON_LEAVE",
        });
      }
    }

    const requestedServiceIds = isWalkInBooking
      ? []
      : normalizeSelectedServiceIds(selectedServices);
    if (
      requestedServiceIds.some((id) => !mongoose.Types.ObjectId.isValid(id))
    ) {
      return res.status(400).json({ message: "قائمة الخدمات غير صالحة." });
    }

    let selectedServicesSnapshot = [];
    if (requestedServiceIds.length > 0) {
      const servicesFromDb = await Service.find({
        _id: { $in: requestedServiceIds },
        tenantId: tenant._id,
        isActive: true,
      })
        .select("_id name price duration")
        .lean();

      if (servicesFromDb.length !== requestedServiceIds.length) {
        return res.status(400).json({
          message: "إحدى الخدمات المختارة غير متاحة لهذا الصالون.",
        });
      }

      const servicesById = new Map(
        servicesFromDb.map((service) => [String(service._id), service]),
      );

      selectedServicesSnapshot = requestedServiceIds.map((id) => {
        const service = servicesById.get(id);
        return {
          serviceId: service._id,
          name: service.name,
          price: Number(service.price) || 0,
          duration: Number(service.duration) || 0,
        };
      });
    }

    // حساب المدة والسعر من قاعدة البيانات فقط
    let totalDuration = 0;
    let totalPrice = 0;
    if (isWalkInBooking) {
      totalDuration = 0;
    } else if (selectedServicesSnapshot.length > 0) {
      selectedServicesSnapshot.forEach((srv) => {
        totalDuration += Number(srv.duration || 0);
        totalPrice += Number(srv.price || 0);
      });
    } else {
      totalDuration = tenant.settings?.slotDuration || 30;
    }

    const slotStep = tenant.settings?.slotDuration || 30;
    const slotsNeededPerPerson = Math.ceil(totalDuration / slotStep);

    let neededSlots = [];
    let currentSlot = timeSlot;
    if (!isWalkInBooking) {
      for (let i = 0; i < childrenNames.length; i++) {
        for (let j = 0; j < slotsNeededPerPerson; j++) {
          neededSlots.push(currentSlot);
          currentSlot = getNextTimeSlot(currentSlot, slotStep);
        }
      }
      const workingSlots = new Set(generateTimeSlots(start, tenant.settings?.endTime || "02:00", slotStep));
      if (tenant.settings?.closedDates?.includes(date) || neededSlots.some((slot) => !workingSlots.has(slot) || isSlotDuringBreak(date, slot, tenant.settings || {}, start))) {
        return res.status(409).json({ message: "الموعد المحدد خارج ساعات العمل أو خلال فترة إغلاق أو استراحة." });
      }
    }

    // التحقق من التعارض
    const existingAppointments = isWalkInBooking
      ? []
      : await Appointment.find({
          tenantId: tenant._id,
          date: effectiveDate,
          $or: [
            { barberId: barber._id },
            { barberId: null, barberName: barber.name },
          ],
          status: { $in: ["Pending_Payment", "Booked", "Blocked", "Completed"] },
          timeSlot: { $in: neededSlots },
        }).lean();

    if (existingAppointments.length > 0) {
      return res.status(409).json({
        message: `عذراً، الخدمات المطلوبة تحتاج لوقت أطول والفراغ المتاح لا يكفي. الرجاء اختيار وقت آخر.`,
      });
    }

    // التحقق من متطلبات الدفع
    const wantsOnlinePayment =
      !isWalkInBooking &&
      totalPrice > 0 &&
      tenant.paymentSettings?.isOnlinePaymentEnabled &&
      Number(tenant.paymentSettings?.depositAmount || 0) > 0;

    if (wantsOnlinePayment && !isOnlinePaymentConfigured(tenant.paymentSettings)) {
      return res.status(400).json({
        message:
          "إعدادات الدفع الإلكتروني غير مكتملة لدى الصالون. يرجى التواصل مع الصالون أو اختيار وقت لاحق.",
      });
    }

    const isPaymentRequired = wantsOnlinePayment;
    const appointmentStatus = isPaymentRequired ? "Pending_Payment" : "Booked";
    const paymentStatus = isPaymentRequired ? "Pending" : "Not_Required";
    const depositAmount = isPaymentRequired
      ? toMoney(Math.min(tenant.paymentSettings.depositAmount, totalPrice))
      : 0;

    const updatedTenant = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $inc: { invoiceCounter: childrenNames.length } },
      {
        returnDocument: "after",
        select:
          "invoiceCounter salonName slug ownerPhone branding taxSettings whatsappSettings settings paymentSettings",
      },
    );

    let currentInvoiceCounter =
      updatedTenant.invoiceCounter - childrenNames.length + 1;
    let startSlotForPerson = timeSlot;
    const walkInBaseTime = getKsaNow();

    // تجهيز المواعيد للحفظ
    const appointmentsToCreate = childrenNames.map((name, index) => {
      const appointmentTimeSlot = isWalkInBooking
        ? formatWalkInTimeSlot(walkInBaseTime, index)
        : startSlotForPerson;
      const appointmentData = {
        tenantId: tenant._id,
        customerId: customer._id,
        barberId: barber?._id || null,
        barberName: barber?.name || effectiveChair,
        date: effectiveDate,
        timeSlot: appointmentTimeSlot,
        childName: name,
        bookingSource: isWalkInBooking
          ? BOOKING_SOURCE_KIOSK_WALK_IN
          : bookingSource || "public",
        isWalkIn: isWalkInBooking,
        selectedServices: selectedServicesSnapshot,
        totalPrice: totalPrice,
        totalDuration: totalDuration,
        invoiceNumber: `INV-${currentInvoiceCounter++}`,
        status: appointmentStatus,
        payment: { status: paymentStatus, amount: depositAmount },
      };
      if (!isWalkInBooking) {
        for (let s = 0; s < slotsNeededPerPerson; s++) {
          startSlotForPerson = getNextTimeSlot(startSlotForPerson, slotStep);
        }
      }
      return appointmentData;
    });

    let newAppointments;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        newAppointments = await Appointment.insertMany(appointmentsToCreate, { session });
        if (isWalkInBooking || slotsNeededPerPerson <= 1) return;

        let systemCustomer = await Customer.findOne({ tenantId: tenant._id, phone: "0000000000" }).session(session).select("_id");
        if (!systemCustomer) {
          [systemCustomer] = await Customer.create([{
            tenantId: tenant._id,
            phone: "0000000000",
            parentName: "نظام الحجز التلقائي",
          }], { session });
        }

        const paddingBlocksToCreate = [];
        let paddingPointer = timeSlot;
        for (let i = 0; i < childrenNames.length; i++) {
          paddingPointer = getNextTimeSlot(paddingPointer, slotStep);
          for (let j = 1; j < slotsNeededPerPerson; j++) {
            paddingBlocksToCreate.push({
              tenantId: tenant._id,
              customerId: systemCustomer._id,
              barberId: barber._id,
              barberName: barber.name,
              date: effectiveDate,
              timeSlot: paddingPointer,
              childName: "Padding Block",
              status: "Blocked",
            });
            paddingPointer = getNextTimeSlot(paddingPointer, slotStep);
          }
        }
        await Appointment.insertMany(paddingBlocksToCreate, { session });
      });
    } finally {
      await session.endSession();
    }

    const combinedNames = childrenNames.join(" و ");

    // الاستجابة
    if (isWalkInBooking) {
      await sendAdminNotification(
        combinedNames,
        effectiveDate,
        newAppointments[0].timeSlot,
        barber?.name || WALK_IN_BARBER_NAME,
        tenantId,
        {
          dedupeKey: `appointments:${newAppointments.map((item) => item._id).join(",")}`,
        },
      );

      return res.status(201).json({
        message: "تم تسجيل الحلاقة المباشرة بنجاح.",
        walkIn: true,
        barberName: barber?.name || null,
        appointments: newAppointments,
      });
    }

    if (isPaymentRequired) {
      let paymentSession;
      try {
        const paymentAppointment = newAppointments[0].toObject
          ? newAppointments[0].toObject()
          : newAppointments[0];
        paymentAppointment.customerId = customer;
        paymentSession = await createBookingPaymentSession({
          tenant: updatedTenant,
          appointment: paymentAppointment,
          amount: depositAmount,
          req,
        });
      } catch (paymentError) {
        await Appointment.updateMany(
          { _id: { $in: newAppointments.map((appointment) => appointment._id) } },
          {
            $set: {
              status: "Cancelled",
              cancelReason: "تعذر تجهيز رابط دفع العربون",
            },
          },
        );

        return res.status(paymentError.statusCode || 502).json({
          message:
            paymentError.message ||
            "تعذر تجهيز رابط دفع العربون. يرجى التواصل مع الصالون.",
        });
      }

      return res.status(201).json({
        message: "تم حجز الموعد مؤقتاً، يرجى دفع العربون لتأكيده.",
        requiresPayment: true,
        paymentDetails: {
          provider: getEnabledProvider(updatedTenant.paymentSettings),
          amount: depositAmount,
          paymentUrl: paymentSession.paymentUrl,
          reference: paymentSession.reference,
          providerPaymentId: paymentSession.providerPaymentId,
          appointmentId: newAppointments[0]._id,
          tenantId: tenant._id,
        },
      });
    } else {
      sendWhatsAppMessage(
        customerPhone,
        combinedNames,
        effectiveDate,
        timeSlot,
        barber.name,
        updatedTenant,
      ).catch(console.error);
      await sendAdminNotification(
        combinedNames,
        effectiveDate,
        timeSlot,
        effectiveChair,
        tenantId,
        {
          dedupeKey: `appointments:${newAppointments.map((item) => item._id).join(",")}`,
        },
      );

      return res.status(201).json({
        message: "تم تأكيد الحجز بنجاح! 🎉",
        appointments: newAppointments,
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({
          message:
            "حدث تعارض، شخص آخر حجز هذا الوقت للتو! الرجاء تحديث الصفحة والمحاولة.",
        });
    }
    res
      .status(500)
      .json({ message: "حدث خطأ في الخادم، الرجاء المحاولة لاحقاً" });
  }
};

// 2. جلب الأوقات المتاحة
const getAvailableSlots = async (req, res) => {
  try {
    const { tenantId, date, chair, requestedDuration, bookingSource } =
      req.query;

    const tenant = await Tenant.findById(tenantId).select("settings kioskTokenVersion deletedAt").lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    // أوقات الكشك (بعد بداية الموعد بدقائق) لا تظهر إلا لجهاز كشك مفعّل
    const effectiveBookingSource =
      isKioskBookingSource(bookingSource) && !hasActiveKioskAccess(req, tenant)
        ? "public"
        : bookingSource;

    const settings = tenant.settings || {};
    if (settings.closedDates && settings.closedDates.includes(date)) {
      return res.status(200).json({ availableSlots: [], isClosed: true });
    }

    let barber = null;
    if (chair) {
      barber = await Barber.findOne({
        tenantId: tenant._id,
        name: chair.trim(),
        isActive: { $ne: false },
      })
        .select("_id leaves")
        .lean();

      if (!barber || isBarberOnLeave(barber, date.trim())) {
        return res.status(200).json({
          availableSlots: [],
          isBarberOnLeave: Boolean(barber),
        });
      }
    }

    const start = settings.startTime || "16:00";
    const end = settings.endTime || "02:00";
    const slotStep = settings.slotDuration || 30;
    const durationNeeded = Number(requestedDuration) || slotStep;
    const slotsNeeded = Math.ceil(durationNeeded / slotStep);
    const allWorkingSlots = generateTimeSlots(start, end, slotStep);

    const query = {
      tenantId: tenant._id,
      date: date.trim(),
      status: { $in: ["Pending_Payment", "Booked", "Blocked", "Completed"] },
    };

    if (barber) query.$or = [
      { barberId: barber._id },
      { barberId: null, barberName: chair.trim() },
    ];

    const bookedAppointments = await Appointment.find(query)
      .select("timeSlot -_id")
      .lean();
    const bookedSlots = bookedAppointments.map((app) => app.timeSlot);

    let availableSlots = [];
    for (let i = 0; i < allWorkingSlots.length; i++) {
      let isSlotValid = true;
      let checkSlot = allWorkingSlots[i];
      for (let j = 0; j < slotsNeeded; j++) {
        if (
          !allWorkingSlots.includes(checkSlot) ||
          bookedSlots.includes(checkSlot) ||
          isSlotDuringBreak(date, checkSlot, settings, start)
        ) {
          isSlotValid = false;
          break;
        }
        checkSlot = getNextTimeSlot(checkSlot, slotStep);
      }
      if (isSlotValid) availableSlots.push(allWorkingSlots[i]);
    }

    const now = getKsaNow();
    availableSlots = availableSlots.filter((slot) => {
      return isSlotBookableByTime({
        date,
        timeSlot: slot,
        startTime: start,
        bookingSource: effectiveBookingSource,
        now,
      });
    });

    res.status(200).json({ availableSlots });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ داخلي في الخادم" });
  }
};

// حالة الحجز بعد الرجوع من بوابة الدفع (عام: يُرجع الحالة والموعد فقط بلا بيانات شخصية)
const getPaymentReturnStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const slug = String(req.query.slug || "").toLowerCase();
    if (!mongoose.isValidObjectId(appointmentId) || !slug) {
      return res.status(400).json({ message: "بيانات غير صالحة" });
    }
    const tenant = await Tenant.findOne({ slug, deletedAt: null }).select("_id").lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const appointment = await Appointment.findOne({ _id: appointmentId, tenantId: tenant._id })
      .select("status date timeSlot barberName payment.status")
      .lean();
    if (!appointment) return res.status(404).json({ message: "الموعد غير موجود" });

    const state =
      appointment.status === "Booked" && appointment.payment?.status === "Paid"
        ? "confirmed"
        : appointment.status === "Pending_Payment"
          ? "pending"
          : appointment.status === "Cancelled"
            ? "cancelled"
            : "confirmed";

    return res.json({
      state,
      date: appointment.date,
      timeSlot: appointment.timeSlot,
      barberName: appointment.barberName,
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذر التحقق من حالة الدفع" });
  }
};

module.exports = {
  getPaymentReturnStatus,
  createAppointment,
  getAvailableSlots,
};
