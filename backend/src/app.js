const express = require("express");
const cors = require("cors");
const helmet = require("helmet"); // 🚀 حماية المتصفح
const compression = require("compression"); // 💨 تسريع النقل
const path = require("path"); // 💡 للتعامل مع مسارات الملفات
const fs = require("fs"); // 💡 لقراءة الملفات (مثل index.html)
const Tenant = require("./models/Tenant");
const checkMaintenanceMode = require("./middlewares/maintenanceMiddleware");
const redisClient = require("./utils/redisClient"); // 💡 كاش لتسريع الـ Proxy

const app = express();

// ==========================================
// 🛡️ إعدادات الثقة بالبروكسي (مهم جداً لـ Cloudflare و حماية Rate Limit)
// ==========================================
app.set("trust proxy", 1);

// ==========================================
// 🛡️ إعدادات الحماية والأداء الأساسية
// ==========================================
app.use(
  helmet({
    contentSecurityPolicy: false, // نغلقها مؤقتاً إذا كنت تستخدم Base64 للصور بكثرة
  }),
);
app.use(compression()); // ضغط البيانات لتقليل الباندويث

// إعدادات الـ CORS الديناميكية والمدرّعة
app.use(
  cors({
    origin: function (origin, callback) {
      // 💡 السماح للطلبات الداخلية (نفس السيرفر) والـ Postman وغيرها
      if (!origin) return callback(null, true);

      const allowedPatterns = [
        /^https?:\/\/localhost:\d+$/,
        /^https:\/\/(www\.)?miqass\.app$/,
        // أضف أي نطاقات فرعية هنا إن وجدت
      ];

      const isAllowed = allowedPatterns.some((pattern) => pattern.test(origin));

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Access denied by Miqass Security Policy"));
      }
    },
    credentials: true,
  }),
);

// تحديد حجم البيانات المرفوعة (حماية من الـ Payload Too Large)
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// تفعيل جدار الصيانة
app.use(checkMaintenanceMode);

// ==========================================
// 🛣️ مسارات الـ API الأساسية
// ==========================================
app.use("/api/tenants", require("./routes/tenantRoutes"));
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/superAdminRoutes"));
app.use("/api/public", require("./routes/publicRoutes"));
app.use("/api/whatsapp", require("./routes/whatsappRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/zatca", require("./routes/zatcaRoutes"));

// 💡 مسار فحص الجاهزية لكي لا يتعارض مع الصفحة الرئيسية للرياكت
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "running", version: "2.1.0-stable" });
});

// ==========================================
// 🖼️ مسار اللوجو (Base64 Proxy) - مُدرّع بالكاش
// ==========================================
app.get("/logo/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // 🚀 الفحص السريع من الكاش أولاً (Redis) لمنع ضرب الداتا بيس باستمرار
    const cachedLogo = await redisClient.get(`logo_buffer:${slug}`);
    if (cachedLogo) {
      const [contentType, base64Data] = cachedLogo.split("|");
      const buffer = Buffer.from(base64Data, "base64");
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      });
      return res.end(buffer);
    }

    const tenant = await Tenant.findOne({ slug })
      .select("branding.logoUrl")
      .lean();

    if (!tenant || !tenant.branding?.logoUrl) {
      return res.redirect("https://miqass.app/default-logo.png");
    }

    const logoData = tenant.branding.logoUrl;

    if (logoData.startsWith("data:image")) {
      const matches = logoData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];

        // 💾 حفظ في الكاش لمدة يوم واحد لتخفيف الضغط
        await redisClient.setEx(
          `logo_buffer:${slug}`,
          86400,
          `${contentType}|${base64Data}`,
        );

        const buffer = Buffer.from(base64Data, "base64");
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        });
        return res.end(buffer);
      }
    }

    res.redirect(
      logoData.startsWith("http")
        ? logoData
        : "https://miqass.app/default-logo.png",
    );
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

// ==========================================
// 🌐 تقديم ملفات الواجهة الأمامية (React Frontend) مع دعم (Dynamic Meta Tags) 🚀
// ==========================================
// بما أن ملف app.js داخل مجلد src، نستخدم ".." للرجوع خطوة للوراء ثم الدخول لمجلد frontend
let frontendPath = path.join(__dirname, "..", "frontend", "dist");
if (!fs.existsSync(frontendPath)) {
  frontendPath = path.join(__dirname, "..", "frontend", "build");
}

// 1. تزويد الملفات الثابتة (js, css, صور)
app.use(express.static(frontendPath));

// 2. 🛑 مسار Catch-all الذكي: يقرأ index.html ويحقن بيانات الصالون داخله!
app.use(async (req, res) => {
  const indexPath = path.join(frontendPath, "index.html");

  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");

    // استخراج اسم الصالون (slug) من الرابط، مثلاً: miqass.app/hero-salon
    const possibleSlug = req.path.split("/")[1];

    // استبعاد المسارات الأساسية للنظام لكي لا يبحث عنها في الداتا بيس
    const ignoreList = ["api", "login", "register", "dashboard", "pricing"];

    if (possibleSlug && !ignoreList.includes(possibleSlug)) {
      try {
        // نبحث عن الصالون في قاعدة البيانات
        const tenant = await Tenant.findOne({ slug: possibleSlug })
          .select("salonName bio branding")
          .lean();

        if (tenant) {
          const serverUrl = `${req.protocol}://${req.get("host")}`;
          // نستخدم مسار /logo/ الذكي الذي يعالج Base64
          const logoEndpoint = tenant.branding?.logoUrl
            ? `${serverUrl}/logo/${possibleSlug}`
            : `${serverUrl}/default-logo.png`;

          // 🚀 تجهيز الميتا تاج (Meta Tags) السحرية للواتساب وتويتر
          const ogTags = `
            <title>حجز موعد | ${tenant.salonName}</title>
            <meta property="og:title" content="حجز موعد | ${tenant.salonName}" />
            <meta property="og:description" content="${tenant.bio || "احجز موعدك الآن بخطوات بسيطة وبدون انتظار."}" />
            <meta property="og:image" content="${logoEndpoint}" />
            <meta property="og:type" content="website" />
            <meta property="og:url" content="${serverUrl}/${possibleSlug}" />
            <meta name="twitter:card" content="summary_large_image" />
          `;

          // حقن (Injection) التاجات داخل الـ HTML قبل إغلاق <head>
          html = html.replace("</head>", `${ogTags}</head>`);
        }
      } catch (error) {
        console.error("Error injecting OG tags:", error);
      }
    }

    // إرسال الـ HTML (المعدل أو العادي) للعميل
    res.send(html);
  } else {
    res.status(404).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>⚠️ لم يتم العثور على واجهة React!</h2>
        <p>السيرفر يبحث عن الملف في المسار: <code>${indexPath}</code></p>
        <p>يرجى التأكد من تشغيل أمر <b>npm run build</b> في مجلد frontend.</p>
      </div>
    `);
  }
});

module.exports = app;
