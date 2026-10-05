const SORT_FIELDS = {
  createdAt: "createdAt",
  date: "date",
  timeSlot: "timeSlot",
  childName: "childName",
  barberName: "barberName",
  services: "selectedServices.name",
  totalPrice: "totalPrice",
  status: "status",
};

const STATUSES = new Set(["Pending_Payment", "Booked", "Completed", "Cancelled", "Blocked"]);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDate = (value) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("التاريخ غير صالح.");
  const date = new Date(`${value}T00:00:00+03:00`);
  if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) !== value) {
    throw new Error("التاريخ غير صالح.");
  }
  return date;
};

const textFilter = (value) => {
  const text = String(value || "").trim();
  if (text.length > 80) throw new Error("نص التصفية طويل جدًا.");
  return text ? new RegExp(escapeRegex(text), "i") : null;
};

const parsePrice = (value) => {
  if (value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e9) throw new Error("المبلغ غير صالح.");
  return number;
};

const buildAppointmentHistoryParams = (params, tenantId) => {
  const query = { tenantId };
  const bookingFrom = parseDate(params.bookingFrom);
  const bookingTo = parseDate(params.bookingTo);
  const visitFrom = parseDate(params.visitFrom);
  const visitTo = parseDate(params.visitTo);
  if (bookingFrom && bookingTo && bookingFrom > bookingTo) throw new Error("نطاق تاريخ الطلب غير صالح.");
  if (visitFrom && visitTo && visitFrom > visitTo) throw new Error("نطاق تاريخ الحضور غير صالح.");
  if (bookingFrom || bookingTo) {
    query.createdAt = {};
    if (bookingFrom) query.createdAt.$gte = bookingFrom;
    if (bookingTo) query.createdAt.$lt = new Date(bookingTo.getTime() + 86400000);
  }
  if (visitFrom || visitTo) {
    query.date = {};
    if (visitFrom) query.date.$gte = params.visitFrom;
    if (visitTo) query.date.$lte = params.visitTo;
  }

  if (params.time) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(params.time)) throw new Error("الوقت غير صالح.");
    query.timeSlot = params.time;
  }

  const barber = textFilter(params.barber);
  const service = textFilter(params.service);
  const customer = textFilter(params.customer);
  if (barber) query.barberName = barber;
  if (service) query["selectedServices.name"] = service;

  if (params.status && params.status !== "All") {
    if (!STATUSES.has(params.status)) throw new Error("الحالة غير صالحة.");
    query.status = params.status;
  }

  const minPrice = parsePrice(params.minPrice);
  const maxPrice = parsePrice(params.maxPrice);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new Error("نطاق المبلغ غير صالح.");
  if (minPrice !== null || maxPrice !== null) {
    query.totalPrice = {};
    if (minPrice !== null) query.totalPrice.$gte = minPrice;
    if (maxPrice !== null) query.totalPrice.$lte = maxPrice;
  }

  const sortBy = SORT_FIELDS[params.sortBy] ? params.sortBy : "date";
  const direction = params.direction === "asc" ? 1 : -1;
  const sort = { [SORT_FIELDS[sortBy]]: direction };
  if (sortBy === "date") sort.timeSlot = direction;
  sort._id = direction;

  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const requestedLimit = Number(params.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 25;
  return { query, customer, sort, page, limit };
};

module.exports = { buildAppointmentHistoryParams };
