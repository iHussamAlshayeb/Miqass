const express = require("express");
const cors = require("cors");
const helmet = require("helmet"); // 🚀 حماية المتصفح
const compression = require("compression"); // 💨 تسريع النقل
const path = require("path"); // 💡 تم إضافة استدعاء path لتقديم ملفات الرياكت
const Tenant = require("./models/Tenant");
const checkMaintenanceMode = require("./middlewares/maintenanceMiddleware");
const redisClient = require("./utils/redisClient"); // 💡 كاش لتسريع الـ Proxy
const fs = require("fs");
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

// 💡 تم تغيير مسار فحص الجاهزية لكي لا يتعارض مع الصفحة الرئيسية للرياكت
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "running", version: "2.1.0-stable" });
});

// ==========================================
// 🚀 مشاركة الرابط (Smart Proxy) - محسنة للأداء
// ==========================================
app.get("/share/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // جلب البيانات مع اختيار الحقول المطلوبة فقط لتوفير الـ RAM
    const tenant = await Tenant.findOne({ slug })
      .select("salonName bio branding")
      .lean();

    if (!tenant) return res.redirect("https://miqass.app");

    const frontendUrl = `https://miqass.app/${slug}`;
    const serverUrl = `${req.protocol}://${req.get("host")}`;
    const logoEndpoint = tenant.branding?.logoUrl
      ? `${serverUrl}/logo/${slug}`
      : "https://miqass.app/default-logo.png";

    const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>حجز موعد | ${tenant.salonName}</title>
        <meta property="og:title" content="${tenant.salonName} - حجز موعد" />
        <meta property="og:description" content="${tenant.bio || "احجز موعدك الآن بخطوات بسيطة وبدون انتظار."}" />
        <meta property="og:image" content="${logoEndpoint}" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${frontendUrl}" />
        <meta name="twitter:card" content="summary_large_image" />
        <script>window.location.replace("${frontendUrl}");</script>
    </head>
    <body style="background-color: #f1f5f9; text-align: center; font-family: sans-serif; padding-top: 100px;">
        <h2 style="color: #1e293b;">جاري نقلك لـ ${tenant.salonName}... ✂️</h2>
    </body>
    </html>`;

    res.send(html);
  } catch (error) {
    res.redirect("https://miqass.app");
  }
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
// 🌐 تقديم ملفات الواجهة الأمامية (React Frontend)
// ==========================================
// 1. تحديد مسار مجلد الواجهة الأمامية بذكاء (يدعم dist و build)
let frontendPath = path.join(__dirname, "frontend", "dist"); // المسار الافتراضي لـ Vite
if (!fs.existsSync(frontendPath)) {
  frontendPath = path.join(__dirname, "frontend", "build"); // بديل لـ Create React App
}

// طباعة المسار في الـ Terminal لتتأكد من أنه يقرأ من المكان الصحيح
console.log(`🚀 Serving Frontend From: ${frontendPath}`);

// 2. تزويد الملفات الثابتة (js, css, images)
app.use(express.static(frontendPath));

// 3. مسار Catch-all الصحيح لـ Express 5
app.use((req, res) => {
  const indexPath = path.join(frontendPath, "index.html");

  // فحص أخير للتأكد من وجود ملف index.html
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // إذا لم يجد الملف، سيعطيك رسالة واضحة تخبرك بالمسار المفقود بدلاً من خطأ 404 المبهم
    res.status(404).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>⚠️ لم يتم العثور على واجهة React!</h2>
        <p>السيرفر يبحث عن الملف في المسار التالي:</p>
        <code style="background: #eee; padding: 10px; border-radius: 5px;">${indexPath}</code>
        <p>يرجى التأكد من الدخول لمجلد <b>frontend</b> وتشغيل أمر <b>npm run build</b>.</p>
      </div>
    `);
  }
});

module.exports = app;
