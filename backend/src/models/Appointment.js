const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barber",
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },

    date: { type: String, required: true },
    timeSlot: { type: String, required: true },

    childName: { type: String, required: true },
    barberName: { type: String, required: true },

    selectedServices: [
      {
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
        name: String,
        price: Number,
        duration: Number,
      },
    ],

    totalPrice: {
      type: Number,
      default: 0,
    },
    totalDuration: {
      type: Number,
      default: 30,
    },

    status: {
      type: String,
      enum: ["Pending_Payment", "Booked", "Completed", "Cancelled", "Blocked"],
      default: "Booked",
    },
    cancelReason: {
      type: String,
      default: null,
    },

    isReminded: {
      type: Boolean,
      default: false,
    },
    isReviewRequested: {
      type: Boolean,
      default: false,
    },
    invoiceNumber: {
      type: String,
    },

    payment: {
      status: {
        type: String,
        enum: ["Not_Required", "Pending", "Paid", "Failed", "Refunded"],
        default: "Not_Required",
      },
      amount: { type: Number, default: 0 },
      moyasarPaymentId: { type: String, default: null },
      method: { type: String, default: null },
    },
  },
  { timestamps: true },
);

appointmentSchema.index(
  { tenantId: 1, date: 1, timeSlot: 1, barberId: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "Cancelled" } } },
);

appointmentSchema.index({ tenantId: 1, customerId: 1 }, { background: true });

appointmentSchema.index(
  { tenantId: 1, date: 1, barberName: 1, status: 1 },
  { background: true },
);

appointmentSchema.index(
  { status: 1, isReminded: 1, date: 1 },
  { background: true },
);

appointmentSchema.index(
  { status: 1, isReviewRequested: 1, date: 1 },
  { background: true },
);

appointmentSchema.index(
  { tenantId: 1, status: 1, date: -1 },
  { background: true },
);

appointmentSchema.index(
  { status: 1, createdAt: 1 },
  { background: true, partialFilterExpression: { status: "Pending_Payment" } },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
