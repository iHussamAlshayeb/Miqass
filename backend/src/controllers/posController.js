// نقطة البيع: بيانات الشاشة (الخدمات والمنتجات والحلاقين) والورديات
const mongoose = require("mongoose");
const Service = require("../models/Service");
const Product = require("../models/Product");
const Barber = require("../models/Barber");
const Tenant = require("../models/Tenant");
const CashShift = require("../models/CashShift");
const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");
const Sale = require("../models/Sale");
const { formatKsaDate } = require("./booking/helpers");
const { publicLogoUrl } = require("../utils/logoImage");
const Cashier = require("../models/Cashier");
const Expense = require("../models/Expense");
const PosDevice = require("../models/PosDevice");
const { sha256, newDeviceToken, newActivationCode, normalizeActivationCode, safeEqualHex, isWeakPin } = require("../utils/posDevice");
const { signPosToken } = require("../utils/posAuth");
const { hashPin, isValidPin, normalizePinInput } = require("../utils/barberPin");
const bcrypt = require("bcryptjs");
const { updateAppointmentStatus } = require("./barberController");
const { resendSingleWhatsApp } = require("./dashboard/appointmentsController");
const {
  getOpenShift,
  summarizeShift,
  presentShift,
  openShift,
  closeShift,
} = require("../services/cashShiftService");

const sendError = (res, error, fallback) => {
  if (!error.statusCode) console.error(fallback, error);
  return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : fallback });
};

const getCatalog = async (req, res) => {
  try {
    const [tenant, services, products, barbers] = await Promise.all([
      Tenant.findById(req.tenantId).select("salonName slug branding.logoUrl branding.primaryColor taxSettings.taxNumber").lean(),
      Service.find({ tenantId: req.tenantId, isActive: true }).select("name price category duration").sort({ category: 1, name: 1 }).lean(),
      Product.find({ tenantId: req.tenantId, isActive: true }).select("name salePrice stockQuantity barcode sku category").sort({ name: 1 }).lean(),
      Barber.find({ tenantId: req.tenantId, isActive: true }).select("name iconColor servicePrices").sort({ name: 1 }).lean(),
    ]);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود." });
    return res.json({
      salon: {
        name: tenant.salonName,
        slug: tenant.slug,
        // نفس رابط الشعار العام في بقية النظام: لا صورة مضمّنة ولا افتراضي غير موجود
        logoUrl: publicLogoUrl(tenant.slug, tenant.branding?.logoUrl),
        primaryColor: tenant.branding?.primaryColor || "#0f172a",
        hasTaxNumber: Boolean(tenant.taxSettings?.taxNumber),
      },
      services,
      products,
      barbers: barbers.map((barber) => ({
        _id: barber._id,
        name: barber.name,
        iconColor: barber.iconColor || "",
        servicePrices: (barber.servicePrices || []).map((entry) => ({
          serviceId: String(entry.serviceId),
          price: Number(entry.price),
        })),
      })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل بيانات نقطة البيع.");
  }
};

const getCurrentShift = async (req, res) => {
  try {
    const shift = await getOpenShift(req.tenantId);
    if (!shift) return res.json({ shift: null });
    return res.json({ shift: presentShift(shift, await summarizeShift(shift)) });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل الوردية.");
  }
};

const postOpenShift = async (req, res) => {
  try {
    const shift = await openShift(req.tenantId, { ...(req.body || {}), openedBy: req.cashier?.name || req.body?.openedBy });
    return res.status(201).json({ shift: presentShift(shift, await summarizeShift(shift)) });
  } catch (error) {
    return sendError(res, error, "تعذر فتح الوردية.");
  }
};

const postCloseShift = async (req, res) => {
  try {
    const { shift, summary } = await closeShift(req.tenantId, { ...(req.body || {}), closedBy: req.cashier?.name || req.body?.closedBy });
    return res.json({ shift: presentShift(shift, summary) });
  } catch (error) {
    return sendError(res, error, "تعذر إغلاق الوردية.");
  }
};

const listShifts = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const shifts = await CashShift.find({ tenantId: req.tenantId })
      .sort({ openedAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ shifts: shifts.map((shift) => presentShift(shift, shift.summary)) });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل الورديات.");
  }
};

const getShift = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.shiftId)) return res.status(404).json({ message: "الوردية غير موجودة." });
    const shift = await CashShift.findOne({ _id: req.params.shiftId, tenantId: req.tenantId }).lean();
    if (!shift) return res.status(404).json({ message: "الوردية غير موجودة." });
    const summary = shift.status === "Open" ? await summarizeShift(shift) : shift.summary;
    return res.json({ shift: presentShift(shift, summary) });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل الوردية.");
  }
};

