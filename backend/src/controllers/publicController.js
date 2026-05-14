const Tenant = require("../models/Tenant");
const Appointment = require("../models/Appointment");
const Customer = require("../models/Customer");
const SystemSettings = require("../models/SystemSettings");
const redisClient = require("../utils/redisClient");

const getPlatformStats = async (req, res) => {
  try {
    const cacheKey = "platform_stats_public";

    const cachedStats = await redisClient.get(cacheKey).catch(() => null);
    if (cachedStats) return res.status(200).json(JSON.parse(cachedStats));

    const [salonsCount, appointmentsCount, customersCount] = await Promise.all([
      Tenant.estimatedDocumentCount(),
      Appointment.estimatedDocumentCount(),
      Customer.estimatedDocumentCount(),
    ]);

    const stats = {
      salons: salonsCount > 0 ? salonsCount : 1,
      appointments: appointmentsCount > 0 ? appointmentsCount : 150,
      customers: customersCount > 0 ? customersCount : 300,
    };

    await redisClient
      .setEx(cacheKey, 3600, JSON.stringify(stats))
      .catch(() => null);

    res.status(200).json(stats);
  } catch (error) {
    console.error("❌ خطأ في جلب إحصائيات المنصة:", error);
    res.status(500).json({ message: "خطأ في جلب الإحصائيات" });
  }
};

const getPublicPricing = async (req, res) => {
  try {
    const cacheKey = "system_pricing_public";

    const cachedPricing = await redisClient.get(cacheKey).catch(() => null);
    if (cachedPricing) return res.status(200).json(JSON.parse(cachedPricing));

    const settings = await SystemSettings.findOne({ isGlobal: true }).lean();

    const pricingData = {
      pricing: settings?.pricing || { pro: 99, premium: 199 },
      discount: settings?.discount || {
        isActive: false,
        percentage: 0,
        name: "",
      },
    };

    await redisClient
      .setEx(cacheKey, 43200, JSON.stringify(pricingData))
      .catch(() => null);

    res.status(200).json(pricingData);
  } catch (error) {
    console.error("❌ خطأ في جلب الأسعار العامة:", error);
    res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب الأسعار" });
  }
};

const getTopClients = async (req, res) => {
  try {
    const cacheKey = "top_clients_landing";

    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }
    } catch (e) {}

    const topTenants = await Tenant.find({ "subscription.status": "Active" })
      .sort({ invoiceCounter: -1 })
      .limit(8)
      .select("salonName slug branding.logoUrl")
      .lean();

    const formattedClients = topTenants.map((client) => ({
      id: client._id,
      name: client.salonName,
      slug: client.slug,
      logo:
        client.branding?.logoUrl ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(client.salonName)}&background=3b82f6&color=fff&size=128`,
    }));

    try {
      await redisClient.setEx(
        cacheKey,
        12 * 60 * 60,
        JSON.stringify(formattedClients),
      );
    } catch (e) {}

    res.status(200).json(formattedClients);
  } catch (error) {
    console.error("Error fetching top clients:", error);
    res.status(500).json({ message: "حدث خطأ داخلي" });
  }
};

module.exports = {
  getPlatformStats,
  getPublicPricing,
  getTopClients,
};
