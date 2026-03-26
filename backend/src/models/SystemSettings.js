const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    // 💡 حقل مخفي لضمان وجود سجل واحد فقط في كل قاعدة البيانات
    isGlobal: {
      type: Boolean,
      default: true,
      unique: true, // 👈 الفهرس السحري الذي يمنع إنشاء سجل ثاني!
    },
    // هل وضع الصيانة مفعل؟
    isMaintenanceMode: {
      type: Boolean,
      default: false,
    },
    // الرسالة التي ستظهر للعملاء والصالونات
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
