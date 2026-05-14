const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    isGlobal: {
      type: Boolean,
      default: true,
      unique: true,
    },
    isMaintenanceMode: {
      type: Boolean,
      default: false,
    },
    maintenanceMessage: {
      type: String,
      default:
        "النظام تحت الصيانة الدورية لتقديم خدمة أفضل. سنعود خلال دقائق معدودة! 🛠️✨",
    },
    pricing: {
      pro: { type: Number, default: 99 },
      premium: { type: Number, default: 199 },
    },
    discount: {
      isActive: { type: Boolean, default: false },
      percentage: { type: Number, default: 0 },
      name: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
