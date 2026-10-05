// مواعيد لوحة التحكم: القادمة والسجل وإعادة الإرسال
const Appointment = require("../../models/Appointment");
const Customer = require("../../models/Customer");
const { sendReminderMessage } = require("../../utils/whatsapp");
const { buildAppointmentHistoryParams } = require("../../utils/appointmentHistory");

// ==========================================
// 🛠️ دالة مساعدة لتجهيز المواعيد للواجهة
// ==========================================
const mapAppointmentForFrontend = (app) => {
  return {
    ...(app._doc ? app._doc : app),
    customerPhone: app.customerId?.phone || "غير معروف",
    chair: app.barberName,
  };
};


// 3. جلب أحدث 200 موعد قادم للإدارة
const getAllUpcomingAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ tenantId: req.tenantId })
      .populate("customerId", "phone parentName children")
      .sort({ date: -1, timeSlot: -1 })
      .limit(200)
      .lean();

    res
      .status(200)
      .json({ appointments: appointments.map(mapAppointmentForFrontend) });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب المواعيد" });
  }
};

const getAppointmentHistory = async (req, res) => {
  let options;
  try {
    options = buildAppointmentHistoryParams(req.query, req.tenantId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    const { query, customer, sort, page, limit } = options;
    if (customer) {
      const matchingCustomers = await Customer.find({ tenantId: req.tenantId, phone: customer })
        .select("_id")
        .lean();
      query.$or = [
        { childName: customer },
        { customerId: { $in: matchingCustomers.map((item) => item._id) } },
      ];
    }

    const [total, appointments] = await Promise.all([
      Appointment.countDocuments(query),
      Appointment.find(query)
        .populate("customerId", "phone parentName children")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      appointments: appointments.map(mapAppointmentForFrontend),
      total,
      page,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب سجل الحجوزات" });
  }
};

// 4. إعادة إرسال رسالة تذكير يدوية لموعد محدد
const resendSingleWhatsApp = async (req, res) => {
  try {
    const { id } = req.params;
    const app = await Appointment.findOne({ _id: id, tenantId: req.tenantId })
      .populate("tenantId")
      .populate("customerId");

    if (!app)
      return res.status(404).json({ message: "لم يتم العثور على الموعد" });

    sendReminderMessage(
      app.customerId.phone,
      app.childName,
      app.timeSlot,
      app.barberName,
      app.tenantId,
    ).catch(() => {});

    res
      .status(200)
      .json({ message: `تم إرسال التذكير لـ ${app.childName} بنجاح! 💬` });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إرسال الرسالة" });
  }
};

module.exports = {
  getAllUpcomingAppointments,
  getAppointmentHistory,
  resendSingleWhatsApp,
};
