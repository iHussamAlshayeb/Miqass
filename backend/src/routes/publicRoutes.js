const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  getPlatformStats,
  getPublicPricing,
  getTopClients,
} = require("../controllers/publicController");
const Tenant = require("../models/Tenant");

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100,
  message: {
    message: "تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً 🛑",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(publicLimiter);
router.get("/stats", getPlatformStats);
router.get("/pricing", getPublicPricing);
router.get("/top-clients", getTopClients);

router.get("/tenant-meta/:slug", async (req, res) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug })
      .select("salonName bio")
      .lean();

    if (!tenant) return res.status(404).json({ error: "Not found" });

    res.json(tenant);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
module.exports = router;
