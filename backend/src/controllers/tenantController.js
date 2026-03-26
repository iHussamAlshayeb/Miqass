const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const Review = require("../models/Review"); // 💡 1. استيراد موديل التقييمات
const redisClient = require("../utils/redisClient"); // استيراد الكاش

// 1. جلب بيانات الصالون للعميل بناءً على الرابط (Slug)
const getTenantBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `tenant_public_profile:${slug}`;

    // ==========================================
    // 🚀 1. فحص الكاش أولاً (استجابة في 1 ملي ثانية)
    // ==========================================
    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }
    } catch (cacheError) {
      console.error("⚠️ خطأ في الكاش، سيتم الجلب من قاعدة البيانات بصمت.");
    }

    // ==========================================
    // 🐌 2. جلب البيانات من الداتا بيس (إذا لم تكن في الكاش)
    // ==========================================
    const tenant = await Tenant.findOne({
      slug,
      "subscription.status": "Active",
    })
      // 🛡️ زيادة الأمان بإخفاء الحقول الحساسة
      .select(
        "-password -email -resetPasswordToken -resetPasswordExpires -taxSettings.zatcaCredentials -invoiceCounter -whatsappSettings.webhookSecret -paymentSettings.moyasarSecretKey",
      )
      .lean();

    if (!tenant) {
      return res
        .status(404)
        .json({ message: "الصالون غير موجود أو أن اشتراكه منتهي." });
    }

    // ==========================================
    // 💡 3. جلب الحلاقين، الخدمات، والتقييمات المميزة بالتوازي
    // ==========================================
    const [barbers, services, reviews] = await Promise.all([
      Barber.find({ tenantId: tenant._id, isActive: { $ne: false } })
        .select("name pin isActive")
        .lean(),

      Service.find({ tenantId: tenant._id, isActive: true })
        .select("name description price duration category")
        .lean(),

      // 🌟 جلب أفضل 5 تقييمات (4 نجوم فما فوق وتحتوي على نص)
      Review.find({
        tenantId: tenant._id,
        rating: { $gte: 4 },
        comment: { $exists: true, $ne: "" },
      })
        .select("customerName rating comment createdAt")
        .sort({ createdAt: -1 }) // الأحدث أولاً
        .limit(5) // أخذ 5 فقط لتخفيف الكاش
        .lean(),
    ]);

    // 🛡️ 4. حماية أمنية (Security Filtering)
    const safeBarbers = barbers.map((b) => ({
      _id: b._id,
      name: b.name,
      hasPin: !!b.pin,
    }));

    // 💡 تجميع الحزمة النهائية (شاملة التقييمات)
    const responseData = {
      tenant,
      barbers: safeBarbers,
      services,
      reviews, // 🌟 تم إضافة التقييمات هنا لترسل للفرونت إند
    };

    // ==========================================
    // 💾 5. حفظ النتيجة في الكاش للزيارات القادمة (لمدة 12 ساعة)
    // ==========================================
    try {
      await redisClient.setEx(
        cacheKey,
        12 * 60 * 60,
        JSON.stringify(responseData),
      );
    } catch (cacheError) {
      // تجاهل أخطاء الحفظ بصمت لكي لا يتأثر العميل
    }

    // إرسال الحزمة الكاملة
    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching tenant by slug:", error);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
};

module.exports = { getTenantBySlug };
