const crypto = require("crypto");

// ⚠️ يجب إضافة هذا المتغير في ملف .env
// عبارة عن نص عشوائي طويل (32 حرف/بايت) مثل:
// ENCRYPTION_KEY=my_super_secret_key_that_is_32_bytes_long.
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default_secret_key_must_be_32_char";
const IV_LENGTH = 16; // لعملية AES

// دالة التشفير
const encrypt = (text) => {
  if (!text) return text;
  // التأكد من أن المفتاح طوله 32 بايت بالضبط
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

// دالة فك التشفير
const decrypt = (text) => {
  if (!text || !text.includes(":")) return text;
  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error("❌ خطأ في فك التشفير:", error.message);
    return null;
  }
};

module.exports = { encrypt, decrypt };
