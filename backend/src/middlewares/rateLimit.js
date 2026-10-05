const expressRateLimit = require("express-rate-limit");
const ipaddr = require("ipaddr.js");

const baseRateLimit = expressRateLimit.rateLimit || expressRateLimit;
const { ipKeyGenerator } = expressRateLimit;

const INTERNAL_RANGES = new Set(["private", "loopback", "uniqueLocal", "linkLocal"]);

const isInternalAddress = (address) => {
  try {
    return INTERNAL_RANGES.has(ipaddr.process(String(address || "")).range());
  } catch {
    return false;
  }
};

/**
 * عنوان العميل الحقيقي خلف نفق Cloudflare:
 * cloudflared يتصل بالتطبيق من شبكة Docker الداخلية ويمرر CF-Connecting-IP.
 * لا نثق بهذا الهيدر إلا إذا جاء الطلب فعلاً من عنوان داخلي (أي من النفق)،
 * حتى لا يستطيع أحد تزويره بالاتصال المباشر.
 */
const getClientIp = (req) => {
  const cfIp = String(req.get?.("cf-connecting-ip") || "").trim();
  if (cfIp && ipaddr.isValid(cfIp) && isInternalAddress(req.socket?.remoteAddress)) {
    return ipaddr.process(cfIp).toString();
  }
  return req.ip;
};

// غلاف موحّد لكل حدود المحاولات في المشروع
const rateLimit = (options = {}) =>
  baseRateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
    ...options,
  });

module.exports = rateLimit;
module.exports.getClientIp = getClientIp;
