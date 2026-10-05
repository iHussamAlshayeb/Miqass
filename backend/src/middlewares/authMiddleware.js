const jwt = require("jsonwebtoken");

const Tenant = require("../models/Tenant");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "غير مصرح لك، لا يوجد توكن عبور." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // توكنات العملاء وبوابة الحلاق تُوقَّع بنفس السر وتحمل tenantId،
    // لذا نرفض أي توكن له audience أو scope حتى لا يصل للوحة التحكم.
    if (decoded.aud || decoded.scope) {
      return res
        .status(401)
        .json({ message: "غير مصرح لك، التوكن غير صالح لهذه العملية." });
    }

    // إلغاء الجلسات القديمة بعد تغيير كلمة المرور، ورفض توكنات الحسابات المحذوفة
    const tenant = await Tenant.findById(decoded.tenantId)
      .select("passwordChangedAt deletedAt")
      .lean();
    if (!tenant || tenant.deletedAt) {
      return res
        .status(401)
        .json({ message: "الحساب غير موجود أو موقوف.", isExpired: true });
    }
    if (
      tenant.passwordChangedAt &&
      decoded.iat * 1000 < new Date(tenant.passwordChangedAt).getTime()
    ) {
      return res.status(401).json({
        message: "تم تغيير كلمة المرور، يرجى تسجيل الدخول مجدداً.",
        isExpired: true,
      });
    }

    req.tenantId = decoded.tenantId;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.",
        isExpired: true, // مفتاح إضافي للفرونت إند لعمل Redirect تلقائي
      });
    }

    if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      return res
        .status(401)
        .json({ message: "غير مصرح لك، التوكن غير صالح أو تم التلاعب به." });
    }

    console.error("Auth middleware error:", error.message);
    return res.status(500).json({ message: "تعذر التحقق من الجلسة، حاول مجدداً." });
  }

  // خارج try حتى لا تتحول أخطاء المسارات اللاحقة إلى 401
  return next();
};

module.exports = { protect };
