const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const {
  sendWhatsAppMessage,
  sendCancellationMessage,
  sendBookingAccessCode,
  sendRescheduleMessage,
} = require("../utils/whatsapp");
const { sendAdminNotification } = require("../utils/onesignal");
const { isBarberOnLeave } = require("../utils/barberLeave");
const { publicLogoUrl } = require("../utils/logoImage");
const {
  createBookingPaymentSession,
  getEnabledProvider,
  isOnlinePaymentConfigured,
  toMoney,
} = require("../services/paymentGatewayService");

// ==========================================
// 🛠️ دوال مساعدة (Helpers)
// ==========================================
const KIOSK_PAST_BOOKING_GRACE_MINUTES = 10;
const BOOKING_SOURCE_KIOSK = "kiosk";
const BOOKING_SOURCE_KIOSK_WALK_IN = "kiosk_walk_in";
const WALK_IN_BARBER_NAME = "حلاقة مباشرة";

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

const getKsaNow = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));

const buildSlotDateTime = (date, timeSlot, startTime, now = getKsaNow()) => {
  const [year, month, day] = date.split("-").map(Number);
  const [slotHour, slotMin] = timeSlot.split(":").map(Number);
  const startHour = parseInt(startTime.split(":")[0], 10);

  const slotTime = new Date(now);
  slotTime.setFullYear(year, month - 1, day);
  slotTime.setHours(slotHour, slotMin, 0, 0);

  if (slotHour < startHour) slotTime.setDate(slotTime.getDate() + 1);

  return slotTime;
};

const isKioskBookingSource = (bookingSource) =>
  bookingSource === BOOKING_SOURCE_KIOSK;

const isKioskWalkInBookingSource = (bookingSource) =>
  bookingSource === BOOKING_SOURCE_KIOSK_WALK_IN;

const formatKsaDate = (date = getKsaNow()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const isValidBookingDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
};

