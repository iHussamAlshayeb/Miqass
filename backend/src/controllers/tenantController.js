const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const Review = require("../models/Review");
const { normalizeBarberLeaves } = require("../utils/barberLeave");
const { publicLogoUrl } = require("../utils/logoImage");

// قائمة سماح: هذا المسار عام (صفحة الحجز والكشك وبوابة الحلاق)،
// فلا يُرجع إلا ما تحتاجه هذه الصفحات. أي حقل جديد في Tenant يبقى مخفياً افتراضياً.
const PUBLIC_TENANT_FIELDS = [
  "_id",
  "salonName",
  "slug",
  "ownerName",
  "bio",
  "socialLinks",
  "branding",
  "settings.startTime",
  "settings.endTime",
  "settings.slotDuration",
  "settings.breakStart",
  "settings.breakEnd",
  "settings.closedDates",
  "settings.maxBookingDate",
  "settings.locationUrl",
  "settings.contactPhone",
  "ownerPhone",
  "settings.isLoyaltyEnabled",
  "settings.loyaltyVisitsRequired",
  "whatsappSettings.isEnabled",
  "paymentSettings.isOnlinePaymentEnabled",
  "paymentSettings.depositAmount",
].join(" ");

const getTenantBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || "");

    const tenant = await Tenant.findOne({
      slug,
      "subscription.status": "Active",
    })
      .select(PUBLIC_TENANT_FIELDS)
      .lean();

    if (!tenant)
      return res
        .status(404)
        .json({ message: "الصالون غير موجود أو أن اشتراكه منتهي." });

    // رقم التواصل العام: المخصص في الإعدادات، وإلا جوال المالك (يُرسل أصلاً في رسائل واتساب للعملاء)
    tenant.contactPhone = tenant.settings?.contactPhone || tenant.ownerPhone || "";
    delete tenant.ownerPhone;
    if (tenant.settings) delete tenant.settings.contactPhone;

    if (tenant.branding) {
      tenant.branding.logoUrl = publicLogoUrl(tenant.slug, tenant.branding.logoUrl);
    }
    tenant.whatsappSettings = {
      isEnabled: Boolean(tenant.whatsappSettings?.isEnabled),
    };
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

module.exports = { getTenantBySlug, PUBLIC_TENANT_FIELDS };