// أسماء افتراضية تُحفظ للعميل بلا اسم؛ لا نعرضها كاسم حقيقي
const PLACEHOLDER_NAMES = new Set(["عميل قيم", "عميل نقدي", ""]);

// صيغ الرقم المحتملة: كما كُتب، وبصفر بدل 966، وبصفر قبل 5
const phoneCandidates = (digits) => {
  const set = new Set([digits]);
  if (digits.startsWith("966")) set.add(`0${digits.slice(3)}`);
  if (digits.startsWith("5")) set.add(`0${digits}`);
  return [...set];
};

/** البحث عن عميل بأول أرقام جواله أثناء الكتابة في نقطة البيع */
const searchCustomers = async (req, res) => {
  try {
    const digits = String(req.query.q || "").replace(/\D/g, "").slice(0, 15);
    if (digits.length < 3) return res.json({ customers: [] });
    // الأرقام فقط في النمط، فلا حاجة لتهريب رموز التعابير النمطية
    const customers = await Customer.find({
      tenantId: req.tenantId,
      $or: phoneCandidates(digits).map((candidate) => ({ phone: { $regex: `^${candidate}` } })),
    })
      .select("phone parentName children totalVisits lastVisitDate customerType")
      .sort({ lastVisitDate: -1 })
      .limit(6)
      .lean();
    return res.json({
      customers: customers.map((customer) => ({
        _id: customer._id,
        phone: customer.phone,
        name: PLACEHOLDER_NAMES.has(String(customer.parentName || "").trim()) ? "" : customer.parentName,
        children: (customer.children || []).filter(Boolean).slice(0, 8),
        totalVisits: Number(customer.totalVisits || 0),
        lastVisitDate: customer.lastVisitDate || null,
        customerType: customer.customerType || "New",
      })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر البحث عن العميل.");
  }
};

/** بيانات حجز مكتمل لتحصيل حسابه من نقطة البيع: خدماته بأسعار الحجز والعربون المدفوع */
const getCheckoutAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) return res.status(404).json({ message: "الحجز غير موجود." });
    const appointment = await Appointment.findOne({ _id: appointmentId, tenantId: req.tenantId })
      .populate("customerId", "phone parentName")
      .lean();
    if (!appointment) return res.status(404).json({ message: "الحجز غير موجود." });
    const linkedSale = appointment.saleId
      ? { _id: appointment.saleId }
      : await Sale.findOne({ tenantId: req.tenantId, appointmentId: appointment._id }).select("_id").lean();
    if (linkedSale) {
      return res.status(409).json({ message: "تم تحصيل حساب هذا الحجز مسبقاً.", saleId: linkedSale._id, code: "ALREADY_CHECKED_OUT" });
    }
    // المحجوز يُحصّل أيضاً: تكمله نقطة البيع قبل الدفع
    if (!["Booked", "Completed"].includes(appointment.status)) {
      return res.status(409).json({ message: "هذا الحجز ملغي أو غير قابل للتحصيل.", code: "NOT_CHECKOUTABLE" });
    }
    const services = (appointment.selectedServices || []).map((service) => ({
      serviceId: service.serviceId ? String(service.serviceId) : "",
      name: service.name,
      price: Number(service.price || 0),
    }));
    // نفس ما يفعله الخادم عند البيع: حجز بلا خدمات محددة وله سعر يُحتسب "خدمة حلاقة"
    if (services.length === 0 && Number(appointment.totalPrice) > 0) {
      services.push({ serviceId: "", name: "خدمة حلاقة", price: Number(appointment.totalPrice) });
    }
    return res.json({
      appointment: {
        _id: appointment._id,
        childName: appointment.childName,
        customerPhone: appointment.customerId?.phone || "",
        date: appointment.date,
        timeSlot: appointment.timeSlot,
        barberId: appointment.barberId ? String(appointment.barberId) : "",
        barberName: appointment.barberName || "",
        status: appointment.status,
        services,
        deposit: appointment.payment?.status === "Paid" ? Number(appointment.payment.amount || 0) : 0,
      },
    });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل الحجز.");
  }
};

