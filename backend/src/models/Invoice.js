const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },

    invoiceNumber: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["Cash", "POS", "ApplePay", "Online"],
      default: "POS",
    },

    totalAmount: { type: Number, required: true },
    vatAmount: { type: Number, required: true },

    zatcaStatus: {
      type: String,
      enum: ["Pending", "Reported", "Failed"],
      default: "Pending",
    },
    zatcaQrCode: { type: String },
  },
  { timestamps: true },
);

invoiceSchema.index(
  { tenantId: 1, invoiceNumber: 1 },
  { unique: true, background: true },
);

invoiceSchema.index({ tenantId: 1, createdAt: -1 }, { background: true });

invoiceSchema.index({ zatcaStatus: 1, createdAt: 1 }, { background: true });

invoiceSchema.index({ tenantId: 1, customerId: 1 }, { background: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
