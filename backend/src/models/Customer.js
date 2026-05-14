const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    parentName: {
      type: String,
      default: "عميل قيم",
      trim: true,
    },

    children: [{ type: String, trim: true }],

    totalVisits: {
      type: Number,
      default: 0,
    },
    lastVisitDate: {
      type: Date,
    },

    customerType: {
      type: String,
      enum: ["New", "Regular", "VIP", "Blacklisted"],
      default: "New",
    },
  },
  { timestamps: true },
);

customerSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, background: true },
);

customerSchema.index({ tenantId: 1, lastVisitDate: -1 }, { background: true });

customerSchema.index({ tenantId: 1, totalVisits: -1 }, { background: true });

module.exports = mongoose.model("Customer", customerSchema);
