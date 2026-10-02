const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  registerPushSubscription,
  unregisterPushSubscription,
} = require("../controllers/notificationController");

const router = express.Router();

router.post("/subscriptions", protect, registerPushSubscription);
router.delete(
  "/subscriptions/:subscriptionId",
  protect,
  unregisterPushSubscription,
);

module.exports = router;
