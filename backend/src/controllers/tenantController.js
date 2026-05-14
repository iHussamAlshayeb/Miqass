const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const Review = require("../models/Review");
const redisClient = require("../utils/redisClient");

const getTenantBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `tenant_public_profile:${slug}`;

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

    const [barbers, services, reviews] = await Promise.all([
      Barber.find({ tenantId: tenant._id, isActive: { $ne: false } })
        .select("name pin isActive")
        .lean(),

      Service.find({ tenantId: tenant._id, isActive: true })
        .select("name description price duration category")
        .lean(),

      Review.find({
        tenantId: tenant._id,
        rating: { $gte: 4 },
        comment: { $exists: true, $ne: "" },
      })
        .select("customerName rating comment createdAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const safeBarbers = barbers.map((b) => ({
      _id: b._id,
      name: b.name,
      hasPin: !!b.pin,
    }));

    const responseData = {
      tenant,
      barbers: safeBarbers,
      services,
      reviews,
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
