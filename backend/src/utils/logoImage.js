const sharp = require("sharp");
const { logoVersion } = require("./salonShareImage");

// شعار بدقة تكفي للشاشات عالية الكثافة ولصورة معاينة الرابط، بحجم معقول داخل مستند الصالون
const LOGO_MAX_SIZE = 1024;
const LOGO_MAX_BYTES = 300 * 1024;
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
 * يجهّز الشعار للتخزين بأعلى جودة ممكنة:
 * - شعار PNG/WebP أبعاده ≤ 1024 وحجمه معقول يُحفظ كما هو (لا إعادة ضغط تفقده الجودة)
 * - غير ذلك يُصغّر إلى 1024 كحد أقصى ويُحفظ WebP بلا فقد، وإن كبر حجمه فبجودة عالية
 *   مع ألوان كاملة (بدون تقليل دقة الألوان) حتى تبقى الحواف والنصوص حادة
 */
const compressLogoDataUri = async (dataUri) => {
  const parsed = parseLogoDataUri(dataUri);
  if (!parsed) throw Object.assign(new Error("صيغة الشعار غير مدعومة. استخدم PNG أو JPG أو WebP."), { statusCode: 400 });
  if (parsed.buffer.length > MAX_INPUT_BYTES) {
    throw Object.assign(new Error("حجم الشعار كبير جداً. الحد الأقصى 3 ميجابايت."), { statusCode: 400 });
  }

  let meta;
  try {
    meta = await sharp(parsed.buffer, { animated: false }).metadata();
  } catch {
    throw Object.assign(new Error("تعذر قراءة صورة الشعار. جرّب صورة أخرى."), { statusCode: 400 });
  }
  const fitsAsIs = ["png", "webp"].includes(meta.format)
    && Math.max(meta.width || 0, meta.height || 0) <= LOGO_MAX_SIZE
    && (meta.orientation || 1) === 1
    && parsed.buffer.length <= LOGO_MAX_BYTES;
  if (fitsAsIs) return dataUri;

  const encode = (options) => sharp(parsed.buffer, { animated: false })
    .rotate()
    .resize(LOGO_MAX_SIZE, LOGO_MAX_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp(options)
    .toBuffer();

  let output;
  try {
    output = await encode({ lossless: true, effort: 6 });
    if (output.length > LOGO_MAX_BYTES) output = await encode({ quality: 95, alphaQuality: 100, smartSubsample: true, effort: 6 });
    if (output.length > LOGO_MAX_BYTES) output = await encode({ quality: 88, alphaQuality: 100, smartSubsample: true, effort: 6 });
  } catch {
    throw Object.assign(new Error("تعذر قراءة صورة الشعار. جرّب صورة أخرى."), { statusCode: 400 });
  }

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
