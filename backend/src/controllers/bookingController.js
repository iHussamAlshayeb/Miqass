const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");

const {
  sendWhatsAppMessage,
  sendCancellationMessage,
} = require("../utils/whatsapp");
const { sendAdminNotification } = require("../utils/onesignal");

// ==========================================
// 🛠️ دوال مساعدة (Helpers)
// ==========================================
const mapAppointmentForFrontend = (app) => {
  return {
    ...(app._doc ? app._doc : app),
    customerPhone: app.customerId?.phone || "غير معروف",
    chair: app.barberName,
  };
};

const generateTimeSlots = (start, end, duration) => {
  const slots = [];
  const [startHour, startMin] = start.split(":").map(Number);
  const [endHour, endMin] = end.split(":").map(Number);

  let current = new Date(2000, 0, 1, startHour, startMin);
  let endTime = new Date(2000, 0, 1, endHour, endMin);

  if (endTime <= current) endTime.setDate(endTime.getDate() + 1);

  while (current < endTime) {
    const hh = String(current.getHours()).padStart(2, "0");
    const mm = String(current.getMinutes()).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
    current.setMinutes(current.getMinutes() + duration);
  }
  return slots;
};

const getNextTimeSlot = (time, durationMinutes) => {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes + durationMinutes);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

// ==========================================
// 🚀 الدوال الأساسية للكنترولر
// ==========================================

