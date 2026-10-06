const jwt = require("jsonwebtoken");
const Tenant = require("../../models/Tenant");
const Customer = require("../../models/Customer");

// جهاز الكشك داخل الصالون: يفعّله صاحب الصالون من لوحة التحكم فيحصل على مفتاح خاص.
// بهذا المفتاح فقط تظهر الأسماء المحفوظة للعميل دون رمز تحقق؛ رابط الكشك وحده لا يكفي.
const KIOSK_TOKEN_AUDIENCE = "kiosk";
const KIOSK_TOKEN_TTL = "365d";

const signKioskToken = ({ tenantId, version }) =>
  jwt.sign(
    { tenantId: String(tenantId), scope: KIOSK_TOKEN_AUDIENCE, v: Number(version) || 0 },
    process.env.JWT_SECRET,
    { audience: KIOSK_TOKEN_AUDIENCE, expiresIn: KIOSK_TOKEN_TTL },
  );

const verifyKioskToken = (token) =>
  jwt.verify(String(token || ""), process.env.JWT_SECRET, { audience: KIOSK_TOKEN_AUDIENCE });

// هل الطلب قادم من جهاز كشك مفعّل لهذا الصالون؟ (مفتاح صالح لنفس الصالون ونفس إصدار التفعيل)
const hasActiveKioskAccess = (req, tenant) => {
  if (!tenant || tenant.deletedAt) return false;
  try {
    const payload = verifyKioskToken(req.headers?.["x-kiosk-token"]);
    return (
      String(payload.tenantId) === String(tenant._id) &&
      Number(payload.v || 0) === Number(tenant.kioskTokenVersion || 0)
    );
  } catch {
    return false;
  }
};

// شاشة الكشك: تتحقق عند التشغيل أن الجهاز مفعّل لهذا الصالون
const getKioskStatus = async (req, res) => {
  try {
    const payload = verifyKioskToken(req.headers["x-kiosk-token"]);
    const tenant = await Tenant.findById(payload.tenantId).select("_id slug kioskTokenVersion deletedAt").lean();
    if (!hasActiveKioskAccess(req, tenant) || (req.query.slug && tenant.slug !== String(req.query.slug).toLowerCase())) {
      throw new Error("inactive");
    }
    return res.status(200).json({ active: true });
  } catch {
    return res.status(401).json({ active: false, code: "KIOSK_NOT_ACTIVATED" });
  }
};

// لوحة التحكم: يصدر مفتاحاً لجهاز كشك
const activateKioskDevice = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select("slug kioskTokenVersion").lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.status(200).json({
      token: signKioskToken({ tenantId: tenant._id, version: tenant.kioskTokenVersion }),
      slug: tenant.slug,
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذر تفعيل جهاز الكشك." });
  }
};

// لوحة التحكم: يلغي كل أجهزة الكشك المفعّلة سابقاً
const revokeKioskDevices = async (req, res) => {
  try {
    await Tenant.updateOne({ _id: req.tenantId }, { $inc: { kioskTokenVersion: 1 } });
    return res.status(200).json({ message: "تم إلغاء تفعيل جميع أجهزة الكشك." });
  } catch (error) {
    return res.status(500).json({ message: "تعذر إلغاء تفعيل أجهزة الكشك." });
  }
};

// الكشك المفعّل: عدد زيارات العميل وأسماؤه المحفوظة
const getKioskCustomer = async (req, res) => {
  let payload;
  try {
    payload = verifyKioskToken(req.headers["x-kiosk-token"]);
  } catch {
    return res.status(401).json({ message: "جهاز الكشك غير مفعّل.", code: "KIOSK_NOT_ACTIVATED" });
  }

  try {
    const { phone } = req.params;
    if (!/^05\d{8}$/.test(phone || "")) {
      return res.status(400).json({ message: "رقم الجوال غير صالح." });
    }

    const tenant = await Tenant.findById(payload.tenantId).select("_id kioskTokenVersion deletedAt").lean();
    if (!tenant || tenant.deletedAt || Number(tenant.kioskTokenVersion || 0) !== Number(payload.v || 0)) {
      return res.status(401).json({ message: "جهاز الكشك غير مفعّل.", code: "KIOSK_NOT_ACTIVATED" });
    }

    const customer = await Customer.findOne({ tenantId: tenant._id, phone })
      .select("totalVisits children")
      .lean();
    return res.status(200).json({
      visits: customer?.totalVisits || 0,
      children: customer?.children || [],
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذر جلب بيانات العميل." });
  }
};

module.exports = {
  KIOSK_TOKEN_AUDIENCE,
  signKioskToken,
  verifyKioskToken,
  hasActiveKioskAccess,
  getKioskStatus,
  activateKioskDevice,
  revokeKioskDevices,
  getKioskCustomer,
};
