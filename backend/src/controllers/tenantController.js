const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const Review = require("../models/Review");
const redisClient = require("../utils/redisClient");

const getTenantBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `tenant_public_profile_v2:${slug}`;

    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }
    } catch (cacheError) {
      console.error("⚠️ خطأ في الكاش، سيتم الجلب من قاعدة البيانات بصمت.");
    }

    const tenant = await Tenant.findOne({
      slug,
      "subscription.status": "Active",
    })
      .select(
        "-password -email -resetPasswordToken -resetPasswordExpires -taxSettings.zatcaCredentials -invoiceCounter -whatsappSettings.webhookSecret -paymentSettings.moyasarSecretKey",
      )
      .lean();

    if (!tenant) {
      return res
        .status(404)
        .json({ message: "الصالون غير موجود أو أن اشتراكه منتهي." });
    }

    const [barbers, services, rawReviews] = await Promise.all([
      Barber.find({ tenantId: tenant._id, isActive: { $ne: false } })
        .select("name pin isActive")
        .lean(),

      Service.find({ tenantId: tenant._id, isActive: true })
        .select("name description price duration category")
        .lean(),

      // 💡 التعديل هنا: جلب التقييمات واستخراج الاسم من الحجز المرتبط
      Review.find({
        tenantId: tenant._id,
        rating: { $gte: 4 },
        comment: { $exists: true, $ne: "" },
      })
        .populate("appointmentId", "childName") // جلب اسم العميل من الموعد
        .select("rating comment createdAt appointmentId")
        .sort({ createdAt: -1 })
        .limit(10) // 💡 من الأفضل جلب آخر 10 تقييمات فقط لتسريع الصفحة
        .lean(),
    ]);

    const safeBarbers = barbers.map((b) => ({
      _id: b._id,
      name: b.name,
      hasPin: !!b.pin,
    }));

    // 💡 إعادة صياغة التقييمات لتتوافق مع ما يتوقعه الفرونت إند
    const mappedReviews = rawReviews.map((r) => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      customerName: r.appointmentId?.childName || "عميل سعيد",
    }));

    const responseData = {
      tenant,
      barbers: safeBarbers,
      services,
      reviews: mappedReviews, // إرسال التقييمات المجهزة
    };

    try {
      await redisClient.setEx(
        cacheKey,
        12 * 60 * 60,
        JSON.stringify(responseData),
      );
    } catch (cacheError) {}

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching tenant by slug:", error);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
};

module.exports = { getTenantBySlug };
