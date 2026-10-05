const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PIN_PATTERN = /^\d{4,8}$/;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;
const PIN_SALT_ROUNDS = 10;

const BARBER_TOKEN_AUDIENCE = "barber-portal";
const BARBER_TOKEN_TTL = "12h";

const isHashedPin = (value) => BCRYPT_PATTERN.test(String(value || ""));

// يقبل نصاً أو رقماً فقط؛ أي كائن (مثل {"$ne": null}) يتحول إلى نص فارغ
const normalizePinInput = (value) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

const isValidPin = (pin) => PIN_PATTERN.test(String(pin || ""));

const hashPin = (pin) => bcrypt.hash(String(pin), PIN_SALT_ROUNDS);

/**
 * يقارن الرمز المدخل بالمخزن.
 * - حلاق بلا رمز: يُسمح بالدخول برمز فارغ فقط (نفس السلوك السابق).
 * - رمز قديم مخزن كنص صريح: مقارنة آمنة زمنياً + needsUpgrade لتشفيره فوراً.
 */
const verifyPin = async (storedPin, providedPin) => {
  const stored = String(storedPin || "");
  const input = normalizePinInput(providedPin);

  if (!stored) return { ok: input === "", needsUpgrade: false };
  if (!input) return { ok: false, needsUpgrade: false };

  if (isHashedPin(stored)) {
    return { ok: await bcrypt.compare(input, stored), needsUpgrade: false };
  }

  const storedBuffer = Buffer.from(stored);
  const inputBuffer = Buffer.from(input);
  const ok =
    storedBuffer.length === inputBuffer.length &&
    crypto.timingSafeEqual(storedBuffer, inputBuffer);
  return { ok, needsUpgrade: ok };
};

const signBarberToken = ({ tenantId, barberId }) =>
  jwt.sign(
    {
      tenantId: String(tenantId),
      barberId: String(barberId),
      scope: BARBER_TOKEN_AUDIENCE,
    },
    process.env.JWT_SECRET,
    { audience: BARBER_TOKEN_AUDIENCE, expiresIn: BARBER_TOKEN_TTL },
  );

const verifyBarberToken = (token) =>
  jwt.verify(String(token || ""), process.env.JWT_SECRET, {
    audience: BARBER_TOKEN_AUDIENCE,
  });

module.exports = {
  BARBER_TOKEN_AUDIENCE,
  hashPin,
  isHashedPin,
  isValidPin,
  normalizePinInput,
  signBarberToken,
  verifyBarberToken,
  verifyPin,
};
