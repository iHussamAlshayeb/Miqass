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

const renderSalonShareImage = async (logoUrl) => {
  let logo;
  try {
    const source = await loadLogo(logoUrl);
    if (source.length > MAX_SOURCE_BYTES) throw new Error("Logo exceeds size limit");
    logo = await sharp(source, { limitInputPixels: 30_000_000 })
      .rotate()
      .resize(510, 510, { fit: "inside" })
      .png()
      .toBuffer();
  } catch {
    logo = await sharp(fallbackLogoPath)
      .resize(510, 510, { fit: "inside" })
      .png()
      .toBuffer();
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
    .png()
    .toBuffer();
};

module.exports = {
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
  logoVersion,
  isPublicAddress,
  renderSalonShareImage,
};
