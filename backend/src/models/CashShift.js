const mongoose = require("mongoose");

// وردية الكاشير: تُفتح بمبلغ بداية في الصندوق، وتُغلق بعدّ النقد الفعلي ومقارنته بالمتوقع
const cashShiftSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    status: { type: String, enum: ["Open", "Closed"], default: "Open" },
    openedAt: { type: Date, default: Date.now },
    openedBy: { type: String, default: "", trim: true },
    openingCash: { type: Number, required: true, min: 0 },

    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: "", trim: true },
    countedCash: { type: Number, default: null },
    expectedCash: { type: Number, default: null },
    cashDifference: { type: Number, default: null },
    closingNote: { type: String, default: "", trim: true },
    // لقطة من ملخص الوردية وقت الإغلاق
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

// وردية مفتوحة واحدة فقط لكل صالون
cashShiftSchema.index(
  { tenantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "Open" } },
);
cashShiftSchema.index({ tenantId: 1, openedAt: -1 });

module.exports = mongoose.model("CashShift", cashShiftSchema);
