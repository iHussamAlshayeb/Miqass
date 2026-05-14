const { Buffer } = require("buffer");

const getTLV = (tag, value) => {
  const stringValue = String(value || "");

  const valueBuffer = Buffer.from(stringValue, "utf8");

  let safeBuffer = valueBuffer;
  if (valueBuffer.length > 255) {
    safeBuffer = valueBuffer.subarray(0, 255);
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
