const crypto = require("crypto");
const dns = require("dns/promises");
const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const path = require("path");
const ipaddr = require("ipaddr.js");
const sharp = require("sharp");

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const MAX_SOURCE_BYTES = 3 * 1024 * 1024;
const fallbackLogoPath = path.join(__dirname, "..", "..", "frontend", "dist", "logo.png");

const logoVersion = (logoUrl) =>
  crypto.createHash("sha256").update(logoUrl || "").digest("hex").slice(0, 12);

// يتغير مع تغيّر طريقة رسم صورة المعاينة، فيجلب واتساب وغيره الصورة الجديدة بدل نسختهم المخزنة
const SHARE_IMAGE_REVISION = "2";
const LOGO_BOX = 540;

const isPublicAddress = (address) => {
  try {
    return ipaddr.process(address.replace(/^\[|\]$/g, "")).range() === "unicast";
  } catch {
    return false;
  }
};

const fetchPublicImage = async (value) => {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) ||
    url.username ||
    url.password
  ) {
    throw new Error("Unsupported logo URL");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Logo URL does not resolve to a public address");
  }
  const { address, family } = addresses[0];

  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(
      url,
      { lookup: (_hostname, _options, callback) => callback(null, address, family) },
      (response) => {
        if (
          response.statusCode !== 200 ||
          !/^image\/(png|jpeg|webp|gif)(?:;|$)/i.test(response.headers["content-type"] || "") ||
          Number(response.headers["content-length"] || 0) > MAX_SOURCE_BYTES
        ) {
          response.resume();
          reject(new Error("Unsupported logo response"));
          return;
        }

        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_SOURCE_BYTES) {
            response.destroy(new Error("Logo exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.setTimeout(5000, () => request.destroy(new Error("Logo request timed out")));
    request.on("error", reject);
  });
};

const loadLogo = async (logoUrl) => {
  if (logoUrl?.startsWith("data:image/")) {
    const match = logoUrl.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match || match[2].length > MAX_SOURCE_BYTES * 1.4) {
      throw new Error("Unsupported inline logo");
    }
    return Buffer.from(match[2], "base64");
  }
  if (/^https?:\/\//i.test(logoUrl || "")) return fetchPublicImage(logoUrl);
  return fs.readFile(fallbackLogoPath);
};

/**
 * صورة معاينة رابط الصالون (1200×630): الشعار في المنتصف على خلفية بيضاء.
 * JPEG بألوان كاملة (4:4:4) وجودة عالية: أصغر حجماً من PNG فيظهر في واتساب بسرعة،
 * ويحافظ على حدة الحواف والنصوص. الشعار الصغير يُكبَّر بحد أقصى ضعف حجمه حتى لا يتشوش.
 */
const renderSalonShareImage = async (logoUrl) => {
  const prepare = async (input) => {
    const image = sharp(input, { limitInputPixels: 30_000_000 }).rotate();
    const meta = await image.metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0) || LOGO_BOX;
    const box = Math.min(LOGO_BOX, longest * 2);
    return image
      .resize(box, box, { fit: "inside", kernel: "lanczos3" })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
  };

  let logo;
  try {
    const source = await loadLogo(logoUrl);
    if (source.length > MAX_SOURCE_BYTES) throw new Error("Logo exceeds size limit");
    logo = await prepare(source);
  } catch {
    logo = await prepare(await fs.readFile(fallbackLogoPath));
  }

  return sharp({
    create: {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
};

module.exports = {
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
  SHARE_IMAGE_REVISION,
  logoVersion,
  isPublicAddress,
  renderSalonShareImage,
};
