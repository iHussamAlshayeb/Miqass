const mongoose = require("mongoose");

const barberSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    pin: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    commissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

barberSchema.index({ tenantId: 1, isActive: 1 }, { background: true });

barberSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true, background: true },
);

module.exports = mongoose.model("Barber", barberSchema);
