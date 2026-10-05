const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const Tenant = require("../src/models/Tenant");
const { compressLogoDataUri, publicLogoUrl, parseLogoDataUri } = require("../src/utils/logoImage");

const makePng = async (size) => {
  const buffer = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 40, b: 90 } },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
};

test("large logos are resized to 512px WebP and shrink", async () => {
  const original = await makePng(1600);
  const compressed = await compressLogoDataUri(original);
  assert.match(compressed, /^data:image\/webp;base64,/);
  const meta = await sharp(parseLogoDataUri(compressed).buffer).metadata();
  assert.ok(meta.width <= 512 && meta.height <= 512);
  assert.ok(compressed.length < original.length);
});

test("SVG and corrupt images are rejected with a clear 400 error", async () => {
  await assert.rejects(compressLogoDataUri("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg=="), (e) => e.statusCode === 400);
  await assert.rejects(compressLogoDataUri("data:image/png;base64,bm90LWFuLWltYWdl"), (e) => e.statusCode === 400);
});

test("public responses get a versioned logo URL instead of the image", async () => {
  const logo = await makePng(64);
  const url = publicLogoUrl("balloon", logo);
  assert.match(url, /^\/logo\/balloon\?v=[0-9a-f]{12}$/);
  assert.notEqual(publicLogoUrl("balloon", await makePng(65)), url, "version changes with the logo");
  assert.equal(publicLogoUrl("balloon", "https://cdn.example/logo.png"), "https://cdn.example/logo.png");
});

test("logo endpoint serves the image with long cache only for versioned URLs", async () => {
  const app = require("../src/app");
  const logo = await makePng(32);
  const original = Tenant.findOne;
  Tenant.findOne = () => ({ select() { return this; }, async lean() { return { branding: { logoUrl: logo } }; } });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const versioned = await fetch(`${base}/logo/balloon?v=abc`);
    assert.equal(versioned.status, 200);
    assert.equal(versioned.headers.get("content-type"), "image/png");
    assert.match(versioned.headers.get("cache-control"), /immutable/);
    const plain = await fetch(`${base}/logo/balloon`);
    assert.doesNotMatch(plain.headers.get("cache-control"), /immutable/);
  } finally {
    server.close();
    Tenant.findOne = original;
  }
});
