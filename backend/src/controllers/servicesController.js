// إدارة الخدمات من الإدارة المالية: إضافة وتعديل وإيقاف وحذف
const mongoose = require("mongoose");
const Service = require("../models/Service");
const Barber = require("../models/Barber");
const SaleItem = require("../models/SaleItem");
const Appointment = require("../models/Appointment");
const { toPrice } = require("../utils/servicePricing");

// مقترحات للواجهة؛ أي مدة من 5 إلى 480 دقيقة بمضاعفات 5 مقبولة (الخدمات القديمة قد تكون بمدد أخرى)
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const isValidDuration = (value) => Number.isInteger(value) && value >= 5 && value <= 480 && value % 5 === 0;
const clean = (value, max = 120) => String(value ?? "").trim().slice(0, max);

const presentService = (service) => ({
  _id: service._id,
  name: service.name,
  description: service.description || "",
  price: service.price,
  duration: service.duration,
  category: service.category || "عام",
  isActive: service.isActive !== false,
  createdAt: service.createdAt,
  updatedAt: service.updatedAt,
});

/** يتحقق من بيانات الخدمة؛ partial للتعديل الجزئي (مثل الإيقاف فقط) */
const readServiceInput = (body = {}, partial = false) => {
  const data = {};
  if (!partial || body.name !== undefined) {
    data.name = clean(body.name, 80);
    if (!data.name) return { error: "اكتب اسم الخدمة." };
  }
  if (!partial || body.price !== undefined) {
    data.price = toPrice(body.price);
    if (data.price === null) return { error: "سعر الخدمة غير صالح." };
  }
  if (!partial || body.duration !== undefined) {
    data.duration = Number(body.duration);
    if (!isValidDuration(data.duration)) return { error: "مدة الخدمة غير صالحة." };
  }
  if (body.category !== undefined || !partial) data.category = clean(body.category, 40) || "عام";
  if (body.description !== undefined) data.description = clean(body.description, 300);
  if (body.isActive !== undefined) data.isActive = body.isActive !== false;
  return { data };
};

/** يقرأ أسعار الحلاقين لهذه الخدمة: الفارغ يعني السعر الأساسي. null إن لم تُرسل (لا تُمس). */
const readBarberPrices = (raw) => {
  if (raw === undefined) return { prices: null };
  if (!Array.isArray(raw)) return { error: "أسعار الحلاقين غير صالحة." };
  const prices = new Map();
  for (const entry of raw.slice(0, 200)) {
    const barberId = String(entry?.barberId || "");
    if (!mongoose.Types.ObjectId.isValid(barberId)) continue;
    if (entry.price === "" || entry.price === null || entry.price === undefined) continue;
    const price = toPrice(entry.price);
    if (price === null) return { error: "سعر أحد الحلاقين غير صالح." };
    prices.set(barberId, price);
  }
  return { prices };
};

/** يستبدل أسعار هذه الخدمة لدى كل حلاقي الصالون بالقائمة المرسلة */
const saveBarberPrices = async (tenantId, serviceId, prices) => {
  if (!prices) return;
  await Barber.updateMany({ tenantId }, { $pull: { servicePrices: { serviceId } } });
  if (!prices.size) return;
  await Barber.bulkWrite([...prices].map(([barberId, price]) => ({
    updateOne: { filter: { _id: barberId, tenantId }, update: { $push: { servicePrices: { serviceId, price } } } },
  })));
};

const findOwnService = (req) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.serviceId)) return null;
  return Service.findOne({ _id: req.params.serviceId, tenantId: req.tenantId, archivedAt: null });
};

