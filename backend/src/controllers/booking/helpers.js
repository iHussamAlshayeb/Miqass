// دوال مساعدة مشتركة لوحدات الحجز (الأوقات، الكشك، الحلاقة المباشرة)

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

module.exports = {
  KIOSK_PAST_BOOKING_GRACE_MINUTES,
  BOOKING_SOURCE_KIOSK,
  BOOKING_SOURCE_KIOSK_WALK_IN,
  WALK_IN_BARBER_NAME,
  mapAppointmentForFrontend,
  generateTimeSlots,
  getNextTimeSlot,
  getKsaNow,
  buildSlotDateTime,
  isKioskBookingSource,
  isKioskWalkInBookingSource,
  formatKsaDate,
  isValidBookingDate,
  formatWalkInTimeSlot,
  isSlotBookableByTime,
  isSlotDuringBreak,
  normalizeSelectedServiceIds,
  getPaddingSlots,
};