const formatWalkInTimeSlot = (date = getKsaNow(), offsetMs = 0) => {
  const time = new Date(date.getTime() + offsetMs);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");
  const ms = String(time.getMilliseconds()).padStart(3, "0");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${hh}:${mm}:${ss}.${ms}-${suffix}`;
};

const isSlotBookableByTime = ({
  date,
  timeSlot,
  startTime,
  bookingSource,
  now = getKsaNow(),
}) => {
  const slotTime = buildSlotDateTime(date, timeSlot, startTime, now);
  const diffMs = slotTime.getTime() - now.getTime();

  if (diffMs > 0) return true;

  if (!isKioskBookingSource(bookingSource)) return false;

  const graceMs = KIOSK_PAST_BOOKING_GRACE_MINUTES * 60 * 1000;
  return Math.abs(diffMs) <= graceMs;
};

const isSlotDuringBreak = (date, slot, settings, startTime) => {
  if (!settings.breakStart || !settings.breakEnd) return false;
  const slotTime = buildSlotDateTime(date, slot, startTime);
  const startHour = Number(startTime.split(":")[0]);
  const [breakStartHour, breakStartMinute] = settings.breakStart.split(":").map(Number);
  const [breakEndHour, breakEndMinute] = settings.breakEnd.split(":").map(Number);
  const breakStart = new Date(slotTime);
  breakStart.setHours(breakStartHour, breakStartMinute, 0, 0);
  if (breakStartHour < startHour) breakStart.setDate(breakStart.getDate() + 1);
  const breakEnd = new Date(slotTime);
  breakEnd.setHours(breakEndHour, breakEndMinute, 0, 0);
  if (breakEndHour < startHour) breakEnd.setDate(breakEnd.getDate() + 1);
  if (breakEnd <= breakStart) breakEnd.setDate(breakEnd.getDate() + 1);
  return slotTime >= breakStart && slotTime < breakEnd;
};

const normalizeSelectedServiceIds = (selectedServices = []) => {
  if (!Array.isArray(selectedServices)) return [];

  const ids = selectedServices
    .map((service) => service?.serviceId || service?._id || service?.id || service)
    .filter(Boolean)
    .map(String);

  return [...new Set(ids)];
};

const accessCodeHash = (tenantId, phone, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET)
    .update(`${tenantId}:${phone}:${code}`)
    .digest("hex");

const accessError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const getCustomerAccess = (req) => {
  const token = req.get("X-Booking-Access");
  if (!token) throw accessError("تحقق من رقم جوالك أولاً.", 401);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      audience: "customer-bookings",
    });
    if (payload.scope !== "customer-bookings") throw new Error("Invalid scope");
    return payload;
  } catch {
    throw accessError("انتهت جلسة عرض المواعيد. تحقق من رقمك مرة أخرى.", 401);
  }
};

const sendCustomerAccessCode = async (req, res) => {
  try {
    const { tenantId, phone } = req.body;
    if (!mongoose.Types.ObjectId.isValid(tenantId) || !/^05\d{8}$/.test(phone || "")) {
      return res.status(400).json({ message: "أدخل رقم جوال صحيحاً." });
    }
    const tenant = await Tenant.findById(tenantId)
      .select("salonName whatsappSettings.apiKey whatsappSettings.isEnabled")
      .lean();
    if (!tenant?.whatsappSettings?.isEnabled || !tenant.whatsappSettings.apiKey) {
      return res.status(503).json({ message: "التحقق عبر واتساب غير متاح لهذا الصالون حالياً. تواصل مع الصالون." });
    }

    const genericMessage = "إذا كان الرقم مرتبطاً بمواعيد، سيصلك رمز تحقق عبر واتساب.";
    const customer = await Customer.findOne({ tenantId, phone }).select("_id");
    if (!customer || !(await Appointment.exists({ tenantId, customerId: customer._id, status: { $ne: "Blocked" } }))) {
      return res.json({ message: genericMessage });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const hash = accessCodeHash(tenantId, phone, code);
    const now = new Date();
    const claimed = await Customer.findOneAndUpdate(
      {
        _id: customer._id,
        $or: [
          { "bookingAccess.sentAt": { $exists: false } },
          { "bookingAccess.sentAt": { $lte: new Date(now.getTime() - 60_000) } },
        ],
      },
      {
        $set: {
          "bookingAccess.codeHash": hash,
          "bookingAccess.expiresAt": new Date(now.getTime() + 5 * 60_000),
          "bookingAccess.sentAt": now,
          "bookingAccess.attempts": 0,
        },
      },
    );
    if (!claimed) return res.json({ message: genericMessage });

    const sent = await sendBookingAccessCode(phone, code, tenant);
    if (!sent) {
      await Customer.updateOne(
        { _id: customer._id, "bookingAccess.codeHash": hash },
        { $unset: { bookingAccess: "" } },
      );
      return res.status(502).json({ message: "تعذر إرسال رمز التحقق. حاول لاحقاً أو تواصل مع الصالون." });
    }
    return res.json({ message: genericMessage });
  } catch (error) {
    console.error("Booking access code error:", error);
    return res.status(500).json({ message: "تعذر تجهيز رمز التحقق." });
  }
};

const verifyCustomerAccessCode = async (req, res) => {
  try {
    const { tenantId, phone, code } = req.body;
    if (!mongoose.Types.ObjectId.isValid(tenantId) || !/^05\d{8}$/.test(phone || "") || !/^\d{6}$/.test(code || "")) {
      return res.status(400).json({ message: "بيانات التحقق غير صحيحة." });
    }
    const query = {
      tenantId, phone,
      "bookingAccess.codeHash": accessCodeHash(tenantId, phone, code),
      "bookingAccess.expiresAt": { $gt: new Date() },
      "bookingAccess.attempts": { $lt: 5 },
    };
    const customer = await Customer.findOneAndUpdate(query, { $unset: { bookingAccess: "" } });
    if (!customer) {
      await Customer.updateOne(
        { tenantId, phone, "bookingAccess.expiresAt": { $gt: new Date() }, "bookingAccess.attempts": { $lt: 5 } },
        { $inc: { "bookingAccess.attempts": 1 } },
      );
      return res.status(400).json({ message: "الرمز غير صحيح أو انتهت صلاحيته." });
    }
    const token = jwt.sign(
      { tenantId: String(customer.tenantId), customerId: String(customer._id), scope: "customer-bookings" },
      process.env.JWT_SECRET,
      { audience: "customer-bookings", expiresIn: "20m" },
    );
    return res.json({ token });
  } catch (error) {
    console.error("Booking code verification error:", error);
    return res.status(500).json({ message: "تعذر التحقق من الرمز." });
  }
};

const getCustomerAppointments = async (req, res) => {
  try {
    const access = getCustomerAccess(req);
    const appointments = await Appointment.find({
      tenantId: access.tenantId,
      customerId: access.customerId,
      bookingSource: { $ne: BOOKING_SOURCE_KIOSK_WALK_IN },
      status: { $ne: "Blocked" },
    })
      .select("date timeSlot childName barberName selectedServices totalPrice totalDuration status payment.status saleId bookingSource")
      .sort({ date: -1, timeSlot: -1 })
      .limit(50)
      .lean();
    return res.json({ appointments });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "تعذر عرض المواعيد." });
  }
};

// بيانات العميل المحفوظة (أسماء الأطفال) — تتطلب توكن التحقق برمز الجوال
const getCustomerProfile = async (req, res) => {
  try {
    const access = getCustomerAccess(req);
    const customer = await Customer.findOne({
      _id: access.customerId,
      tenantId: access.tenantId,
    })
      .select("totalVisits children")
      .lean();
    return res.json({
      visits: customer?.totalVisits || 0,
      children: customer?.children || [],
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ message: error.statusCode ? error.message : "تعذر جلب بياناتك." });
  }
};

const loadManageableAppointment = async (access, appointmentId, tenant) => {
  if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
    throw accessError("الموعد غير موجود.", 404);
  }
  const appointment = await Appointment.findOne({
    _id: appointmentId,
    tenantId: access.tenantId,
    customerId: access.customerId,
    bookingSource: { $ne: BOOKING_SOURCE_KIOSK_WALK_IN },
  });
  if (!appointment) throw accessError("الموعد غير موجود.", 404);
  if (appointment.status !== "Booked" || appointment.saleId) {
    throw accessError("لا يمكن إدارة هذا الموعد من رابط الحجز. تواصل مع الصالون.", 409);
  }
  if (buildSlotDateTime(appointment.date, appointment.timeSlot, tenant.settings?.startTime || "16:00") <= getKsaNow()) {
    throw accessError("بدأ وقت الموعد أو انتهى. تواصل مع الصالون.", 409);
  }
  return appointment;
};

const getPaddingSlots = (appointment, slotStep) => {
  const count = Math.max(1, Math.ceil((appointment.totalDuration || slotStep) / slotStep));
  const slots = [];
  let slot = appointment.timeSlot;
  for (let index = 1; index < count; index++) {
    slot = getNextTimeSlot(slot, slotStep);
    slots.push(slot);
  }
  return slots;
};

const cancelCustomerAppointment = async (req, res) => {
  try {
    const access = getCustomerAccess(req);
    const tenant = await Tenant.findById(access.tenantId);
    if (!tenant) throw accessError("الصالون غير موجود.", 404);
    const appointment = await loadManageableAppointment(access, req.params.appointmentId, tenant);
    if (appointment.payment?.status === "Paid") {
      throw accessError("إلغاء الحجز المدفوع بعربون يتم عبر الصالون حفاظاً على حقوقك المالية.", 409);
    }

    const slotStep = tenant.settings?.slotDuration || 30;
    await mongoose.connection.transaction(async (session) => {
      const changed = await Appointment.updateOne(
        { _id: appointment._id, tenantId: access.tenantId, customerId: access.customerId, status: "Booked", saleId: null, "payment.status": { $ne: "Paid" } },
        { $set: { status: "Cancelled", cancelReason: "ألغاه العميل من رابط الحجز" } },
        { session },
      );
      if (!changed.modifiedCount) throw accessError("تغيرت حالة الموعد. حدّث القائمة وحاول مرة أخرى.", 409);
      const paddingSlots = getPaddingSlots(appointment, slotStep);
      if (paddingSlots.length) {
        await Appointment.deleteMany({
          tenantId: access.tenantId,
          barberId: appointment.barberId,
          date: appointment.date,
          timeSlot: { $in: paddingSlots },
          childName: "Padding Block",
          status: "Blocked",
        }).session(session);
      }
    });

    const customer = await Customer.findById(access.customerId).select("phone").lean();
    if (customer?.phone) {
      sendCancellationMessage(customer.phone, appointment.childName, appointment.barberName, tenant, "ألغاه العميل من رابط الحجز").catch(console.error);
    }
    sendAdminNotification(appointment.childName, appointment.date, appointment.timeSlot, appointment.barberName, access.tenantId, {
      event: "cancelled",
      dedupeKey: `cancelled:${appointment._id}`,
    }).catch(console.error);
    return res.json({ message: "تم إلغاء الموعد.", appointmentId: appointment._id });
  } catch (error) {
    if (!error.statusCode) console.error("Customer cancellation error:", error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "تعذر إلغاء الموعد." });
  }
};

const rescheduleCustomerAppointment = async (req, res) => {
  try {
    const access = getCustomerAccess(req);
    const { date, timeSlot } = req.body;
    if (!isValidBookingDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeSlot || "")) {
      throw accessError("اختر تاريخاً ووقتاً صحيحين.");
    }
    const tenant = await Tenant.findById(access.tenantId);
    if (!tenant) throw accessError("الصالون غير موجود.", 404);
    const appointment = await loadManageableAppointment(access, req.params.appointmentId, tenant);
    if (!appointment.barberId) throw accessError("تواصل مع الصالون لتعديل هذا الموعد.", 409);
    if (appointment.date === date && appointment.timeSlot === timeSlot) {
      throw accessError("اختر موعداً مختلفاً عن الموعد الحالي.");
    }
    const settings = tenant.settings || {};
    const start = settings.startTime || "16:00";
    const slotStep = settings.slotDuration || 30;
    const oldPadding = getPaddingSlots(appointment, slotStep);
    const requested = { ...appointment.toObject(), date, timeSlot };
    const newPadding = getPaddingSlots(requested, slotStep);
    const requiredSlots = [timeSlot, ...newPadding];
    const workingSlots = new Set(generateTimeSlots(start, settings.endTime || "02:00", slotStep));
    if (
      !isSlotBookableByTime({ date, timeSlot, startTime: start, bookingSource: "public" }) ||
      settings.closedDates?.includes(date) ||
      (settings.maxBookingDate && date > settings.maxBookingDate.slice(0, 10)) ||
      requiredSlots.some((slot) => !workingSlots.has(slot) || isSlotDuringBreak(date, slot, settings, start))
    ) {
      throw accessError("الوقت المختار غير متاح للحجز.", 409);
    }
    const barber = await Barber.findOne({ _id: appointment.barberId, tenantId: access.tenantId, isActive: { $ne: false } }).select("leaves");
    if (!barber || isBarberOnLeave(barber, date)) throw accessError("الموظف غير متاح في هذا اليوم.", 409);

    await Appointment.init();
    await mongoose.connection.transaction(async (session) => {
      if (oldPadding.length) {
        await Appointment.deleteMany({
          tenantId: access.tenantId, barberId: appointment.barberId,
          date: appointment.date, timeSlot: { $in: oldPadding },
          childName: "Padding Block", status: "Blocked",
        }).session(session);
      }

      const changed = await Appointment.updateOne(
        { _id: appointment._id, tenantId: access.tenantId, customerId: access.customerId, status: "Booked", saleId: null, date: appointment.date, timeSlot: appointment.timeSlot },
        { $set: { date, timeSlot, isReminded: false } },
        { session },
      );
      if (!changed.modifiedCount) throw accessError("تغير الموعد أثناء التعديل. حدّث القائمة وحاول مرة أخرى.", 409);

      const occupied = await Appointment.exists({
        tenantId: access.tenantId,
        date,
        $or: [{ barberId: appointment.barberId }, { barberId: null, barberName: appointment.barberName }],
        timeSlot: { $in: requiredSlots },
        status: { $in: ["Pending_Payment", "Booked", "Blocked", "Completed"] },
        _id: { $ne: appointment._id },
      }).session(session);
      if (occupied) throw accessError("الوقت المختار حُجز للتو. اختر وقتاً آخر.", 409);

      if (newPadding.length) {
        let systemCustomer = await Customer.findOne({ tenantId: access.tenantId, phone: "0000000000" }).session(session).select("_id");
        if (!systemCustomer) {
          [systemCustomer] = await Customer.create([{ tenantId: access.tenantId, phone: "0000000000", parentName: "نظام الحجز التلقائي" }], { session });
        }
        await Appointment.insertMany(newPadding.map((slot) => ({
          tenantId: access.tenantId, customerId: systemCustomer._id,
          barberId: appointment.barberId, barberName: appointment.barberName,
          date, timeSlot: slot, childName: "Padding Block", status: "Blocked",
        })), { session });
      }
    });

    const customer = await Customer.findById(access.customerId).select("phone").lean();
    if (customer?.phone) {
      sendRescheduleMessage(customer.phone, appointment.childName, date, timeSlot, appointment.barberName, tenant).catch(console.error);
    }
    sendAdminNotification(appointment.childName, date, timeSlot, appointment.barberName, access.tenantId, {
      event: "rescheduled",
      dedupeKey: `rescheduled:${appointment._id}:${crypto.randomUUID()}`,
    }).catch(console.error);
    return res.json({ message: "تم تعديل الموعد بنجاح.", appointmentId: appointment._id });
  } catch (error) {
    if (!error.statusCode && error.code !== 11000) console.error("Customer reschedule error:", error);
    return res.status(error.statusCode || (error.code === 11000 ? 409 : 500)).json({ message: error.statusCode ? error.message : error.code === 11000 ? "الوقت المختار حُجز للتو. اختر وقتاً آخر." : "تعذر تعديل الموعد." });
  }
};

// ==========================================
// 🚀 الدوال الأساسية للكنترولر
// ==========================================

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
      .select("settings subscription paymentSettings deletedAt")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
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

    // تجهيز الحلاق
    const effectiveChair = isWalkInBooking
      ? WALK_IN_BARBER_NAME
      : chair.trim();
    let barber = null;
    if (!isWalkInBooking) {
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
        WALK_IN_BARBER_NAME,
        tenantId,
        {
          dedupeKey: `appointments:${newAppointments.map((item) => item._id).join(",")}`,
        },
      );

      return res.status(201).json({
        message: "تم تسجيل الحلاقة المباشرة بنجاح.",
        walkIn: true,
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

    const tenant = await Tenant.findById(tenantId).select("settings").lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

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
        bookingSource,
        now,
      });
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

    const updatedAppointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: req.tenantId, saleId: null },
      { status: "Cancelled", cancelReason: cancelReason },
      { returnDocument: "after" },
    ).populate("customerId");

    if (!updatedAppointment) {
      const linked = await Appointment.exists({ _id: appointmentId, tenantId: req.tenantId, saleId: { $ne: null } });
      return res.status(linked ? 409 : 404).json({ message: linked ? "لا يمكن إلغاء حجز مرتبط بعملية بيع." : "لم يتم العثور على الموعد" });
    }

    const tenant = await Tenant.findById(updatedAppointment.tenantId);
    const slotStep = tenant?.settings?.slotDuration || 30;
    const slotsNeeded = Math.ceil(
      (updatedAppointment.totalDuration || slotStep) / slotStep,
    );

    const paddingSlots = [];
    let paddingSlot = updatedAppointment.timeSlot;
    for (let i = 1; i < slotsNeeded; i++) {
      paddingSlot = getNextTimeSlot(paddingSlot, slotStep);
      paddingSlots.push(paddingSlot);
    }

    if (paddingSlots.length > 0) {
      await Appointment.deleteMany({
        tenantId: updatedAppointment.tenantId,
        barberId: updatedAppointment.barberId,
        date: updatedAppointment.date,
        timeSlot: { $in: paddingSlots },
        childName: "Padding Block",
        status: "Blocked",
      });
    }

    if (updatedAppointment.customerId?.phone) {
      sendCancellationMessage(
        updatedAppointment.customerId.phone,
        updatedAppointment.childName,
        updatedAppointment.barberName,
        tenant,
        cancelReason,
      ).catch(() => {});
    }

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
    const slug = String(req.params.slug || "");
    const tenant = await Tenant.findOne({ slug, deletedAt: null })
      .select("_id salonName slug branding")
      .lean();

    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const ksaDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const today = `${ksaDate.getFullYear()}-${String(ksaDate.getMonth() + 1).padStart(2, "0")}-${String(ksaDate.getDate()).padStart(2, "0")}`;

    const [appointments, barbers] = await Promise.all([
      Appointment.find({ tenantId: tenant._id, date: today, status: "Booked" })
        // شاشة عامة: لا جوالات ولا أسعار ولا خدمات — فقط ما يُعرض على الشاشة
        .select("childName timeSlot barberName status")
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
    }));

    res.status(200).json({
      salonName: tenant.salonName,
      // شاشة الطابور تتحدث كل 15 ثانية: نرسل رابط الشعار بدل الصورة نفسها
      branding: {
        ...(tenant.branding || {}),
        logoUrl: publicLogoUrl(tenant.slug, tenant.branding?.logoUrl),
      },
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
  sendCustomerAccessCode,
  verifyCustomerAccessCode,
  getCustomerAppointments,
  getCustomerProfile,
  cancelCustomerAppointment,
  rescheduleCustomerAppointment,
};
