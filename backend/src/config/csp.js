/**
 * سياسة أمان المحتوى (CSP).
 * CSP_MODE:
 *   report  (الافتراضي) — المتصفح لا يمنع شيئاً، فقط يرسل المخالفات إلى /api/csp-report
 *   enforce — المتصفح يمنع أي مصدر غير مسموح
 *   off     — بدون CSP
 */
const CSP_MODE = ["report", "enforce", "off"].includes(process.env.CSP_MODE)
  ? process.env.CSP_MODE
  : "report";

const MOYASAR = ["https://cdn.moyasar.com", "https://api.moyasar.com", "https://*.moyasar.com"];
const ONESIGNAL = ["https://cdn.onesignal.com", "https://onesignal.com", "https://*.onesignal.com"];

const directives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "https://cdn.moyasar.com", ...ONESIGNAL],
  // React/framer-motion وOneSignal وMoyasar تضيف أنماطاً مضمّنة
  styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.moyasar.com", "https://cdn.onesignal.com", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.moyasar.com", "https://cdn.onesignal.com"],
  // شعارات الصالونات قد تكون base64 أو روابط خارجية
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  connectSrc: ["'self'", ...MOYASAR, ...ONESIGNAL],
  frameSrc: ["'self'", "https://*.moyasar.com", ...ONESIGNAL],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'", "https://*.moyasar.com"],
  frameAncestors: ["'self'"],
  reportUri: ["/api/csp-report"],
};

if (CSP_MODE === "enforce") {
  directives.upgradeInsecureRequests = [];
}

const contentSecurityPolicy =
  CSP_MODE === "off"
    ? false
    : { useDefaults: false, directives, reportOnly: CSP_MODE !== "enforce" };

module.exports = { CSP_MODE, contentSecurityPolicy, directives };
