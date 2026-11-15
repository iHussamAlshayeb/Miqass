const { Buffer } = require("buffer");

const getTLV = (tag, value) => {
  const stringValue = String(value || "");

  const valueBuffer = Buffer.from(stringValue, "utf8");

  // الطول بايت واحد: نقص بحدود الحروف حتى لا ينكسر حرف عربي متعدد البايتات
  let safeBuffer = valueBuffer;
  if (valueBuffer.length > 255) {
    let chars = Array.from(stringValue);
    while (Buffer.byteLength(chars.join(""), "utf8") > 255) chars = chars.slice(0, -1);
    safeBuffer = Buffer.from(chars.join(""), "utf8");
  }

  const tagBuffer = Buffer.from([tag]);
  const lengthBuffer = Buffer.from([safeBuffer.length]);

  return Buffer.concat([tagBuffer, lengthBuffer, safeBuffer]);
};

const generateZatcaQR = (
  sellerName,
  vatNumber,
  timestamp,
  invoiceTotal,
  vatTotal,
) => {
  try {
    const tlvArray = [
      getTLV(1, sellerName),
      getTLV(2, vatNumber),
      getTLV(3, timestamp),
      getTLV(4, Number(invoiceTotal).toFixed(2)),
      getTLV(5, Number(vatTotal).toFixed(2)),
    ];

    const combinedBuffer = Buffer.concat(tlvArray);

    return combinedBuffer.toString("base64");
  } catch (error) {
    console.error("❌ ZATCA Phase 1 QR Generation Error:", error.message);
    return "";
  }
};

module.exports = { generateZatcaQR };
