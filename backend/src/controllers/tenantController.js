const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const Review = require("../models/Review");
const { normalizeBarberLeaves } = require("../utils/barberLeave");

const getTenantBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({
      slug,
      "subscription.status": "Active",
    })
      .select(
        "-password -email -resetPasswordToken -resetPasswordExpires -taxSettings.zatcaCredentials -taxSettings.zakaty -invoiceCounter -whatsappSettings.webhookSecret -paymentSettings.moyasarSecretKey",
      )
      .lean();

    if (!tenant)
      return res
        .status(404)
        .json({ message: "الصالون غير موجود أو أن اشتراكه منتهي." });

    tenant.paymentSettings = {
      isOnlinePaymentEnabled:
        tenant.paymentSettings?.isOnlinePaymentEnabled || false,
      depositAmount: tenant.paymentSettings?.depositAmount || 0,
      provider: "moyasar",
    };

    const [barbers, services, reviews] = await Promise.all([
      Barber.find({ tenantId: tenant._id, isActive: { $ne: false } })
        .select("name +pin isActive leaves iconColor")
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
      iconColor: b.iconColor || "",
      hasPin: !!b.pin,
      leaves: normalizeBarberLeaves(b.leaves),
    }));

    res.status(200).json({ tenant, barbers: safeBarbers, services, reviews });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
};

module.exports = { getTenantBySlug };
