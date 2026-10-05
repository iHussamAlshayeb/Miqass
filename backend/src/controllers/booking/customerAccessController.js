// إدارة العميل لحجوزاته عبر رمز التحقق: العرض والإلغاء وإعادة الجدولة
const Appointment = require("../../models/Appointment");
const Tenant = require("../../models/Tenant");
const Customer = require("../../models/Customer");
const Barber = require("../../models/Barber");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { sendCancellationMessage, sendBookingAccessCode, sendRescheduleMessage } = require("../../utils/whatsapp");
const { sendAdminNotification } = require("../../utils/onesignal");
const { isBarberOnLeave } = require("../../utils/barberLeave");
const {
  BOOKING_SOURCE_KIOSK_WALK_IN,
  generateTimeSlots,
  getKsaNow,
  buildSlotDateTime,
  isValidBookingDate,
  isSlotBookableByTime,
  isSlotDuringBreak,
  getPaddingSlots,
} = require("./helpers");

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

module.exports = {
  sendCustomerAccessCode,
  verifyCustomerAccessCode,
  getCustomerAppointments,
  getCustomerProfile,
  cancelCustomerAppointment,
  rescheduleCustomerAppointment,
};
