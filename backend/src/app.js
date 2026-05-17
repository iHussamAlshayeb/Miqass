const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path"); // قد لا تحتاجه بعد الآن إذا لم يكن مستخدماً في ملفات أخرى
const Tenant = require("./models/Tenant");
const checkMaintenanceMode = require("./middlewares/maintenanceMiddleware");
const redisClient = require("./utils/redisClient");

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(compression());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedPatterns = [
        /^https?:\/\/localhost:\d+$/,
        /^https:\/\/(www\.)?miqass\.app$/,
        /^https:\/\/miqass\.app$/,
        /^https:\/\/.*\.vercel\.app$/, // إضافة للسماح بنطاقات فيرسيل (يمكن إزالتها بعد ربط الدومين الرسمي)
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

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

app.use(checkMaintenanceMode);

// مسارات الـ API
app.use("/api/tenants", require("./routes/tenantRoutes"));
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/superAdminRoutes"));
app.use("/api/public", require("./routes/publicRoutes"));
app.use("/api/whatsapp", require("./routes/whatsappRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/zatca", require("./routes/zatcaRoutes"));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "running", version: "2.1.0-stable" });
});

// مسار جلب الشعار (يعمل كـ API Endpoint للواجهة)
app.get("/logo/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

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

// مسار افتراضي (Fallback) للطلبات غير الموجودة
app.use((req, res) => {
  res.status(404).json({ error: "API Endpoint Not Found" });
});

module.exports = app;
