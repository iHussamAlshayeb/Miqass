const mongoose = require("mongoose");

const pushDeviceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    subscriptionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 200,
    },
    externalId: { type: String, default: "", trim: true, maxlength: 250 },
    platform: { type: String, default: "web", trim: true, maxlength: 40 },
    active: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
    disabledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

pushDeviceSchema.index(
  { tenantId: 1, active: 1, lastSeenAt: -1 },
  { background: true },
);

module.exports = mongoose.model("PushDevice", pushDeviceSchema);
