const RIYADH_UTC_OFFSET_HOURS = 3;
const MAX_CAMPAIGN_DAILY_LIMIT = 5000;

const getRiyadhDayKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getNextRiyadhDayStart = (date = new Date()) => {
  const [year, month, day] = getRiyadhDayKey(date).split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, -RIYADH_UTC_OFFSET_HOURS, 0, 0),
  );
};

// يوم الحملات يبدأ الساعة 12 ظهراً بتوقيت الرياض: عنده يتجدد الحد اليومي وتنطلق الدفعة التالية
const CAMPAIGN_DAY_START_HOUR = 12;

// مفتاح "يوم الحملة" = تاريخ الرياض بعد إزاحة ساعة البداية، فما قبل 12 ظهراً يتبع اليوم السابق
const getCampaignDayKey = (date = new Date()) =>
  getRiyadhDayKey(new Date(date.getTime() - CAMPAIGN_DAY_START_HOUR * 60 * 60 * 1000));

const getNextCampaignDayStart = (date = new Date()) => {
  const [year, month, day] = getCampaignDayKey(date).split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, CAMPAIGN_DAY_START_HOUR - RIYADH_UTC_OFFSET_HOURS, 0, 0),
  );
};

const parseCampaignDailyLimit = (value) => {
  if (value === null || value === undefined || value === "") {
    return { value: null };
  }

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_CAMPAIGN_DAILY_LIMIT
  ) {
    return {
      error: `الحد اليومي يجب أن يكون رقماً صحيحاً بين 1 و${MAX_CAMPAIGN_DAILY_LIMIT}.`,
    };
  }

  return { value: parsed };
};

module.exports = {
  CAMPAIGN_DAY_START_HOUR,
  MAX_CAMPAIGN_DAILY_LIMIT,
  getCampaignDayKey,
  getNextCampaignDayStart,
  getNextRiyadhDayStart,
  getRiyadhDayKey,
  parseCampaignDailyLimit,
};
