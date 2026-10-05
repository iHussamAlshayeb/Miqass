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

    iconColor: {
      type: String,
      default: "",
      match: [/^$|^#[0-9a-fA-F]{6}$/, "لون الأيقونة غير صالح"],
    },

    // يُخزَّن مشفراً بـ bcrypt، ولا يُرجَع في الاستعلامات إلا بطلب صريح (+pin)
    pin: {
      type: String,
      default: "",
      select: false,
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

    leaves: [
      {
        type: {
          type: String,
          enum: ["daily", "weekly", "monthly"],
          required: true,
        },
        startDate: { type: String, required: true },
        endDate: { type: String, required: true },
        weekday: { type: Number, min: 0, max: 6 },
      },
    ],
  },
  { timestamps: true },
);

barberSchema.index({ tenantId: 1, isActive: 1 }, { background: true });

barberSchema.index(
  { tenantId: 1, "leaves.startDate": 1, "leaves.endDate": 1 },
  { background: true },
);

barberSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true, background: true },
);

// شبكة أمان: أي رمز يُحفظ عبر save()/create() يُشفَّر تلقائياً
barberSchema.pre("save", async function hashPlainPin() {
  if (!this.isModified("pin") || !this.pin) return;
  const { hashPin, isHashedPin } = require("../utils/barberPin");
  if (!isHashedPin(this.pin)) this.pin = await hashPin(this.pin);
});

module.exports = mongoose.model("Barber", barberSchema);
