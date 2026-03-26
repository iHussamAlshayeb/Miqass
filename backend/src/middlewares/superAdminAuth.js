const crypto = require("crypto");

const superAdminAuth = (req, res, next) => {
  try {
    // 1. استخراج المفتاح من الهيدر
    const adminKey = req.headers["x-admin-key"];
    const secret = process.env.SUPER_ADMIN_SECRET;

    // 🛡️ حماية السيرفر من النسيان (Fail-Safe):
    // إذا نسيت وضع المفتاح في .env، يجب أن يُغلق النظام بالكامل ولا يقبل أي مفتاح فارغ!
    if (!secret) {
      console.error(
        "🚨 خطر أمني: لم يتم إعداد SUPER_ADMIN_SECRET في ملف .env!",
      );
      return res
        .status(500)
        .json({ message: "خطأ داخلي في إعدادات حماية السيرفر." });
    }

    // الرفض الفوري إذا لم يرسل المستخدم أي مفتاح
    if (!adminKey) {
      return res
        .status(403)
        .json({ message: "عذراً، غير مصرح لك بالدخول لهذه الصفحة 🛑" });
    }

    // 🚀 2. الحماية من هجمات التوقيت (Timing Attacks)
    // نحول النصوص إلى Buffers لنتمكن من مقارنتها بشكل آمن
    const secretBuffer = Buffer.from(secret);
    const keyBuffer = Buffer.from(adminKey);

    // دالة timingSafeEqual تشترط تطابق طول الـ Buffers أولاً لتجنب توقف السيرفر
    if (
      secretBuffer.length !== keyBuffer.length ||
      !crypto.timingSafeEqual(secretBuffer, keyBuffer)
    ) {
      return res
        .status(403)
        .json({ message: "عذراً، المفتاح غير صحيح أو غير مصرح لك 🛑" });
    }

    // إذا مر بكل الاختبارات الأمنية، نسمح له بالمرور للوحة التحكم
    next();
  } catch (error) {
    console.error("Super Admin Auth Error:", error);
    res
      .status(500)
      .json({ message: "حدث خطأ أثناء التحقق من الصلاحيات المتقدمة." });
  }
};

module.exports = superAdminAuth;
