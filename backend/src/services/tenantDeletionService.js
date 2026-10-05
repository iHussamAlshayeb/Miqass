const Tenant = require("../models/Tenant");
const Appointment = require("../models/Appointment");
const Review = require("../models/Review");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");
const Invoice = require("../models/Invoice");
const NotificationDelivery = require("../models/NotificationDelivery");
const PushDevice = require("../models/PushDevice");
const redisClient = require("../utils/redisClient");

// مدة الاحتفاظ بالصالون المحذوف قبل الحذف النهائي
const RETENTION_DAYS = 30;
const ACTIVE_CAMPAIGN_STATUSES = ["Pending", "Processing"];

// كل البيانات المرتبطة بالصالون — تُحذف نهائياً فقط عند انتهاء مدة الاحتفاظ
const TENANT_SCOPED_MODELS = [
  Appointment, Review, Campaign, Customer, Barber, Service,
  Sale, SaleItem, Payment, Expense, Product, InventoryMovement, Invoice,
  NotificationDelivery, PushDevice,
];

const httpError = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

const clearTenantCache = async (slug) => {
  try {
    await redisClient.del(`tenant_public_profile:${slug}`);
  } catch {}
};

/**
 * حذف مؤقت: يُخفى الصالون ويتوقف كل شيء (الحجز، الدخول، واتساب، الحملات)
 * مع حفظ الحالة السابقة لاسترجاعها كما كانت.
 */
const softDeleteTenant = async (tenantId, confirmSlug) => {
  const tenant = await Tenant.findById(tenantId)
    .select("slug salonName subscription.status whatsappSettings.isEnabled deletedAt")
    .lean();
  if (!tenant) throw httpError("الصالون غير موجود", 404);
  if (tenant.deletedAt) throw httpError("الصالون محذوف بالفعل", 409);
  if (typeof confirmSlug !== "string" || confirmSlug.trim().toLowerCase() !== tenant.slug) {
    throw httpError("رابط الصالون المكتوب للتأكيد غير مطابق", 400);
  }

  const activeCampaigns = await Campaign.find({
    tenantId: tenant._id,
    status: { $in: ACTIVE_CAMPAIGN_STATUSES },
  })
    .select("_id")
    .lean();

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await Tenant.updateOne(
    { _id: tenant._id, deletedAt: null },
    {
      $set: {
        deletedAt: now,
        deletionInfo: {
          purgeAfter,
          previousStatus: tenant.subscription?.status || "Active",
          previousWhatsappEnabled: Boolean(tenant.whatsappSettings?.isEnabled),
          pausedCampaignIds: activeCampaigns.map((campaign) => campaign._id),
        },
        "subscription.status": "Inactive",
        "whatsappSettings.isEnabled": false,
      },
    },
  );

  if (activeCampaigns.length) {
    await Campaign.updateMany(
      { _id: { $in: activeCampaigns.map((campaign) => campaign._id) } },
      { $set: { status: "Paused", lockOwner: null, lockExpiresAt: null } },
    );
  }

  await clearTenantCache(tenant.slug);
  return { salonName: tenant.salonName, purgeAfter };
};

const restoreTenant = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId)
    .select("slug salonName deletedAt deletionInfo")
    .lean();
  if (!tenant) throw httpError("الصالون غير موجود", 404);
  if (!tenant.deletedAt) throw httpError("الصالون غير محذوف", 400);

  const info = tenant.deletionInfo || {};
  await Tenant.updateOne(
    { _id: tenant._id },
    {
      $set: {
        "subscription.status": info.previousStatus || "Active",
        "whatsappSettings.isEnabled": Boolean(info.previousWhatsappEnabled),
        deletedAt: null,
      },
      $unset: { deletionInfo: "" },
    },
  );

  if (info.pausedCampaignIds?.length) {
    await Campaign.updateMany(
      { _id: { $in: info.pausedCampaignIds }, status: "Paused" },
      { $set: { status: "Pending", nextRunAt: new Date() } },
    );
  }

  await clearTenantCache(tenant.slug);
  return { salonName: tenant.salonName };
};

// حذف نهائي — لا يُستدعى إلا لصالون محذوف مؤقتاً انتهت مدة الاحتفاظ به
const purgeTenant = async (tenantId) => {
  const tenant = await Tenant.findOne({ _id: tenantId, deletedAt: { $ne: null } })
    .select("slug")
    .lean();
  if (!tenant) return false;

  await Promise.all(
    TENANT_SCOPED_MODELS.map((Model) => Model.deleteMany({ tenantId: tenant._id })),
  );
  await Tenant.deleteOne({ _id: tenant._id });
  await clearTenantCache(tenant.slug);
  return true;
};

const purgeExpiredTenants = async (now = new Date()) => {
  const expired = await Tenant.find({
    deletedAt: { $ne: null },
    "deletionInfo.purgeAfter": { $lte: now },
  })
    .select("_id salonName")
    .lean();

  for (const tenant of expired) {
    await purgeTenant(tenant._id);
    console.log(`🗑️ حذف نهائي للصالون ${tenant.salonName} بعد انتهاء مدة الاحتفاظ.`);
  }
  return expired.length;
};

module.exports = {
  RETENTION_DAYS,
  softDeleteTenant,
  restoreTenant,
  purgeTenant,
  purgeExpiredTenants,
};
