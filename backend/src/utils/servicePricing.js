// تسعير الخدمات حسب الحلاق: لكل حلاق أسعار خاصة اختيارية، وما لم يُحدد يأخذ سعر الخدمة الأساسي
const MAX_SERVICE_PRICE = 100000;

const toPrice = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > MAX_SERVICE_PRICE) return null;
  return Math.round(price * 100) / 100;
};

// يحوّل أسعار الحلاق القادمة من الواجهة إلى قائمة نظيفة؛ resolveServiceId يربط المعرف المؤقت للخدمة الجديدة بمعرفها الحقيقي
const normalizeServicePrices = (raw, resolveServiceId) => {
  if (!Array.isArray(raw)) return [];
  const prices = new Map();
  for (const entry of raw.slice(0, 500)) {
    const serviceId = resolveServiceId(String(entry?.serviceId || ""));
    const price = toPrice(entry?.price);
    if (!serviceId || price === null) continue;
    prices.set(serviceId, price);
  }
  return [...prices].map(([serviceId, price]) => ({ serviceId, price }));
};

// يطبق سعر الحلاق على لقطة الخدمات المختارة عند الحجز
const applyBarberServicePrices = (selectedServices, barber) => {
  const prices = new Map(
    (barber?.servicePrices || []).map((entry) => [String(entry.serviceId), Number(entry.price)]),
  );
  return selectedServices.map((service) => {
    const price = prices.get(String(service.serviceId));
    return Number.isFinite(price) ? { ...service, price } : service;
  });
};

const publicServicePrices = (barber) =>
  (barber?.servicePrices || []).map((entry) => ({
    serviceId: String(entry.serviceId),
    price: Number(entry.price),
  }));

module.exports = { MAX_SERVICE_PRICE, toPrice, normalizeServicePrices, applyBarberServicePrices, publicServicePrices };
