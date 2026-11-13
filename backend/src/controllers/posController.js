// نقطة البيع: بيانات الشاشة (الخدمات والمنتجات والحلاقين) والورديات
const mongoose = require("mongoose");
const Service = require("../models/Service");
const Product = require("../models/Product");
const Barber = require("../models/Barber");
const Tenant = require("../models/Tenant");
const CashShift = require("../models/CashShift");
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

module.exports = { getCatalog, getCurrentShift, postOpenShift, postCloseShift, listShifts, getShift };
