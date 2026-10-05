const { IMAGE_WIDTH, IMAGE_HEIGHT, logoVersion } = require("./salonShareImage");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const renderSalonSocialMeta = (html, tenant, origin) => {
  const name = tenant.salonName?.trim() || "الصالون";
  const title = `${name} | احجز موعدك`;
  const description =
    tenant.bio?.trim().slice(0, 160) || `احجز موعدك في ${name} بسهولة.`;
  const url = `${origin}/${encodeURIComponent(tenant.slug)}`;
  const image = `${origin}/share-image/${encodeURIComponent(tenant.slug)}?v=${logoVersion(tenant.branding?.logoUrl)}`;
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="ar_SA" />',
    `<meta property="og:site_name" content="${escapeHtml(name)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta property="og:image:type" content="image/png" />',
    `<meta property="og:image:width" content="${IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(`شعار ${name}`)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join("\n  ");

  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<\/head>/i, `  ${tags}\n</head>`);
};

module.exports = { renderSalonSocialMeta };