/** مواعيد اليوم كاملة لنقطة البيع: المحجوز والمكتمل والمدفوع والملغي */
const listTodayAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      tenantId: req.tenantId,
      date: formatKsaDate(),
      status: { $in: ["Booked", "Completed", "Cancelled"] },
    })
      .populate("customerId", "phone")
      .select("childName timeSlot barberName status selectedServices.name totalPrice payment.status payment.amount bookingSource isWalkIn isReviewRequested cancelReason saleId customerId")
      .sort({ timeSlot: 1 })
      .limit(200)
      .lean();
    return res.json({
      appointments: appointments.map((appointment) => ({
        _id: appointment._id,
        childName: appointment.childName,
        customerPhone: appointment.customerId?.phone || "",
        timeSlot: appointment.timeSlot,
        barberName: appointment.barberName || "",
        status: appointment.status,
        isWalkIn: Boolean(appointment.isWalkIn || appointment.bookingSource === "kiosk_walk_in"),
        servicesLabel: (appointment.selectedServices || []).map((service) => service.name).filter(Boolean).join("، "),
        totalPrice: Number(appointment.totalPrice || 0),
        deposit: appointment.payment?.status === "Paid" ? Number(appointment.payment.amount || 0) : 0,
        saleId: appointment.saleId || null,
        isPaid: Boolean(appointment.saleId),
        canRequestReview: Boolean(
          appointment.status === "Completed" && appointment.bookingSource === "kiosk_walk_in" && !appointment.isReviewRequested,
        ),
        cancelReason: appointment.cancelReason || "",
      })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل مواعيد اليوم.");
  }
};

/** إتمام أو إلغاء موعد من نقطة البيع: نفس منطق لوحة التحكم (الزيارات، الولاء، رسائل الإلغاء والتقييم) */
const updateAppointmentStatusFromPos = (req, res) => {
  if (!["Completed", "Cancelled"].includes(req.body?.status)) {
    return res.status(400).json({ message: "الحالة المطلوبة غير مسموحة من نقطة البيع." });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.appointmentId)) {
    return res.status(404).json({ message: "الموعد غير موجود." });
  }
  return updateAppointmentStatus(req, res);
};

/** تذكير واتساب يدوي للعميل بموعده */
const sendAppointmentReminder = (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.appointmentId)) {
    return res.status(404).json({ message: "الموعد غير موجود." });
  }
  req.params.id = req.params.appointmentId;
  return resendSingleWhatsApp(req, res);
};

/** فواتير الوردية المفتوحة: لإعادة الطباعة وتسديد المتبقي */
const listShiftSales = async (req, res) => {
  try {
    const shift = await CashShift.findOne({ tenantId: req.tenantId, status: "Open" }).select("_id").lean();
    if (!shift) return res.json({ sales: [] });
    const sales = await Sale.find({ tenantId: req.tenantId, shiftId: shift._id })
      .select("invoiceNumber customerSnapshot totalAmount paidAmount status source createdAt appointmentId")
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    return res.json({ sales });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل فواتير الوردية.");
  }
};

