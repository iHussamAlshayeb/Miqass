const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const Tenant = require("./models/Tenant");
const checkMaintenanceMode = require("./middlewares/maintenanceMiddleware");

const app = express();
const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.hostname === "miqass.app") {
    return res.redirect(308, `https://www.miqass.app${req.originalUrl}`);
  }

  next();
});

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

// مسارات الـ API
app.use("/api/tenants", require("./routes/tenantRoutes"));
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/sales", require("./routes/salesRoutes"));
app.use("/api/products", require("./routes/productsRoutes"));
app.use("/api/expenses", require("./routes/expensesRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/superAdminRoutes"));
app.use("/api/public", require("./routes/publicRoutes"));
app.use("/api/whatsapp", require("./routes/whatsappRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/zatca", require("./routes/zatcaRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "running", version: "2.1.0-stable" });
});

// مسار جلب الشعار (يعمل كـ API Endpoint للواجهة)
app.get("/logo/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await Tenant.findOne({ slug })
      .select("branding.logoUrl")
      .lean();

    if (!tenant || !tenant.branding?.logoUrl) {
      return res.redirect("https://www.miqass.app/default-logo.png");
    }

    const logoData = tenant.branding.logoUrl;

    if (logoData.startsWith("data:image")) {
      const matches = logoData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400", // المتصفح سيكيش الصورة تلقائياً
        });
        return res.end(buffer);
      }
    }

    res.redirect(
      logoData.startsWith("http")
        ? logoData
        : "https://www.miqass.app/default-logo.png",
    );
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

app.use(
  express.static(frontendDistPath, {
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html") || filePath.endsWith("OneSignalSDKWorker.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return;
      }

      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

app.use((req, res, next) => {
  if (
    req.method !== "GET" ||
    req.path === "/api" ||
    req.path.startsWith("/api/")
  ) {
    return next();
  }

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.sendFile(frontendIndexPath, (error) => {
    if (error) next(error);
  });
});

// مسار افتراضي (Fallback) للطلبات غير الموجودة
app.use((req, res) => {
  res.status(404).json({ error: "API Endpoint Not Found" });
});

module.exports = app;
