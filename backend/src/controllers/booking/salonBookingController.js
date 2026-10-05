// عمليات الصالون على المواعيد: الإلغاء وحظر الأوقات وشاشة الطابور
const Appointment = require("../../models/Appointment");
const Tenant = require("../../models/Tenant");
const Customer = require("../../models/Customer");
const Barber = require("../../models/Barber");
const { sendCancellationMessage } = require("../../utils/whatsapp");
const { publicLogoUrl } = require("../../utils/logoImage");
const {
  mapAppointmentForFrontend,
  getNextTimeSlot,
} = require("./helpers");

// 3. إلغاء موعد (سواء من العميل أو الإدارة)
const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { cancelReason } = req.body;

    const updatedAppointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: req.tenantId, saleId: null },
      { status: "Cancelled", cancelReason: cancelReason },
      { returnDocument: "after" },
    ).populate("customerId");

    if (!updatedAppointment) {
      const linked = await Appointment.exists({ _id: appointmentId, tenantId: req.tenantId, saleId: { $ne: null } });
      return res.status(linked ? 409 : 404).json({ message: linked ? "لا يمكن إلغاء حجز مرتبط بعملية بيع." : "لم يتم العثور على الموعد" });
    }

    const tenant = await Tenant.findById(updatedAppointment.tenantId);
    const slotStep = tenant?.settings?.slotDuration || 30;
    const slotsNeeded = Math.ceil(
      (updatedAppointment.totalDuration || slotStep) / slotStep,
    );

    const paddingSlots = [];
    let paddingSlot = updatedAppointment.timeSlot;
    for (let i = 1; i < slotsNeeded; i++) {
      paddingSlot = getNextTimeSlot(paddingSlot, slotStep);
      paddingSlots.push(paddingSlot);
    }

    if (paddingSlots.length > 0) {
      await Appointment.deleteMany({
        tenantId: updatedAppointment.tenantId,
        barberId: updatedAppointment.barberId,
        date: updatedAppointment.date,
        timeSlot: { $in: paddingSlots },
        childName: "Padding Block",
        status: "Blocked",
      });
    }

    if (updatedAppointment.customerId?.phone) {
      sendCancellationMessage(
        updatedAppointment.customerId.phone,
        updatedAppointment.childName,
        updatedAppointment.barberName,
        tenant,
        cancelReason,
      ).catch(() => {});
    }

    res.status(200).json({
      message: "تم إلغاء الموعد بنجاح",
      appointment: mapAppointmentForFrontend(updatedAppointment),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء الموعد" });
  }
};

// 4. جلب الطابور المباشر للعملاء
const getLiveQueue = async (req, res) => {
  try {
    const slug = String(req.params.slug || "");
    const tenant = await Tenant.findOne({ slug, deletedAt: null })
      .select("_id salonName slug branding")
      .lean();

    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const ksaDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }),
    );
    const today = `${ksaDate.getFullYear()}-${String(ksaDate.getMonth() + 1).padStart(2, "0")}-${String(ksaDate.getDate()).padStart(2, "0")}`;

    const [appointments, barbers] = await Promise.all([
      Appointment.find({ tenantId: tenant._id, date: today, status: "Booked" })
        // شاشة عامة: لا جوالات ولا أسعار ولا خدمات — فقط ما يُعرض على الشاشة
        .select("childName timeSlot barberName status")
        .sort({ timeSlot: 1 })
        .lean(),
      Barber.find({ tenantId: tenant._id, isActive: true })
        .select("name iconColor")
        .lean(),
    ]);

    const formattedAppointments = appointments.map((app) => ({
      _id: app._id,
      childName: app.childName,
      timeSlot: app.timeSlot,
      chair: app.barberName,
      status: app.status,
    }));

    res.status(200).json({
      salonName: tenant.salonName,
      // شاشة الطابور تتحدث كل 15 ثانية: نرسل رابط الشعار بدل الصورة نفسها
      branding: {
        ...(tenant.branding || {}),
        logoUrl: publicLogoUrl(tenant.slug, tenant.branding?.logoUrl),
      },
      barbers: barbers.map((b) => b.name),
      // ألوان الحلاقين المخصصة لتلوين أعمدة الشاشة
      barberColors: Object.fromEntries(
        barbers.filter((b) => b.iconColor).map((b) => [b.name, b.iconColor]),
      ),
      appointments: formattedAppointments,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ داخلي" });
  }
};

// 5. حظر الأوقات (تم إبقاؤه هنا لأنه يستخدم مسار /block العام)
const blockTimeSlot = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { date, timeSlot } = req.body;

    const existingAppointment = await Appointment.exists({
      tenantId,
      date,
      timeSlot,
      status: { $in: ["Booked", "Blocked", "Completed"] },
    });

    if (existingAppointment)
      return res
        .status(400)
        .json({ message: "هذا الوقت محجوز أو مغلق مسبقاً" });

    let systemCustomer = await Customer.findOne({
      tenantId,
      phone: "0000000000",
    }).select("_id");
    if (!systemCustomer) {
      systemCustomer = await Customer.create({
        tenantId,
        phone: "0000000000",
        parentName: "SYSTEM",
      });
    }

    const barber = await Barber.findOne({ tenantId }).select("_id name");

    const blockedSlot = await Appointment.create({
      tenantId,
      customerId: systemCustomer._id,
      barberId: barber ? barber._id : null,
      barberName: barber ? barber.name : "SYSTEM",
      childName: "إغلاق",
      date,
      timeSlot,
      status: "Blocked",
    });

    res.status(201).json({
      message: "تم حظر الوقت بنجاح",
      appointment: mapAppointmentForFrontend(blockedSlot),
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء حظر الوقت" });
  }
};

module.exports = {
  cancelAppointment,
  getLiveQueue,
  blockTimeSlot,
};