/** مصروفات الصندوق في الوردية المفتوحة */
const listShiftExpenses = async (req, res) => {
  try {
    const shift = await CashShift.findOne({ tenantId: req.tenantId, status: "Open" }).select("_id").lean();
    if (!shift) return res.json({ expenses: [] });
    const expenses = await Expense.find({ tenantId: req.tenantId, shiftId: shift._id, status: "Paid" })
      .select("category description amount recordedBy createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ expenses });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل مصروفات الصندوق.");
  }
};

/** مصروف نقدي من الصندوق: يُسجل في المصروفات ويُخصم من النقد المتوقع عند إغلاق الوردية */
const createDrawerExpense = async (req, res) => {
  try {
    const amount = Math.round(Number(req.body?.amount) * 100) / 100;
    const description = String(req.body?.description || "").trim().slice(0, 200);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      return res.status(400).json({ message: "اكتب مبلغ المصروف بشكل صحيح." });
    }
    if (!description) return res.status(400).json({ message: "اكتب وصف المصروف (مثلاً: ماء، أدوات تنظيف)." });
    const shift = await CashShift.findOne({ tenantId: req.tenantId, status: "Open" }).select("_id").lean();
    if (!shift) return res.status(409).json({ message: "افتح الوردية أولاً." });
    const expense = await Expense.create({
      tenantId: req.tenantId,
      category: String(req.body?.category || "مصروف من الصندوق").trim().slice(0, 60) || "مصروف من الصندوق",
      description,
      amount,
      expenseDate: new Date(),
      paymentMethod: "cash",
      status: "Paid",
      shiftId: shift._id,
      recordedBy: req.cashier?.name || "المالك",
    });
    return res.status(201).json({ expense });
  } catch (error) {
    return sendError(res, error, "تعذر تسجيل المصروف.");
  }
};

// ===== دخول الكاشير =====
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** دخول الكاشير برابط الصالون ورمزه */
const DEVICE_MAX_FAILURES = 5;
const ACTIVATION_CODE_TTL_MS = 10 * 60 * 1000;
const ACTIVATION_MAX_FAILURES = 5;
const MAX_POS_DEVICES = 10;
const deviceNotActivated = (res) => res.status(403).json({
  message: "هذا الجهاز غير مفعّل لنقطة البيع. فعّله من لوحة التحكم: الإعدادات ← الكاشير.",
  code: "POS_DEVICE_NOT_ACTIVATED",
});

/**
 * دخول الكاشير: يلزم توكن جهاز مفعّل + رمز الكاشير.
 * الصالون يُعرف من الجهاز نفسه، فلا يكفي رابط الصالون مع تخمين الرمز من أي مكان.
 */
