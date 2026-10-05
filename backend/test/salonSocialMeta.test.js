const test = require("node:test");
const assert = require("node:assert/strict");
const { renderSalonSocialMeta } = require("../src/utils/salonSocialMeta");

const html = '<html><head><title>نظام مِقَص السحابي</title></head><body></body></html>';
const origin = "https://www.miqass.app";

test("booking share metadata uses the salon name, logo, and canonical link", () => {
  const rendered = renderSalonSocialMeta(
    html,
    { salonName: "صالون بالون للأطفال", slug: "balloon", bio: "حلاقة الأطفال" },
    origin,
  );

  assert.match(rendered, /<title>صالون بالون للأطفال \| احجز موعدك<\/title>/);
  assert.match(rendered, /property="og:title" content="صالون بالون للأطفال \| احجز موعدك"/);
  assert.match(rendered, /property="og:site_name" content="صالون بالون للأطفال"/);
  assert.match(rendered, /property="og:image" content="https:\/\/www\.miqass\.app\/share-image\/balloon\?v=[a-f0-9]{12}"/);
  assert.match(rendered, /name="twitter:image" content="https:\/\/www\.miqass\.app\/share-image\/balloon\?v=[a-f0-9]{12}"/);
  assert.match(rendered, /property="og:image:width" content="1200"/);
  assert.match(rendered, /property="og:image:height" content="630"/);
  assert.match(rendered, /name="twitter:card" content="summary_large_image"/);
  assert.match(rendered, /rel="canonical" href="https:\/\/www\.miqass\.app\/balloon"/);
  assert.match(rendered, /name="description" content="حلاقة الأطفال"/);
});

test("salon text is escaped before insertion into HTML attributes", () => {
  const rendered = renderSalonSocialMeta(
    html,
    { salonName: 'A & "B" <Shop>', slug: "test", bio: '"><script>alert(1)</script>' },
    origin,
  );

  assert.match(rendered, /A &amp; &quot;B&quot; &lt;Shop&gt;/);
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
});
