// أدوات أجهزة نقطة البيع: توكن الجهاز، رموز التفعيل، ورفض الرموز السهلة.
const crypto = require("crypto");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

/** توكن جهاز عشوائي (256 بت) يُعطى للجهاز مرة واحدة ولا يُخزن إلا بصمته */
const newDeviceToken = () => crypto.randomBytes(32).toString("base64url");

// رمز تفعيل لمرة واحدة: 8 خانات بدون الحروف المتشابهة (0/O، 1/I/L)
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newActivationCode = () =>
  Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join("");
const normalizeActivationCode = (value) =>
  (typeof value === "string" ? value : "").toUpperCase().replace(/[\s-]/g, "").slice(0, 16);

const safeEqualHex = (a, b) => {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
};

/** رموز يسهل تخمينها: رقم مكرر (1111)، تسلسل (1234، 9876)، أو نمط متكرر (1212) */
const isWeakPin = (pin) => {
  const digits = String(pin || "");
  if (/^(\d)\1+$/.test(digits)) return true;
  const steps = [...digits].slice(1).map((digit, index) => Number(digit) - Number(digits[index]));
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) return true;
  if (/^(\d{2})\1+$/.test(digits) || /^(\d{3})\1+$/.test(digits) || /^(\d{4})\1$/.test(digits)) return true;
  return ["1122", "2580", "0852", "1004", "2000", "1010", "6969", "1379"].includes(digits);
};

module.exports = { sha256, newDeviceToken, newActivationCode, normalizeActivationCode, safeEqualHex, isWeakPin };