const posLogin = async (req, res) => {
  try {
    const deviceToken = typeof req.body?.deviceToken === "string" ? req.body.deviceToken.trim() : "";
    const pin = normalizePinInput(req.body?.pin);
    if (!deviceToken || deviceToken.length > 100) return deviceNotActivated(res);
    if (!isValidPin(pin)) return res.status(400).json({ message: "اكتب رمز الكاشير (4 إلى 8 أرقام)." });

    const device = await PosDevice.findOne({ tokenHash: sha256(deviceToken), revokedAt: null }).lean();
    if (!device) return deviceNotActivated(res);
    const tenant = await Tenant.findById(device.tenantId).select("salonName slug deletedAt posLoginFailures posLoginLockedUntil").lean();
    if (!tenant || tenant.deletedAt) return deviceNotActivated(res);

    const now = new Date();
    if ((device.lockedUntil && new Date(device.lockedUntil) > now) || (tenant.posLoginLockedUntil && new Date(tenant.posLoginLockedUntil) > now)) {
      return res.status(429).json({ message: "محاولات خاطئة كثيرة. حاول بعد 15 دقيقة." });
    }

    const cashiers = await Cashier.find({ tenantId: tenant._id, isActive: true }).select("+pinHash name").lean();
    let matched = null;
    for (const cashier of cashiers) {
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(pin, cashier.pinHash)) { matched = cashier; break; }
    }
    if (!matched) {
      const deviceFailures = Number(device.loginFailures || 0) + 1;
      const tenantFailures = Number(tenant.posLoginFailures || 0) + 1;
      const lockUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      await Promise.all([
        PosDevice.updateOne({ _id: device._id }, deviceFailures >= DEVICE_MAX_FAILURES
          ? { $set: { loginFailures: 0, lockedUntil: lockUntil } }
          : { $set: { loginFailures: deviceFailures } }),
        Tenant.updateOne({ _id: tenant._id }, tenantFailures >= LOGIN_MAX_FAILURES
          ? { $set: { posLoginFailures: 0, posLoginLockedUntil: lockUntil } }
          : { $set: { posLoginFailures: tenantFailures } }),
      ]);
      const left = DEVICE_MAX_FAILURES - deviceFailures;
      return res.status(401).json({
        message: left > 0 && left <= 2 ? `رمز الكاشير غير صحيح. بقيت ${left} محاولة قبل القفل المؤقت.` : "رمز الكاشير غير صحيح.",
      });
    }
    await Promise.all([
      Tenant.updateOne({ _id: tenant._id }, { $set: { posLoginFailures: 0, posLoginLockedUntil: null } }),
      PosDevice.updateOne({ _id: device._id }, { $set: { loginFailures: 0, lockedUntil: null, lastSeenAt: now } }),
      Cashier.updateOne({ _id: matched._id }, { $set: { lastLoginAt: now } }),
    ]);
    return res.json({
      token: signPosToken({ tenantId: tenant._id, cashierId: matched._id, deviceId: device._id }),
      cashier: { name: matched.name },
      salonName: tenant.salonName,
      deviceName: device.name,
    });
  } catch (error) {
    return sendError(res, error, "تعذر تسجيل الدخول.");
  }
};

/** حالة الجهاز لشاشة الدخول: مفعّل (واسم الصالون) أو يحتاج تفعيل */
const posDeviceStatus = async (req, res) => {
  try {
    const deviceToken = typeof req.body?.deviceToken === "string" ? req.body.deviceToken.trim() : "";
    if (!deviceToken || deviceToken.length > 100) return res.json({ activated: false });
    const device = await PosDevice.findOne({ tokenHash: sha256(deviceToken), revokedAt: null }).select("tenantId name").lean();
    if (!device) return res.json({ activated: false });
    const tenant = await Tenant.findById(device.tenantId).select("salonName deletedAt").lean();
    if (!tenant || tenant.deletedAt) return res.json({ activated: false });
    return res.json({ activated: true, salonName: tenant.salonName, deviceName: device.name });
  } catch (error) {
    return sendError(res, error, "تعذر التحقق من الجهاز.");
  }
};

const createDevice = async (tenantId, name) => {
  if ((await PosDevice.countDocuments({ tenantId, revokedAt: null })) >= MAX_POS_DEVICES) {
    throw Object.assign(new Error(`الحد الأقصى ${MAX_POS_DEVICES} أجهزة. ألغِ جهازاً قديماً أولاً.`), { statusCode: 400 });
  }
  const token = newDeviceToken();
  const device = await PosDevice.create({
    tenantId,
    name: String(name || "").trim().slice(0, 60) || "جهاز نقطة البيع",
    tokenHash: sha256(token),
    lastSeenAt: new Date(),
  });
  return { token, device };
};

const presentDevice = (device) => ({
  _id: device._id, name: device.name, createdAt: device.createdAt, lastSeenAt: device.lastSeenAt || null,
});

/** المالك يفعّل الجهاز الذي يستخدمه الآن (مسجل دخول بحسابه) */
const activateThisDevice = async (req, res) => {
  try {
    const { token, device } = await createDevice(req.tenantId, req.body?.name);
    return res.status(201).json({ deviceToken: token, device: presentDevice(device) });
  } catch (error) {
    return sendError(res, error, "تعذر تفعيل الجهاز.");
  }
};

