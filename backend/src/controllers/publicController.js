const Tenant = require("../models/Tenant");
const Appointment = require("../models/Appointment");
const Customer = require("../models/Customer");
const SystemSettings = require("../models/SystemSettings");

const getPlatformStats = async (req, res) => {
  try {
    const [salonsCount, appointmentsCount, customersCount] = await Promise.all([
      Tenant.estimatedDocumentCount(),
      Appointment.estimatedDocumentCount(),
      Customer.estimatedDocumentCount(),
    ]);

    res.status(200).json({
      salons: salonsCount > 0 ? salonsCount : 1,
      appointments: appointmentsCount > 0 ? appointmentsCount : 150,
      customers: customersCount > 0 ? customersCount : 300,
    });
  } catch (error) {
    res.status(500).json({ message: "خطأ في جلب الإحصائيات" });
  }
};

const getPublicPricing = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne({ isGlobal: true }).lean();
    res.status(200).json({
      pricing: settings?.pricing || { pro: 99, premium: 199 },
      discount: settings?.discount || {
        isActive: false,
        percentage: 0,
        name: "",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب الأسعار" });
  }
};

const getTopClients = async (req, res) => {
  try {
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

    res.status(200).json(formattedClients);
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ داخلي" });
  }
};

module.exports = { getPlatformStats, getPublicPricing, getTopClients };
