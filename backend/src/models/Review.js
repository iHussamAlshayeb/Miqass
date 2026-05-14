const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    barberId: { type: mongoose.Schema.Types.ObjectId, ref: "Barber" },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
    },

    reply: {
      type: String,
      default: "",
      trim: true,
    },

    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

reviewSchema.index(
  { tenantId: 1, isPublic: 1, createdAt: -1 },
  { background: true },
);

reviewSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

reviewSchema.index({ barberId: 1, rating: 1 }, { background: true });

module.exports = mongoose.model("Review", reviewSchema);
