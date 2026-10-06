const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Tenant = require("../../models/Tenant");
const Customer = require("../../models/Customer");
const { encrypt, decrypt } = require("../../utils/encryption");

// الكشك خدمة داخلية للصالون. يُفعَّل الجهاز إما من لوحة التحكم مباشرة، أو برمز تفعيل
// من 6 أرقام يظهر لصاحب الصالون. الجهاز المفعّل يحمل مفتاحاً خاصاً (JWT aud=kiosk).
// - قفل الكشك (kioskLockEnabled) مفعّل للصالونات الجديدة، ومطفأ للصالونات القديمة حتى يشغّله صاحبها.
// - الأسماء المحفوظة للعملاء لا تظهر إلا لجهاز مفعّل، سواء كان القفل مفعلاً أم لا.
const KIOSK_TOKEN_AUDIENCE = "kiosk";
const KIOSK_TOKEN_TTL = "365d";
const CODE_MAX_FAILURES = 10;
const CODE_LOCK_MS = 15 * 60 * 1000;

const signKioskToken = ({ tenantId, version }) =>
  jwt.sign(
    { tenantId: String(tenantId), scope: KIOSK_TOKEN_AUDIENCE, v: Number(version) || 0 },
    process.env.JWT_SECRET,
    { audience: KIOSK_TOKEN_AUDIENCE, expiresIn: KIOSK_TOKEN_TTL },
  );

const verifyKioskToken = (token) =>
  jwt.verify(String(token || ""), process.env.JWT_SECRET, { audience: KIOSK_TOKEN_AUDIENCE });

const isKioskLockEnabled = (tenant) => tenant?.kioskLockEnabled === true;

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

// هل يُسمح بعمليات الكشك (الحلاقة المباشرة والحجز المتأخر)؟
const isKioskRequestAllowed = (req, tenant) =>
  !isKioskLockEnabled(tenant) || hasActiveKioskAccess(req, tenant);

const generateActivationCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const KIOSK_TENANT_FIELDS =
  "_id slug deletedAt kioskTokenVersion kioskLockEnabled kioskActivationCode kioskCodeFailures kioskCodeLockedUntil";

// يرجع رمز التفعيل الحالي، وينشئ رمزاً جديداً إن لم يوجد
const ensureActivationCode = async (tenant) => {
  const existing = decrypt(tenant.kioskActivationCode || "");
  if (/^\d{6}$/.test(existing || "")) return existing;
  const code = generateActivationCode();
  await Tenant.updateOne({ _id: tenant._id }, { $set: { kioskActivationCode: encrypt(code) } });
  return code;
};

// شاشة الكشك: هل يعمل الكشك على هذا الجهاز؟ وهل الجهاز مفعّل؟
const getKioskStatus = async (req, res) => {
  try {
    const slug = String(req.query.slug || "").toLowerCase().trim();
    const tenant = slug ? await Tenant.findOne({ slug }).select(KIOSK_TENANT_FIELDS).lean() : null;
    if (!tenant || tenant.deletedAt) return res.status(404).json({ message: "الصالون غير موجود" });

    const activated = hasActiveKioskAccess(req, tenant);
    if (isKioskLockEnabled(tenant) && !activated) {
      return res.status(401).json({ active: false, activated: false, code: "KIOSK_NOT_ACTIVATED" });
    }
    return res.status(200).json({ active: true, activated, locked: isKioskLockEnabled(tenant) });
  } catch {
    return res.status(500).json({ message: "تعذر التحقق من حالة الكشك." });
  }
};

