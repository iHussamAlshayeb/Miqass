const sharp = require("sharp");
const { logoVersion } = require("./salonShareImage");

const LOGO_MAX_SIZE = 512;
const MAX_INPUT_BYTES = 3 * 1024 * 1024;
// صيغ نقطية فقط؛ SVG مستبعد لأنه قد يحتوي سكربتات
const DATA_URI_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

const isDataUriLogo = (value) => typeof value === "string" && value.startsWith("data:image/");

const parseLogoDataUri = (value) => {
  const match = typeof value === "string" ? value.match(DATA_URI_PATTERN) : null;
  if (!match) return null;
  const subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  return { contentType: `image/${subtype}`, buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64") };
};

/**
 * يصغّر الشعار إلى 512×512 كحد أقصى ويحوّله إلى WebP.
 * يُرجع data URI جديداً، أو الأصل إذا كان الضغط لا يوفّر شيئاً.
 */
const compressLogoDataUri = async (dataUri) => {
  const parsed = parseLogoDataUri(dataUri);
  if (!parsed) throw Object.assign(new Error("صيغة الشعار غير مدعومة. استخدم PNG أو JPG أو WebP."), { statusCode: 400 });
  if (parsed.buffer.length > MAX_INPUT_BYTES) {
    throw Object.assign(new Error("حجم الشعار كبير جداً. الحد الأقصى 3 ميجابايت."), { statusCode: 400 });
  }

  let output;
  try {
    output = await sharp(parsed.buffer, { animated: false })
      .rotate()
      .resize(LOGO_MAX_SIZE, LOGO_MAX_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw Object.assign(new Error("تعذر قراءة صورة الشعار. جرّب صورة أخرى."), { statusCode: 400 });
  }

  if (output.length >= parsed.buffer.length && parsed.contentType === "image/webp") return dataUri;
  return `data:image/webp;base64,${output.toString("base64")}`;
};

/**
 * رابط الشعار في الردود العامة: بدل إرسال الصورة داخل JSON في كل طلب،
 * نرسل رابطاً قابلاً للتخزين المؤقت يتغير تلقائياً عند تغيّر الشعار.
 */
const publicLogoUrl = (slug, logoUrl) =>
  isDataUriLogo(logoUrl) && slug
    ? `/logo/${encodeURIComponent(slug)}?v=${logoVersion(logoUrl)}`
    : logoUrl;

module.exports = {
  compressLogoDataUri,
  isDataUriLogo,
  parseLogoDataUri,
  publicLogoUrl,
};