// 1. إنشاء موعد جديد
const createAppointment = async (req, res) => {
  try {
    const {
      tenantId,
      date,
      timeSlot,
      customerPhone,
      childrenNames,
      chair,
      selectedServices,
    } = req.body;

    if (
      !tenantId ||
      !date ||
      !timeSlot ||
      !customerPhone ||
      !childrenNames ||
      childrenNames.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "الرجاء إكمال جميع بيانات الحجز" });
    }

    const tenant = await Tenant.findById(tenantId)
      .select("settings subscription paymentSettings")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

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

    // تجهيز الحلاق
    let barber = await Barber.findOne({
      tenantId: tenant._id,
      name: chair,
    }).select("_id name");
    if (!barber) {
      barber = await Barber.create({
        tenantId: tenant._id,
        name: chair,
        pin: "",
      });
    }

    // حساب المدة والسعر
    let totalDuration = 0;
    let totalPrice = 0;
    if (selectedServices && selectedServices.length > 0) {
      selectedServices.forEach((srv) => {
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
    for (let i = 0; i < childrenNames.length; i++) {
      for (let j = 0; j < slotsNeededPerPerson; j++) {
        neededSlots.push(currentSlot);
        currentSlot = getNextTimeSlot(currentSlot, slotStep);
      }
    }

    // التحقق من التعارض
    const existingAppointments = await Appointment.find({
      tenantId: tenant._id,
      date: date,
      barberId: barber._id,
      status: { $in: ["Pending_Payment", "Booked", "Blocked", "Completed"] },
      timeSlot: { $in: neededSlots },
    }).lean();

    if (existingAppointments.length > 0) {
      return res.status(409).json({
        message: `عذراً، الخدمات المطلوبة تحتاج لوقت أطول والفراغ المتاح لا يكفي. الرجاء اختيار وقت آخر.`,
      });
    }

    // التحقق من متطلبات الدفع
    const isPaymentRequired =
      tenant.paymentSettings?.isOnlinePaymentEnabled &&
      tenant.paymentSettings?.depositAmount > 0;
    const appointmentStatus = isPaymentRequired ? "Pending_Payment" : "Booked";
    const paymentStatus = isPaymentRequired ? "Pending" : "Not_Required";
    const depositAmount = isPaymentRequired
      ? tenant.paymentSettings.depositAmount
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

    // تجهيز المواعيد للحفظ
    const appointmentsToCreate = childrenNames.map((name) => {
      const appointmentData = {
        tenantId: tenant._id,
        customerId: customer._id,
        barberId: barber._id,
        barberName: barber.name,
        date: date,
        timeSlot: startSlotForPerson,
        childName: name,
        selectedServices: selectedServices || [],
        totalPrice: totalPrice,
        totalDuration: totalDuration,
        invoiceNumber: `INV-${currentInvoiceCounter++}`,
        status: appointmentStatus,
        payment: { status: paymentStatus, amount: depositAmount },
      };
      for (let s = 0; s < slotsNeededPerPerson; s++) {
        startSlotForPerson = getNextTimeSlot(startSlotForPerson, slotStep);
      }
      return appointmentData;
    });

    const newAppointments = await Appointment.insertMany(appointmentsToCreate);

    // تجهيز الـ Padding Blocks
    let systemCustomer = await Customer.findOne({
      tenantId: tenant._id,
      phone: "0000000000",
    }).select("_id");
    if (!systemCustomer) {
      systemCustomer = await Customer.create({
        tenantId: tenant._id,
        phone: "0000000000",
        parentName: "نظام الحجز التلقائي",
      });
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
          date: date,
          timeSlot: paddingPointer,
          childName: "Padding Block",
          status: "Blocked",
        });
        paddingPointer = getNextTimeSlot(paddingPointer, slotStep);
      }
    }
    if (paddingBlocksToCreate.length > 0)
      await Appointment.insertMany(paddingBlocksToCreate);

    const combinedNames = childrenNames.join(" و ");

    // الاستجابة
    if (isPaymentRequired) {
      return res.status(201).json({
        message: "تم حجز الموعد مؤقتاً، يرجى دفع العربون لتأكيده.",
        requiresPayment: true,
        paymentDetails: {
          amount: depositAmount,
          publishableKey: tenant.paymentSettings.moyasarPublishableKey,
          appointmentId: newAppointments[0]._id,
          tenantId: tenant._id,
        },
      });
    } else {
      sendWhatsAppMessage(
        customerPhone,
        combinedNames,
        date,
        timeSlot,
        barber.name,
        updatedTenant,
      ).catch(console.error);
      sendAdminNotification(
        combinedNames,
        date,
        timeSlot,
        chair,
        tenantId,
      ).catch(console.error);

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
    const { tenantId, date, chair, requestedDuration } = req.query;

    const tenant = await Tenant.findById(tenantId).select("settings").lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const settings = tenant.settings || {};
    if (settings.closedDates && settings.closedDates.includes(date)) {
      return res.status(200).json({ availableSlots: [], isClosed: true });
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
      status: { $in: ["Booked", "Blocked", "Completed"] },
    };

    if (chair) query.barberName = chair.trim();

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
          bookedSlots.includes(checkSlot)
        ) {
          isSlotValid = false;
          break;
        }
        checkSlot = getNextTimeSlot(checkSlot, slotStep);
      }
      if (isSlotValid) availableSlots.push(allWorkingSlots[i]);
    }

    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const startHour = parseInt(start.split(":")[0]);
    const [year, month, day] = date.split("-").map(Number);

    availableSlots = availableSlots.filter((slot) => {
      const [slotHour, slotMin] = slot.split(":").map(Number);
      let slotTime = new Date(now);
      slotTime.setFullYear(year, month - 1, day);
      slotTime.setHours(slotHour, slotMin, 0, 0);

      if (slotHour < startHour) slotTime.setDate(slotTime.getDate() + 1);

      if (settings.breakStart && settings.breakEnd) {
        const [bStartH, bStartM] = settings.breakStart.split(":").map(Number);
        const [bEndH, bEndM] = settings.breakEnd.split(":").map(Number);

        let breakStartTime = new Date(slotTime);
        breakStartTime.setHours(bStartH, bStartM, 0, 0);
        if (bStartH < startHour)
          breakStartTime.setDate(breakStartTime.getDate() + 1);

        let breakEndTime = new Date(slotTime);
        breakEndTime.setHours(bEndH, bEndM, 0, 0);
        if (bEndH < startHour) breakEndTime.setDate(breakEndTime.getDate() + 1);

        if (slotTime >= breakStartTime && slotTime < breakEndTime) return false;
      }
      return slotTime > now;
    });

    res.status(200).json({ availableSlots });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ داخلي في الخادم" });
  }
};

