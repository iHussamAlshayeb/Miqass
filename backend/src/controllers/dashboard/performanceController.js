// لوحة الأداء: ملخص محسوب في الخادم لكامل الفترة (بدل أحدث 200 موعد)
const Appointment = require("../../models/Appointment");
const { formatKsaDate } = require("../booking/helpers");
const { resolvePeriod, buildPerformanceSummary } = require("../../utils/performanceSummary");

const getPerformanceSummary = async (req, res) => {
  try {
    const range = resolvePeriod(String(req.query.period || ""), formatKsaDate());
    const appointments = await Appointment.find({
      tenantId: req.tenantId,
      date: { $gte: range.prevFrom, $lte: range.to },
      status: { $in: ["Booked", "Completed", "Cancelled"] },
    })
      .select("date timeSlot status totalPrice barberName selectedServices.name selectedServices.price cancelReason bookingSource isWalkIn")
      .lean();

    res.status(200).json(buildPerformanceSummary(appointments, range));
  } catch (error) {
    res.status(500).json({ message: "تعذر حساب مؤشرات الأداء" });
  }
};

module.exports = { getPerformanceSummary };
