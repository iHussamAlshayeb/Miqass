// دخول نقطة البيع: المالك بتوكن لوحة التحكم، أو الكاشير بتوكن خاص لا يفتح غير نقطة البيع.
const jwt = require("jsonwebtoken");
const Cashier = require("../models/Cashier");
const PosDevice = require("../models/PosDevice");
const Tenant = require("../models/Tenant");
const { protect } = require("../middlewares/authMiddleware");

const POS_TOKEN_AUDIENCE = "pos";
const POS_TOKEN_SCOPE = "pos";
// وردية طويلة؛ بعدها يعيد الكاشير إدخال رمزه
const POS_TOKEN_TTL = "14h";

const signPosToken = ({ tenantId, cashierId, deviceId }) =>
  jwt.sign(
    { tenantId: String(tenantId), cashierId: String(cashierId), deviceId: String(deviceId), scope: POS_TOKEN_SCOPE },
    process.env.JWT_SECRET,
    { audience: POS_TOKEN_AUDIENCE, expiresIn: POS_TOKEN_TTL },
  );

const bearerToken = (req) => {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

const unauthorized = (res, message = "سجل الدخول إلى نقطة البيع.") =>
  res.status(401).json({ message, isExpired: true });

/**
 * يقبل توكن الكاشير (aud=pos) ويتحقق أن الكاشير ما زال مفعلاً،
 * وإلا يمرر الطلب لحماية لوحة التحكم (توكن المالك) كما هي.
 */
const posAuth = async (req, res, next) => {
  const token = bearerToken(req);
  let decoded = null;
  try {
    decoded = token ? jwt.verify(token, process.env.JWT_SECRET, { audience: POS_TOKEN_AUDIENCE }) : null;
  } catch (error) {
    // ليس توكن كاشير صالحاً: إن كان توكن كاشير منتهياً نطلب الدخول، وغير ذلك تقرر حماية المالك
    const payload = jwt.decode(token);
    if (payload?.aud === POS_TOKEN_AUDIENCE) return unauthorized(res, "انتهت جلسة الكاشير، أدخل رمزك من جديد.");
    return protect(req, res, () => { req.posRole = "owner"; next(); });
  }
  if (!decoded) return protect(req, res, () => { req.posRole = "owner"; next(); });
  if (decoded.scope !== POS_TOKEN_SCOPE || !decoded.cashierId || !decoded.deviceId) return unauthorized(res);

  try {
    const [cashier, tenant, device] = await Promise.all([
      Cashier.findOne({ _id: decoded.cashierId, tenantId: decoded.tenantId, isActive: true }).select("name").lean(),
      Tenant.findById(decoded.tenantId).select("deletedAt").lean(),
      // إلغاء الجهاز من الإعدادات يوقف جلساته فوراً
      PosDevice.findOne({ _id: decoded.deviceId, tenantId: decoded.tenantId, revokedAt: null }).select("_id").lean(),
    ]);
    if (!device) return res.status(401).json({ message: "أُلغي تفعيل هذا الجهاز لنقطة البيع.", code: "POS_DEVICE_NOT_ACTIVATED" });
    if (!cashier || !tenant || tenant.deletedAt) return unauthorized(res, "حساب الكاشير موقوف أو محذوف.");
    req.tenantId = decoded.tenantId;
    req.posRole = "cashier";
    req.cashier = { id: String(cashier._id), name: cashier.name };
    req.posDeviceId = String(device._id);
  } catch (error) {
    console.error("POS auth error:", error.message);
    return res.status(500).json({ message: "تعذر التحقق من الجلسة، حاول مجدداً." });
  }
  return next();
};

module.exports = { POS_TOKEN_AUDIENCE, signPosToken, posAuth };