// 3. إلغاء موعد (سواء من العميل أو الإدارة)
const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { cancelReason } = req.body;

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { status: "Cancelled", cancelReason: cancelReason },
      { returnDocument: "after" },
    ).populate("customerId");

    if (!updatedAppointment)
      return res.status(404).json({ message: "لم يتم العثور على الموعد" });

    // مسح الـ Padding Blocks المرتبطة
    await Appointment.deleteMany({
      tenantId: updatedAppointment.tenantId,
      barberId: updatedAppointment.barberId,
      date: updatedAppointment.date,
      childName: "Padding Block",
      status: "Blocked",
    });

    const tenant = await Tenant.findById(updatedAppointment.tenantId);

    sendCancellationMessage(
      updatedAppointment.customerId.phone,
      updatedAppointment.childName,
      updatedAppointment.barberName,
      tenant,
      cancelReason,
    ).catch(() => {});

    res.status(200).json({
      message: "تم إلغاء الموعد بنجاح",
      appointment: mapAppointmentForFrontend(updatedAppointment),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء الموعد" });
  }
};

// 4. جلب الطابور المباشر للعملاء
const getLiveQueue = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await Tenant.findOne({ slug })
      .select("_id salonName branding")
      .lean();

    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const ksaDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const today = `${ksaDate.getFullYear()}-${String(ksaDate.getMonth() + 1).padStart(2, "0")}-${String(ksaDate.getDate()).padStart(2, "0")}`;

    const [appointments, barbers] = await Promise.all([
      Appointment.find({ tenantId: tenant._id, date: today, status: "Booked" })
        .select(
          "childName timeSlot barberName status customerId totalPrice selectedServices",
        )
        .populate("customerId", "phone")
        .sort({ timeSlot: 1 })
        .lean(),
      Barber.find({ tenantId: tenant._id, isActive: true })
        .select("name")
        .lean(),
    ]);

    const formattedAppointments = appointments.map((app) => ({
      _id: app._id,
      childName: app.childName,
      timeSlot: app.timeSlot,
      chair: app.barberName,
      status: app.status,
      customerPhone: app.customerId?.phone || "غير معروف",
      totalPrice: app.totalPrice || 0,
      selectedServices: app.selectedServices || [],
    }));

    res.status(200).json({
      salonName: tenant.salonName,
      branding: tenant.branding,
      barbers: barbers.map((b) => b.name),
      appointments: formattedAppointments,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ داخلي" });
  }
};

// 5. حظر الأوقات (تم إبقاؤه هنا لأنه يستخدم مسار /block العام)
const blockTimeSlot = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { date, timeSlot } = req.body;

    const existingAppointment = await Appointment.exists({
      tenantId,
      date,
      timeSlot,
      status: { $in: ["Booked", "Blocked", "Completed"] },
    });

    if (existingAppointment)
      return res
        .status(400)
        .json({ message: "هذا الوقت محجوز أو مغلق مسبقاً" });

    let systemCustomer = await Customer.findOne({
      tenantId,
      phone: "0000000000",
    }).select("_id");
    if (!systemCustomer) {
      systemCustomer = await Customer.create({
        tenantId,
        phone: "0000000000",
        parentName: "SYSTEM",
      });
    }

    const barber = await Barber.findOne({ tenantId }).select("_id name");

    const blockedSlot = await Appointment.create({
      tenantId,
      customerId: systemCustomer._id,
      barberId: barber ? barber._id : null,
      barberName: barber ? barber.name : "SYSTEM",
      childName: "إغلاق",
      date,
      timeSlot,
      status: "Blocked",
    });

    res.status(201).json({
      message: "تم حظر الوقت بنجاح",
      appointment: mapAppointmentForFrontend(blockedSlot),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء حظر الوقت" });
  }
};

module.exports = {
  createAppointment,
  getAvailableSlots,
  cancelAppointment,
  blockTimeSlot,
  getLiveQueue,
};
