const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
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

let frontendPath = path.join(__dirname, "..", "frontend", "dist");
if (!fs.existsSync(frontendPath)) {
  frontendPath = path.join(__dirname, "..", "frontend", "build");
}

app.use(express.static(frontendPath));

app.use(async (req, res) => {
  const indexPath = path.join(frontendPath, "index.html");

  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");

    const possibleSlug = req.path.split("/")[1];

    const ignoreList = ["api", "login", "register", "dashboard", "pricing"];

    if (possibleSlug && !ignoreList.includes(possibleSlug)) {
      try {
        const tenant = await Tenant.findOne({ slug: possibleSlug })
          .select("salonName bio branding")
          .lean();

        if (tenant) {
          const serverUrl = `${req.protocol}://${req.get("host")}`;
          const logoEndpoint = tenant.branding?.logoUrl
            ? `${serverUrl}/logo/${possibleSlug}`
            : `${serverUrl}/default-logo.png`;

          const ogTags = `
            <title>حجز موعد | ${tenant.salonName}</title>
            <meta property="og:title" content="حجز موعد | ${tenant.salonName}" />
            <meta property="og:description" content="${tenant.bio || "احجز موعدك الآن بخطوات بسيطة وبدون انتظار."}" />
            <meta property="og:image" content="${logoEndpoint}" />
            <meta property="og:type" content="website" />
            <meta property="og:url" content="${serverUrl}/${possibleSlug}" />
            <meta name="twitter:card" content="summary_large_image" />
          `;

          html = html.replace("</head>", `${ogTags}</head>`);
        }
      } catch (error) {
        console.error("Error injecting OG tags:", error);
      }
    }

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
