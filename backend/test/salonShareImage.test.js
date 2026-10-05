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

test("wide and tall logos remain centered and uncropped on a fixed PNG canvas", async () => {
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

    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, IMAGE_WIDTH);
    assert.equal(metadata.height, IMAGE_HEIGHT);
    assert.deepEqual(pixelAt(data, info, 0, 0), [255, 255, 255]);
    assert.deepEqual(pixelAt(data, info, 600, 315), color === "#ff0000" ? [255, 0, 0] : [0, 0, 255]);
    assert.deepEqual(pixelAt(data, info, 600, 40), [255, 255, 255]);
    assert.deepEqual(pixelAt(data, info, 40, 315), [255, 255, 255]);
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
