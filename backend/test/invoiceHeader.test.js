const test = require("node:test");
const assert = require("node:assert/strict");
const { riyadhDateTime, zatcaTimestamp, formatSellerAddress, sellerInfo } = require("../src/utils/invoiceHeader");
const { generateZatcaQR } = require("../src/utils/zatca");

const decodeTlv = (base64) => {
  const buffer = Buffer.from(base64, "base64");
  const out = {};
  for (let i = 0; i < buffer.length;) {
    const tag = buffer[i]; const length = buffer[i + 1];
    out[tag] = buffer.subarray(i + 2, i + 2 + length).toString("utf8");
    i += 2 + length;
  }
  return out;
};

test("Riyadh issue date/time uses latin digits and seconds", () => {
  assert.deepEqual(riyadhDateTime("2026-11-15T21:05:09.123Z"), { date: "2026-11-16", time: "00:05:09" });
  assert.deepEqual(riyadhDateTime("bad"), { date: "", time: "" });
});

test("QR timestamp drops milliseconds", () => {
  assert.equal(zatcaTimestamp("2026-11-15T21:05:09.123Z"), "2026-11-15T21:05:09Z");
});

test("seller info prefers the registered legal name for the QR", () => {
  const info = sellerInfo({
    salonName: "صالون النخبة", ownerPhone: "0500000000",
    taxSettings: { taxNumber: "300000000000003", zakaty: { seller: { legalName: "مؤسسة النخبة للحلاقة", crNumber: "1010101010", street: "طريق الملك فهد", buildingNumber: "1234", city: "الرياض", postalCode: "12345" } } },
  });
  assert.equal(info.sellerName, "مؤسسة النخبة للحلاقة");
  assert.equal(info.legalName, "مؤسسة النخبة للحلاقة");
  assert.equal(info.sellerAddress, "1234 طريق الملك فهد، الرياض 12345");
  assert.equal(info.crNumber, "1010101010");
  assert.equal(info.phone, "0500000000");
  const plain = sellerInfo({ salonName: "صالون", taxSettings: { taxNumber: "3" } });
  assert.equal(plain.sellerName, "صالون");
  assert.equal(plain.legalName, "");
  assert.equal(plain.sellerAddress, "");
  assert.equal(formatSellerAddress({ city: "جدة" }), "جدة");
});

test("Phase-1 QR TLV fields decode back exactly", () => {
  const qr = generateZatcaQR("مؤسسة النخبة", "300000000000003", "2026-11-15T21:05:09Z", 90, 11.74);
  assert.deepEqual(decodeTlv(qr), { 1: "مؤسسة النخبة", 2: "300000000000003", 3: "2026-11-15T21:05:09Z", 4: "90.00", 5: "11.74" });
});

test("long Arabic seller names are truncated on a character boundary", () => {
  const qr = generateZatcaQR("ح".repeat(200), "3", "t", 1, 0);
  const name = decodeTlv(qr)[1];
  assert.ok(Buffer.byteLength(name) <= 255);
  assert.ok(!name.includes("�"));
  assert.equal(name, "ح".repeat(127));
});