const listServices = async (req, res) => {
  try {
    const services = await Service.find({ tenantId: req.tenantId, archivedAt: null })
      .sort({ isActive: -1, category: 1, name: 1 })
      .lean();
    // عدد مرات بيع كل خدمة يساعد صاحب الصالون قبل الحذف
    const sold = await SaleItem.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(String(req.tenantId)), serviceId: { $in: services.map((s) => s._id) } } },
      { $group: { _id: "$serviceId", count: { $sum: "$quantity" } } },
    ]);
    const soldMap = new Map(sold.map((row) => [String(row._id), row.count]));
    const barbers = await Barber.find({ tenantId: req.tenantId }).select("name isActive iconColor servicePrices").sort({ createdAt: 1 }).lean();
    const pricesByService = new Map();
    for (const barber of barbers) {
      for (const entry of barber.servicePrices || []) {
        const key = String(entry.serviceId);
        if (!pricesByService.has(key)) pricesByService.set(key, []);
        pricesByService.get(key).push({ barberId: String(barber._id), price: Number(entry.price) });
      }
    }
    return res.json({
      services: services.map((service) => ({
        ...presentService(service),
        soldCount: soldMap.get(String(service._id)) || 0,
        barberPrices: pricesByService.get(String(service._id)) || [],
      })),
      barbers: barbers.map((barber) => ({ _id: barber._id, name: barber.name, isActive: barber.isActive !== false, iconColor: barber.iconColor || "" })),
      durations: DURATIONS,
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذر جلب الخدمات." });
  }
};

const createService = async (req, res) => {
  try {
    const { data, error } = readServiceInput(req.body);
    if (error) return res.status(400).json({ message: error });
    const barberPrices = readBarberPrices(req.body.barberPrices);
    if (barberPrices.error) return res.status(400).json({ message: barberPrices.error });
    const duplicate = await Service.exists({ tenantId: req.tenantId, archivedAt: null, name: data.name });
    if (duplicate) return res.status(409).json({ message: "توجد خدمة بنفس الاسم." });
    const service = await Service.create({ tenantId: req.tenantId, isActive: true, ...data });
    await saveBarberPrices(req.tenantId, service._id, barberPrices.prices);
    return res.status(201).json({ message: "أُضيفت الخدمة.", service: presentService(service) });
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة الخدمة." });
  }
};

const updateService = async (req, res) => {
  try {
    const { data, error } = readServiceInput(req.body, true);
    if (error) return res.status(400).json({ message: error });
    const barberPrices = readBarberPrices(req.body.barberPrices);
    if (barberPrices.error) return res.status(400).json({ message: barberPrices.error });
    if (data.name) {
      const duplicate = await Service.exists({ tenantId: req.tenantId, archivedAt: null, name: data.name, _id: { $ne: req.params.serviceId } });
      if (duplicate) return res.status(409).json({ message: "توجد خدمة بنفس الاسم." });
    }
    const service = await findOwnService(req);
    if (!service) return res.status(404).json({ message: "الخدمة غير موجودة." });
    service.set(data);
    await service.save();
    await saveBarberPrices(req.tenantId, service._id, barberPrices.prices);
    return res.json({ message: "حُفظت الخدمة.", service: presentService(service) });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حفظ الخدمة." });
  }
};

/**
 * حذف خدمة: إن لم تُبع ولم تُحجز تُحذف نهائياً، وإلا تُؤرشف حتى تبقى الفواتير والحجوزات القديمة سليمة.
 * في الحالتين تختفي من الحجز ونقطة البيع وتُزال أسعار الحلاقين الخاصة بها.
 */
const deleteService = async (req, res) => {
  try {
    const service = await findOwnService(req);
    if (!service) return res.status(404).json({ message: "الخدمة غير موجودة." });
    const [sold, booked] = await Promise.all([
      SaleItem.exists({ tenantId: req.tenantId, serviceId: service._id }),
      Appointment.exists({ tenantId: req.tenantId, "selectedServices.serviceId": service._id }),
    ]);
    await Barber.updateMany({ tenantId: req.tenantId }, { $pull: { servicePrices: { serviceId: service._id } } });
    if (sold || booked) {
      service.isActive = false;
      service.archivedAt = new Date();
      await service.save();
      return res.json({ message: "حُذفت الخدمة من القوائم، وبقيت في الفواتير والحجوزات السابقة.", archived: true });
    }
    await service.deleteOne();
    return res.json({ message: "حُذفت الخدمة.", archived: false });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف الخدمة." });
  }
};

module.exports = { listServices, createService, updateService, deleteService, DURATIONS };
