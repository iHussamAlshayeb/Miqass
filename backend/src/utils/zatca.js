// لا حاجة لتعريف Buffer لأنها مدمجة (Built-in) في Node.js تلقائياً، ولكن تركها لا يضر
const { Buffer } = require("buffer");

// ==========================================
// 💡 دالة مساعدة لتحويل القيم إلى نظام TLV المدرّعة
// ==========================================
const getTLV = (tag, value) => {
  // 1. 🛡️ الحماية من القيم الفارغة: تحويل أي قيمة إلى نص وتجنب الـ null/undefined
  const stringValue = String(value || "");

  // 2. تحويل النص لـ Buffer بصيغة utf8 (مهم جداً لدعم اللغة العربية)
  const valueBuffer = Buffer.from(stringValue, "utf8");

  // 3. 🚀 الحماية من طفح الذاكرة (Buffer Overflow):
  // ZATCA تقبل بايت واحد فقط للطول (أقصاه 255 بايت).
  // إذا كان الاسم طويلاً جداً (مثلاً اسم صالون يتجاوز 127 حرف عربي)، نقصه بأمان لكي لا يفسد الباركود.
  let safeBuffer = valueBuffer;
  if (valueBuffer.length > 255) {
    safeBuffer = valueBuffer.subarray(0, 255);
  }

  const tagBuffer = Buffer.from([tag]);
  const lengthBuffer = Buffer.from([safeBuffer.length]);

  return Buffer.concat([tagBuffer, lengthBuffer, safeBuffer]);
};

// ==========================================
// 💡 الدالة الرئيسية لتوليد رمز الـ QR المتوافق مع هيئة الزكاة
// ==========================================
const generateZatcaQR = (
  sellerName,
  vatNumber,
  timestamp,
  invoiceTotal,
  vatTotal,
) => {
  try {
    // 🛡️ التغليف بمصفوفة لتسهيل دمجها وتوفير الـ RAM
    const tlvArray = [
      getTLV(1, sellerName), // 1. اسم البائع
      getTLV(2, vatNumber), // 2. الرقم الضريبي
      getTLV(3, timestamp), // 3. تاريخ ووقت الفاتورة
      getTLV(4, Number(invoiceTotal).toFixed(2)), // 4. إجمالي الفاتورة (ضمان وجود خانتين عشريتين)
      getTLV(5, Number(vatTotal).toFixed(2)), // 5. إجمالي الضريبة (ضمان وجود خانتين عشريتين)
    ];

    // دمج جميع البيانات بضربة واحدة
    const combinedBuffer = Buffer.concat(tlvArray);

    // التشفير النهائي بـ Base64
    return combinedBuffer.toString("base64");
  } catch (error) {
    console.error("❌ ZATCA Phase 1 QR Generation Error:", error.message);
    // إرجاع نص فارغ بدلاً من null لتجنب أخطاء الواجهة الأمامية
    return "";
  }
};

module.exports = { generateZatcaQR };
