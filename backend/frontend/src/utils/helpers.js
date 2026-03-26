export const getLocalDate = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().split("T")[0];
};

export const getTimePeriod = (timeStr) => {
  if (!timeStr) return "";
  const hour = parseInt(timeStr.split(":")[0]);
  if (hour >= 0 && hour < 2) return "منتصف الليل";
  if (hour >= 6 && hour < 11) return "صباحا";
  if (hour >= 11 && hour < 15) return "ظهرا";
  if (hour >= 15 && hour < 18) return "عصراً";
  if (hour >= 18 && hour < 24) return "مساءً";
  return "فجراً";
};

export const formatTime12Hour = (timeStr) => {
  if (!timeStr) return "";
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${minStr}`;
};

export const formatBookingTime = (timestamp) => {
  if (!timestamp) return "غير متوفر";
  const date = new Date(timestamp);
  return date.toLocaleString("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
