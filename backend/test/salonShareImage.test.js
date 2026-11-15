const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
  isPublicAddress,
  logoVersion,
  renderSalonShareImage,
} = require("../src/utils/salonShareImage");

const pixelAt = (pixels, info, x, y) =>
  [...pixels.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
// JPEG: مقارنة بهامش بسيط
const near = (actual, expected, label) =>
  assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) <= 6), `${label}: ${actual} vs ${expected}`);

test("wide and tall logos remain centered and uncropped on a fixed JPEG canvas", async () => {
  for (const [width, height, color] of [
    [600, 100, "#ff0000"],
    [100, 600, "#0000ff"],
  ]) {
    const source = await sharp({
      create: { width, height, channels: 3, background: color },
    }).png().toBuffer();
    const output = await renderSalonShareImage(`data:image/png;base64,${source.toString("base64")}`);
    const metadata = await sharp(output).metadata();
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.chromaSubsampling, "4:4:4");
    assert.equal(metadata.width, IMAGE_WIDTH);
    assert.equal(metadata.height, IMAGE_HEIGHT);
    near(pixelAt(data, info, 0, 0), [255, 255, 255], "corner");
    near(pixelAt(data, info, 600, 315), color === "#ff0000" ? [255, 0, 0] : [0, 0, 255], "centre");
    near(pixelAt(data, info, 600, 20), [255, 255, 255], "top");
    near(pixelAt(data, info, 20, 315), [255, 255, 255], "side");
  }
});

test("unsafe image hosts are rejected and logo changes get a new image URL", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fc00::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.notEqual(logoVersion("logo-a"), logoVersion("logo-b"));
});

test("a private external logo falls back without contacting the host", async () => {
  const image = await renderSalonShareImage("http://127.0.0.1/logo.png");
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.width, IMAGE_WIDTH);
  assert.equal(metadata.height, IMAGE_HEIGHT);
});

test("small logos are enlarged at most 2x so they stay sharp; transparency becomes white", async () => {
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 50, height: 50, channels: 3, background: "#00aa00" } }).png().toBuffer(), gravity: "centre" }])
    .png().toBuffer();
  const output = await renderSalonShareImage(`data:image/png;base64,${source.toString("base64")}`);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  // 100px → 200px: الجزء الأخضر (50px) يصبح 100px في المنتصف، وما حوله أبيض
  near(pixelAt(data, info, 600, 315), [0, 170, 0], "logo centre");
  near(pixelAt(data, info, 600, 315 - 70), [255, 255, 255], "transparent area");
  near(pixelAt(data, info, 600 - 110, 315), [255, 255, 255], "outside 2x box");
});