// شاشة الكشك: تفعيل الجهاز برمز التفعيل
const activateKioskWithCode = async (req, res) => {
  try {
    const slug = String(req.body?.slug || "").toLowerCase().trim();
    const code = String(req.body?.code || "").replace(/\D/g, "");
    if (!slug || code.length !== 6) {
      return res.status(400).json({ message: "اكتب رمز التفعيل المكون من 6 أرقام." });
    }

    const tenant = await Tenant.findOne({ slug }).select(KIOSK_TENANT_FIELDS).lean();
    if (!tenant || tenant.deletedAt) return res.status(404).json({ message: "الصالون غير موجود" });

    if (tenant.kioskCodeLockedUntil && new Date(tenant.kioskCodeLockedUntil) > new Date()) {
      return res.status(429).json({ message: "محاولات خاطئة كثيرة. حاول بعد 15 دقيقة." });
    }

    const expected = decrypt(tenant.kioskActivationCode || "") || "";
    const matches =
      /^\d{6}$/.test(expected) &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code));

    if (!matches) {
      const failures = Number(tenant.kioskCodeFailures || 0) + 1;
      await Tenant.updateOne(
        { _id: tenant._id },
        failures >= CODE_MAX_FAILURES
          ? { $set: { kioskCodeFailures: 0, kioskCodeLockedUntil: new Date(Date.now() + CODE_LOCK_MS) } }
          : { $set: { kioskCodeFailures: failures } },
      );
      return res.status(400).json({ message: "رمز التفعيل غير صحيح." });
    }

    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { kioskCodeFailures: 0, kioskCodeLockedUntil: null } },
    );
    return res.status(200).json({
      token: signKioskToken({ tenantId: tenant._id, version: tenant.kioskTokenVersion }),
    });
  } catch {
    return res.status(500).json({ message: "تعذر تفعيل الجهاز." });
  }
};

// لوحة التحكم: يفعّل الجهاز الحالي ككشك مباشرة (زر «بوابة الكشك»)
const activateKioskDevice = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select("slug kioskTokenVersion").lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.status(200).json({
      token: signKioskToken({ tenantId: tenant._id, version: tenant.kioskTokenVersion }),
      slug: tenant.slug,
    });
  } catch {
    return res.status(500).json({ message: "تعذر تفعيل جهاز الكشك." });
  }
};

// لوحة التحكم: إعدادات الكشك (حالة القفل ورمز التفعيل)
const getKioskSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select(KIOSK_TENANT_FIELDS).lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.status(200).json({
      lockEnabled: isKioskLockEnabled(tenant),
      activationCode: await ensureActivationCode(tenant),
    });
  } catch {
    return res.status(500).json({ message: "تعذر جلب إعدادات الكشك." });
  }
};

const updateKioskSettings = async (req, res) => {
  try {
    if (typeof req.body?.lockEnabled !== "boolean") {
      return res.status(400).json({ message: "قيمة القفل غير صالحة." });
    }
    await Tenant.updateOne({ _id: req.tenantId }, { $set: { kioskLockEnabled: req.body.lockEnabled } });
    return res.status(200).json({
      lockEnabled: req.body.lockEnabled,
      message: req.body.lockEnabled
        ? "تم قفل الكشك. يعمل الآن على الأجهزة المفعّلة فقط."
        : "تم إلغاء قفل الكشك. يعمل الآن على أي جهاز يفتح رابطه.",
    });
  } catch {
    return res.status(500).json({ message: "تعذر حفظ إعدادات الكشك." });
  }
};

// لوحة التحكم: يلغي كل الأجهزة المفعّلة ويغيّر رمز التفعيل
const revokeKioskDevices = async (req, res) => {
  try {
    const code = generateActivationCode();
    await Tenant.updateOne(
      { _id: req.tenantId },
      {
        $inc: { kioskTokenVersion: 1 },
        $set: { kioskActivationCode: encrypt(code), kioskCodeFailures: 0, kioskCodeLockedUntil: null },
      },
    );
    return res.status(200).json({
      message: "تم إلغاء تفعيل جميع أجهزة الكشك وتغيير رمز التفعيل.",
      activationCode: code,
    });
  } catch {
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
  } catch {
    return res.status(500).json({ message: "تعذر جلب بيانات العميل." });
  }
};

module.exports = {
  KIOSK_TOKEN_AUDIENCE,
  signKioskToken,
  verifyKioskToken,
  hasActiveKioskAccess,
  isKioskRequestAllowed,
  getKioskStatus,
  activateKioskWithCode,
  activateKioskDevice,
  getKioskSettings,
  updateKioskSettings,
  revokeKioskDevices,
  getKioskCustomer,
};
