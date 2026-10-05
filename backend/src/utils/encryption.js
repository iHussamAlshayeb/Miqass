const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY must be configured in production.");
}

const KEY_MATERIAL = ENCRYPTION_KEY || "local_development_key_only";

// ⚠️ ENCRYPTION_KEY يجب ألا يتغير، وإلا تعذّر فك تشفير الأسرار المخزنة.
// المفاتيح تُشتق مرة واحدة عند التشغيل بدل كل عملية.
// v1 (قديم): AES-256-CBC بمفتاح scrypt وملح ثابت — للقراءة فقط.
const LEGACY_KEY = crypto.scryptSync(KEY_MATERIAL, "salt", 32);
// v2: AES-256-GCM (تشفير + تحقق من سلامة البيانات) بمفتاح HKDF مستقل.
const V2_KEY = Buffer.from(
  crypto.hkdfSync("sha256", KEY_MATERIAL, "miqass/encryption/v2", "aes-256-gcm", 32),
);

const V2_PATTERN = /^v2:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/;
const LEGACY_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/;

const isEncrypted = (value) =>
  typeof value === "string" && (V2_PATTERN.test(value) || LEGACY_PATTERN.test(value));

const isLegacyEncrypted = (value) =>
  typeof value === "string" && LEGACY_PATTERN.test(value);

const encrypt = (text) => {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", V2_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

const decryptLegacy = (text) => {
  const [ivHex, ...rest] = text.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    LEGACY_KEY,
    Buffer.from(ivHex, "hex"),
  );
  return Buffer.concat([
    decipher.update(Buffer.from(rest.join(":"), "hex")),
    decipher.final(),
  ]).toString();
};

const decryptV2 = (text) => {
  const [, ivHex, tagHex, dataHex] = text.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", V2_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
};

/**
 * يفك تشفير v2 أو الصيغة القديمة.
 * القيمة غير المشفرة تُعاد كما هي (للتوافق مع بيانات لم تُرحَّل بعد).
 * عند فشل فك التشفير (مفتاح خاطئ أو بيانات معدّلة) تُعاد null.
 */
const decrypt = (text) => {
  if (!text || !isEncrypted(text)) return text;
  try {
    return text.startsWith("v2:") ? decryptV2(text) : decryptLegacy(text);
  } catch (error) {
    console.error("❌ خطأ في فك التشفير:", error.message);
    return null;
  }
};

// للبحث عن سرّ دون تخزينه صريحاً (مثل مفتاح واتساب في الـ webhook)
const hashForLookup = (value) =>
  value
    ? crypto.createHmac("sha256", V2_KEY).update(String(value)).digest("hex")
    : null;

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  isLegacyEncrypted,
  hashForLookup,
};
