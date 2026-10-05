const Appointment = require("../models/Appointment");
const { sendReviewRequestMessage } = require("../utils/whatsapp");

const createReviewRequester = ({ AppointmentModel, sendMessage }) => async (appointment, tenant) => {
  if (
    appointment.status !== "Completed" ||
    appointment.isReviewRequested ||
    !appointment.customerId?.phone ||
    !tenant.settings?.enableGoogleReviews ||
    !tenant.settings?.googleReviewLink ||
    !tenant.whatsappSettings?.isEnabled
  ) {
    return false;
  }

  const now = new Date();
  const lockUntil = new Date(now.getTime() + 30000);
  const claimed = await AppointmentModel.findOneAndUpdate(
    {
      _id: appointment._id,
      tenantId: tenant._id,
      status: "Completed",
      isReviewRequested: { $ne: true },
      $or: [{ reviewRequestLockUntil: null }, { reviewRequestLockUntil: { $lte: now } }],
    },
    { $set: { reviewRequestLockUntil: lockUntil } },
  );
  if (!claimed) return false;

  let sent = false;
  try {
    sent = await sendMessage(
      appointment.customerId.phone,
      appointment.childName,
      tenant,
      appointment._id,
    );
  } finally {
    await AppointmentModel.updateOne(
      { _id: appointment._id, tenantId: tenant._id, reviewRequestLockUntil: lockUntil },
      { $set: { isReviewRequested: Boolean(sent), reviewRequestLockUntil: null } },
    );
  }
  appointment.isReviewRequested = Boolean(sent);
  return Boolean(sent);
};

const sendReviewAfterCompletion = createReviewRequester({
  AppointmentModel: Appointment,
  sendMessage: sendReviewRequestMessage,
});

module.exports = { sendReviewAfterCompletion, createReviewRequester };
