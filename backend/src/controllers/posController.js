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
        logoUrl: tenant.branding?.logoUrl || "",
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
    const shift = await openShift(req.tenantId, req.body || {});
    return res.status(201).json({ shift: presentShift(shift, await summarizeShift(shift)) });
  } catch (error) {
    return sendError(res, error, "تعذر فتح الوردية.");
  }
};

const postCloseShift = async (req, res) => {
  try {
    const { shift, summary } = await closeShift(req.tenantId, req.body || {});
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

/** حجوزات اليوم التي لم يُحصّل حسابها بعد، لتظهر في نقطة البيع */
const listOpenAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      tenantId: req.tenantId,
      date: formatKsaDate(),
      status: { $in: ["Booked", "Completed"] },
      saleId: null,
    })
      .populate("customerId", "phone")
      .select("childName timeSlot barberName status selectedServices.name totalPrice payment.status payment.amount bookingSource isWalkIn customerId")
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
      })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر تحميل حجوزات اليوم.");
  }
};

module.exports = { listOpenAppointments, getCatalog, getCurrentShift, postOpenShift, postCloseShift, listShifts, getShift, searchCustomers, getCheckoutAppointment };