/** رمز تفعيل لمرة واحدة لجهاز آخر، صالح 10 دقائق */
const createActivationCode = async (req, res) => {
  try {
    const code = newActivationCode();
    const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_MS);
    await Tenant.updateOne({ _id: req.tenantId }, {
      $set: { posActivationCodeHash: sha256(code), posActivationCodeExpiresAt: expiresAt, posActivationFailures: 0 },
    });
    return res.json({ code, expiresAt });
  } catch (error) {
    return sendError(res, error, "تعذر إنشاء رمز التفعيل.");
  }
};

/** جهاز جديد يُفعَّل برابط الصالون + رمز التفعيل؛ الرمز يُستهلك مرة واحدة */
const activateWithCode = async (req, res) => {
  try {
    const slug = typeof req.body?.slug === "string" ? req.body.slug.toLowerCase().trim() : "";
    const code = normalizeActivationCode(req.body?.code);
    const invalid = () => res.status(400).json({ message: "رمز التفعيل غير صحيح أو منتهي. اطلب رمزاً جديداً من لوحة التحكم." });
    if (!slug || code.length !== 8) return invalid();

    const tenant = await Tenant.findOne({ slug }).select("+posActivationCodeHash posActivationCodeExpiresAt posActivationFailures deletedAt").lean();
    if (!tenant || tenant.deletedAt || !tenant.posActivationCodeHash || !tenant.posActivationCodeExpiresAt
      || new Date(tenant.posActivationCodeExpiresAt) <= new Date()) return invalid();

    if (!safeEqualHex(sha256(code), tenant.posActivationCodeHash)) {
      const failures = Number(tenant.posActivationFailures || 0) + 1;
      // بعد 5 محاولات خاطئة يُلغى الرمز كلياً
      await Tenant.updateOne({ _id: tenant._id }, failures >= ACTIVATION_MAX_FAILURES
        ? { $set: { posActivationCodeHash: "", posActivationCodeExpiresAt: null, posActivationFailures: 0 } }
        : { $set: { posActivationFailures: failures } });
      return invalid();
    }
    // استهلاك ذري: لو استُخدم الرمز في نفس اللحظة من جهاز آخر لا يُفعَّل الثاني
    const consumed = await Tenant.updateOne(
      { _id: tenant._id, posActivationCodeHash: tenant.posActivationCodeHash },
      { $set: { posActivationCodeHash: "", posActivationCodeExpiresAt: null, posActivationFailures: 0 } },
    );
    if (!consumed.modifiedCount) return invalid();
    const { token, device } = await createDevice(tenant._id, req.body?.name);
    return res.status(201).json({ deviceToken: token, device: presentDevice(device) });
  } catch (error) {
    return sendError(res, error, "تعذر تفعيل الجهاز.");
  }
};

const listDevices = async (req, res) => {
  try {
    const devices = await PosDevice.find({ tenantId: req.tenantId, revokedAt: null }).sort({ createdAt: 1 }).lean();
    return res.json({ devices: devices.map(presentDevice) });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل الأجهزة.");
  }
};

/** إلغاء جهاز: يتوقف دخول الكاشير منه وتنتهي جلساته المفتوحة فوراً */
const revokeDevice = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.deviceId)) return res.status(404).json({ message: "الجهاز غير موجود." });
    const result = await PosDevice.updateOne(
      { _id: req.params.deviceId, tenantId: req.tenantId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ message: "الجهاز غير موجود." });
    return res.json({ revoked: true });
  } catch (error) {
    return sendError(res, error, "تعذر إلغاء الجهاز.");
  }
};

/** من يستخدم نقطة البيع الآن: المالك أو كاشير */
const posMe = (req, res) => res.json({ role: req.posRole || "owner", name: req.cashier?.name || "" });

// ===== إدارة الكاشيرين (المالك فقط) =====
const presentCashier = (cashier) => ({
  _id: cashier._id, name: cashier.name, isActive: cashier.isActive !== false, lastLoginAt: cashier.lastLoginAt || null,
});

