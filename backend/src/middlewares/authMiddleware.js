const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  let token;

  // 1. التحقق من وجود التوكن في الهيدر بالصيغة الصحيحة
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 2. رفض الطلب فوراً إذا لم يكن هناك توكن
  if (!token) {
    return res.status(401).json({ message: "غير مصرح لك، لا يوجد توكن عبور." });
  }

  try {
    // 3. 🚀 فك التشفير (بدون كلمات سر افتراضية لحماية النظام من الاختراق)
    // إذا كان JWT_SECRET مفقوداً، سيرمي خطأ وسيتم التقاطه في الـ catch
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ⭐ السر هنا: نأخذ الـ ID من التوكن الموثوق ونضعه في الـ req
    req.tenantId = decoded.tenantId;

    next();
  } catch (error) {
    // 4. 💡 توجيه ذكي للفرونت إند: التمييز بين انتهاء الصلاحية والتلاعب
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.",
        isExpired: true, // مفتاح إضافي للفرونت إند لعمل Redirect تلقائي
      });
    }

    return res
      .status(401)
      .json({ message: "غير مصرح لك، التوكن غير صالح أو تم التلاعب به." });
  }
};

module.exports = { protect };
