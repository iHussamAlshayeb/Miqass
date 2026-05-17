export default async function handler(req, res) {
  const { slug } = req.query;
  const backendUrl =
    process.env.VITE_API_BASE_URL || "https://your-backend.onrender.com";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const frontendUrl = `${protocol}://${host}`;

  try {
    // 1. جلب ملف index.html الأصلي الخاص بواجهة Vite
    const htmlResponse = await fetch(`${frontendUrl}/index.html`);
    let html = await htmlResponse.text();

    // قائمة المسارات التي لا تعتبر صالونات
    const ignoreList = ["login", "register", "dashboard", "pricing", "assets"];

    if (slug && !ignoreList.includes(slug)) {
      // 2. جلب بيانات الصالون الأساسية من الباك إند
      // (يجب أن يكون لديك Endpoint بسيط في الباك إند يرجع اسم الصالون والوصف)
      const tenantRes = await fetch(
        `${backendUrl}/api/public/tenant-meta/${slug}`,
      );

      if (tenantRes.ok) {
        const tenant = await tenantRes.json();
        const logoEndpoint = `${backendUrl}/logo/${slug}`;

        // 3. بناء وسوم المشاركة
        const ogTags = `
          <title>حجز موعد | ${tenant.salonName}</title>
          <meta property="og:title" content="حجز موعد | ${tenant.salonName}" />
          <meta property="og:description" content="${tenant.bio || "احجز موعدك الآن بخطوات بسيطة وبدون انتظار."}" />
          <meta property="og:image" content="${logoEndpoint}" />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="${frontendUrl}/${slug}" />
          <meta name="twitter:card" content="summary_large_image" />
        `;

        // 4. حقن الوسوم في قسم الـ <head>
        html = html.replace("</head>", `${ogTags}</head>`);
      }
    }

    // إرسال الصفحة النهائية للمستخدم أو للواتساب
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300"); // كاش لتخفيف الضغط
    res.status(200).send(html);
  } catch (error) {
    console.error("Error generating meta tags:", error);
    // في حال حدوث خطأ، نعيد الصفحة الافتراضية حتى لا يتعطل الموقع
    res.redirect("/index.html");
  }
}