const WEAK_PIN_MESSAGE = "الرمز سهل التخمين (مثل 1234 أو 1111). اختر رمزاً آخر، ويُفضّل 6 أرقام.";

const assertUniquePin = async (tenantId, pin, exceptId = null) => {
  const others = await Cashier.find({ tenantId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select("+pinHash").lean();
  for (const other of others) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(pin, other.pinHash)) {
      throw Object.assign(new Error("هذا الرمز مستخدم لكاشير آخر. اختر رمزاً مختلفاً."), { statusCode: 409 });
    }
  }
};

const listCashiers = async (req, res) => {
  try {
    const cashiers = await Cashier.find({ tenantId: req.tenantId }).sort({ createdAt: 1 }).lean();
    return res.json({ cashiers: cashiers.map(presentCashier) });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل الكاشيرين.");
  }
};

const createCashier = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const pin = normalizePinInput(req.body?.pin);
    if (!name) return res.status(400).json({ message: "اكتب اسم الكاشير." });
    if (!isValidPin(pin)) return res.status(400).json({ message: "رمز الكاشير من 4 إلى 8 أرقام." });
    if (isWeakPin(pin)) return res.status(400).json({ message: WEAK_PIN_MESSAGE });
    if ((await Cashier.countDocuments({ tenantId: req.tenantId })) >= 20) {
      return res.status(400).json({ message: "الحد الأقصى 20 كاشيراً." });
    }
    await assertUniquePin(req.tenantId, pin);
    const cashier = await Cashier.create({ tenantId: req.tenantId, name, pinHash: await hashPin(pin) });
    return res.status(201).json({ cashier: presentCashier(cashier) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "يوجد كاشير بنفس الاسم." });
    return sendError(res, error, "تعذر إضافة الكاشير.");
  }
};

const updateCashier = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.cashierId)) return res.status(404).json({ message: "الكاشير غير موجود." });
    const update = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim().slice(0, 60);
      if (!name) return res.status(400).json({ message: "اكتب اسم الكاشير." });
      update.name = name;
    }
    if (req.body?.isActive !== undefined) update.isActive = req.body.isActive !== false;
    const pin = normalizePinInput(req.body?.pin);
    if (pin) {
      if (!isValidPin(pin)) return res.status(400).json({ message: "رمز الكاشير من 4 إلى 8 أرقام." });
      if (isWeakPin(pin)) return res.status(400).json({ message: WEAK_PIN_MESSAGE });
      await assertUniquePin(req.tenantId, pin, req.params.cashierId);
      update.pinHash = await hashPin(pin);
    }
    const cashier = await Cashier.findOneAndUpdate(
      { _id: req.params.cashierId, tenantId: req.tenantId },
      { $set: update },
      { returnDocument: "after" },
    ).lean();
    if (!cashier) return res.status(404).json({ message: "الكاشير غير موجود." });
    return res.json({ cashier: presentCashier(cashier) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "يوجد كاشير بنفس الاسم." });
    return sendError(res, error, "تعذر تحديث الكاشير.");
  }
};

const deleteCashier = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.cashierId)) return res.status(404).json({ message: "الكاشير غير موجود." });
    const result = await Cashier.deleteOne({ _id: req.params.cashierId, tenantId: req.tenantId });
    if (!result.deletedCount) return res.status(404).json({ message: "الكاشير غير موجود." });
    return res.json({ deleted: true });
  } catch (error) {
    return sendError(res, error, "تعذر حذف الكاشير.");
  }
};

module.exports = {
  listTodayAppointments, updateAppointmentStatusFromPos, sendAppointmentReminder, listShiftSales, listShiftExpenses,
  createDrawerExpense, posLogin, posDeviceStatus, activateThisDevice, createActivationCode, activateWithCode, listDevices, revokeDevice, posMe, listCashiers, createCashier, updateCashier, deleteCashier, getCatalog, getCurrentShift, postOpenShift, postCloseShift, listShifts, getShift, searchCustomers, getCheckoutAppointment };
