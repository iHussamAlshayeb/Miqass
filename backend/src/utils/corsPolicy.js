// سياسة المصادر المسموحة (CORS): نطاق مقص والتطوير المحلي فقط
const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost:\d+$/,
  /^https:\/\/(www\.)?miqass\.app$/,
];

const isAllowedOrigin = (origin) =>
  ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));

// يُسجَّل المصدر مقصوصاً ومنظفاً حتى لا يُحقن في السجل
const describeForLog = (value) =>
  String(value || "").replace(/[\r\n\t]/g, " ").slice(0, 200);

// يرفض الطلبات من مصادر غير مسموحة قبل وصولها لأي مسار، بسطر سجل واحد بدل خطأ 500
const rejectDisallowedOrigins = (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || isAllowedOrigin(origin)) return next();
  console.warn(
    `CORS: رُفض طلب من المصدر ${describeForLog(origin)} إلى ${req.method} ${describeForLog(req.originalUrl.split("?")[0])}`,
  );
  return res.status(403).json({ message: "Access denied by Miqass Security Policy" });
};

const corsOptions = {
  origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
  credentials: true,
};

module.exports = { isAllowedOrigin, rejectDisallowedOrigins, corsOptions };
