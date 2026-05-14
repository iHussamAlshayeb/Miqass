const crypto = require("crypto");

const superAdminAuth = (req, res, next) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    const secret = process.env.SUPER_ADMIN_SECRET;

    if (!secret) {
      console.error(
        "🚨 خطر أمني: لم يتم إعداد SUPER_ADMIN_SECRET في ملف .env!",
      );
      return res
        .status(500)
        .json({ message: "خطأ داخلي في إعدادات حماية السيرفر." });
    }

    if (!adminKey) {
      return res
        .status(403)
        .json({ message: "عذراً، غير مصرح لك بالدخول لهذه الصفحة 🛑" });
    }

    const secretBuffer = Buffer.from(secret);
    const keyBuffer = Buffer.from(adminKey);

    if (
      secretBuffer.length !== keyBuffer.length ||
      !crypto.timingSafeEqual(secretBuffer, keyBuffer)
    ) {
      return res
        .status(403)
        .json({ message: "عذراً، المفتاح غير صحيح أو غير مصرح لك 🛑" });
    }

    next();
  } catch (error) {
    console.error("Super Admin Auth Error:", error);
    res
      .status(500)
      .json({ message: "حدث خطأ أثناء التحقق من الصلاحيات المتقدمة." });
  }
};

module.exports = superAdminAuth;
