// يُشغَّل داخل حاوية المعاينة فقط (scripts/start-preview.ps1):
// ينشئ صالوناً تجريبياً بالباقة المميزة مع حلاقين وخدمات ومنتجات وعملاء وحجوزات اليوم.
// آمن للتكرار: لا يكرر الصالون، ويضيف حجوزات اليوم إن لم توجد.
// يُشغَّل كملف داخل الحاوية (node scripts/preview-seed.js) وليس عبر أنبوب، حفاظاً على العربية.
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const root = "/app/src/models";
const Tenant = require(path.join(root, "Tenant"));
const Barber = require(path.join(root, "Barber"));
const Service = require(path.join(root, "Service"));
const Product = require(path.join(root, "Product"));
const Customer = require(path.join(root, "Customer"));
const Appointment = require(path.join(root, "Appointment"));
const Cashier = require(path.join(root, "Cashier"));

const EMAIL = "preview@miqass.local";
const PASSWORD = "Preview@1234";
const SLUG = "preview";

const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

(async () => {
  if (!/miqass_preview/.test(process.env.MONGO_URI || "")) {
    throw new Error("هذا السكربت لبيئة المعاينة فقط.");
  }
  await mongoose.connect(process.env.MONGO_URI);

  let tenant = await Tenant.findOne({ slug: SLUG });
  // بيانات أُنشئت سابقاً بنسخة كانت تُحوّل العربية إلى "?": تُحذف ويُعاد إنشاؤها
  if (tenant && /\?{2,}/.test(tenant.salonName || "")) {
    const filter = { tenantId: tenant._id };
    await Promise.all([Barber.deleteMany(filter), Service.deleteMany(filter), Product.deleteMany(filter),
      Customer.deleteMany(filter), Appointment.deleteMany(filter), Cashier.deleteMany(filter)]);
    await Tenant.deleteOne({ _id: tenant._id });
    tenant = null;
    console.error("حُذفت بيانات معاينة تالفة (علامات استفهام) وسيُعاد إنشاؤها.");
  }
  if (!tenant) {
    tenant = await Tenant.create({
      salonName: "صالون المعاينة",
      slug: SLUG,
      ownerName: "حساب تجريبي",
      ownerPhone: "0500000000",
      email: EMAIL,
      password: await bcrypt.hash(PASSWORD, 10),
      subscription: { plan: "Premium", status: "Active", endDate: new Date(Date.now() + 365 * 86400000) },
      kioskLockEnabled: false,
      settings: { startTime: "09:00", endTime: "23:30", slotDuration: 30 },
    });

    const services = await Service.create([
      { tenantId: tenant._id, name: "قص شعر", price: 40, duration: 30, category: "قص" },
      { tenantId: tenant._id, name: "قص أطفال", price: 30, duration: 30, category: "قص" },
      { tenantId: tenant._id, name: "حلاقة ذقن", price: 20, duration: 15, category: "ذقن" },
      { tenantId: tenant._id, name: "تنظيف بشرة", price: 60, duration: 30, category: "عناية" },
    ]);
    await Barber.create([
      { tenantId: tenant._id, name: "محمود", iconColor: "#0F4C47", pin: "1111" },
      { tenantId: tenant._id, name: "ماجد", iconColor: "#A8772E", pin: "2222",
        servicePrices: [{ serviceId: services[0]._id, price: 55 }, { serviceId: services[2]._id, price: 25 }] },
    ]);
    await Product.create([
      { tenantId: tenant._id, name: "واكس شعر", salePrice: 35, costPrice: 15, stockQuantity: 12, barcode: "6281000000011", category: "عناية" },
      { tenantId: tenant._id, name: "شامبو أطفال", salePrice: 25, costPrice: 10, stockQuantity: 8, barcode: "6281000000028", category: "عناية" },
    ]);
    await Customer.create([
      { tenantId: tenant._id, phone: "0551234567", parentName: "أبو سعد", children: ["سعد", "فهد"], totalVisits: 7, lastVisitDate: new Date(Date.now() - 12 * 86400000), customerType: "Regular" },
      { tenantId: tenant._id, phone: "0559876543", parentName: "أم ريان", children: ["ريان"], totalVisits: 2, lastVisitDate: new Date(Date.now() - 30 * 86400000) },
      { tenantId: tenant._id, phone: "0561112223", parentName: "أبو خالد", children: ["خالد"], totalVisits: 15, customerType: "VIP" },
    ]);
    console.error("تم إنشاء صالون المعاينة.");
  }

  // كاشير تجريبي لتجربة دخول نقطة البيع بالرمز
  if (!(await Cashier.exists({ tenantId: tenant._id }))) {
    await Cashier.create({ tenantId: tenant._id, name: "سالم", pinHash: await bcrypt.hash("4826", 10) });
    console.error("أُضيف الكاشير التجريبي سالم (الرمز 4826).");
  }

  // حجوزات اليوم لتجربة تبويب الحجوزات في نقطة البيع
  const today = riyadhToday();
  if (!(await Appointment.exists({ tenantId: tenant._id, date: today }))) {
    const [mahmoud, majed] = await Promise.all([
      Barber.findOne({ tenantId: tenant._id, name: "محمود" }),
      Barber.findOne({ tenantId: tenant._id, name: "ماجد" }),
    ]);
    const byName = Object.fromEntries((await Service.find({ tenantId: tenant._id })).map((s) => [s.name, s]));
    const [saad, rayan, khalid] = await Promise.all(["0551234567", "0559876543", "0561112223"].map((phone) => Customer.findOne({ tenantId: tenant._id, phone })));
    const line = (service, price = service.price) => ({ serviceId: service._id, name: service.name, price, duration: service.duration });
    await Appointment.create([
      { tenantId: tenant._id, customerId: saad._id, date: today, timeSlot: "12:00", childName: "سعد", barberId: majed._id, barberName: majed.name,
        selectedServices: [line(byName["قص شعر"], 55), line(byName["حلاقة ذقن"], 25)], totalPrice: 80, totalDuration: 45,
        status: "Completed", payment: { status: "Paid", amount: 20, method: "online", provider: "preview" } },
      { tenantId: tenant._id, customerId: rayan._id, date: today, timeSlot: "13:00", childName: "ريان", barberId: mahmoud._id, barberName: mahmoud.name,
        selectedServices: [line(byName["قص أطفال"])], totalPrice: 30, totalDuration: 30, status: "Booked" },
      { tenantId: tenant._id, customerId: khalid._id, date: today, timeSlot: "13:30", childName: "خالد", barberId: mahmoud._id, barberName: mahmoud.name,
        selectedServices: [], totalPrice: 0, totalDuration: 0, status: "Booked", bookingSource: "kiosk_walk_in", isWalkIn: true },
    ]);
    console.error(`أُضيفت حجوزات اليوم (${today}).`);
  }

  await mongoose.disconnect();
  console.log("OK");
})().catch(async (error) => {
  console.error("فشل تجهيز بيانات المعاينة:", error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
