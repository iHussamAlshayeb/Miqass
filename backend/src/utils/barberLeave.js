const LEAVE_TYPES = new Set(["daily", "weekly", "monthly"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateKey = (value) => {
  if (!DATE_PATTERN.test(String(value || ""))) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

const formatDateKey = (date) => date.toISOString().slice(0, 10);

const parseWeekday = (value) => {
  const weekday = Number(value);
  return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
    ? weekday
    : null;
};

const getLeaveEndDate = (type, startDate) => {
  const start = parseDateKey(startDate);
  if (!start || !LEAVE_TYPES.has(type)) return null;

  const durationDays = type === "daily" ? 1 : type === "weekly" ? 7 : 30;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + durationDays - 1);
  return formatDateKey(end);
};

const normalizeBarberLeaves = (leaves) => {
  if (!Array.isArray(leaves)) return [];

  const normalized = [];
  const seen = new Set();

  for (const leave of leaves.slice(-100)) {
    const type = String(leave?.type || "").trim();
    const startDate = String(leave?.startDate || "").trim();
    const weekday = type === "daily" ? parseWeekday(leave?.weekday) : null;
    const requestedEndDate = String(leave?.endDate || "").trim();
    const endDate =
      type === "daily" && weekday !== null
        ? requestedEndDate
        : getLeaveEndDate(type, startDate);
    if (!endDate) continue;

    const parsedStart = parseDateKey(startDate);
    const parsedEnd = parseDateKey(endDate);
    if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) continue;

    const key = `${type}:${startDate}:${endDate}:${weekday ?? "once"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      type,
      startDate,
      endDate,
      ...(weekday !== null ? { weekday } : {}),
    });
  }

  return normalized.sort((a, b) => a.startDate.localeCompare(b.startDate));
};

const isBarberOnLeave = (barber, date) => {
  const requestedDate = parseDateKey(date);
  if (!requestedDate) return false;

  return (barber?.leaves || []).some((leave) => {
    if (
      !DATE_PATTERN.test(String(leave?.startDate || "")) ||
      !DATE_PATTERN.test(String(leave?.endDate || "")) ||
      date < leave.startDate ||
      date > leave.endDate
    ) {
      return false;
    }

    const weekday = parseWeekday(leave?.weekday);
    return leave?.type !== "daily" || weekday === null
      ? true
      : requestedDate.getUTCDay() === weekday;
  });
};

module.exports = {
  getLeaveEndDate,
  isBarberOnLeave,
  normalizeBarberLeaves,
};
