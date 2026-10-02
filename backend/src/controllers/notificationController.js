const PushDevice = require("../models/PushDevice");

const normalizeSubscriptionId = (value) => {
  const subscriptionId = String(value || "").trim();
  return /^[a-zA-Z0-9-]{10,200}$/.test(subscriptionId)
    ? subscriptionId
    : null;
};

const registerPushSubscription = async (req, res) => {
  try {
    const subscriptionId = normalizeSubscriptionId(req.body?.subscriptionId);
    if (!subscriptionId) {
      return res.status(400).json({ message: "معرف اشتراك الإشعارات غير صالح." });
    }

    const externalId = String(req.body?.externalId || "").trim().slice(0, 250);
    const platform = String(req.body?.platform || "web").trim().slice(0, 40);

    await PushDevice.findOneAndUpdate(
      { subscriptionId },
      {
        $set: {
          tenantId: req.tenantId,
          externalId,
          platform,
          active: true,
          lastSeenAt: new Date(),
          disabledAt: null,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Push subscription registration error:", error.message);
    return res.status(500).json({ message: "تعذر حفظ اشتراك الإشعارات." });
  }
};

const unregisterPushSubscription = async (req, res) => {
  try {
    const subscriptionId = normalizeSubscriptionId(req.params.subscriptionId);
    if (!subscriptionId) {
      return res.status(400).json({ message: "معرف اشتراك الإشعارات غير صالح." });
    }

    await PushDevice.updateOne(
      { subscriptionId, tenantId: req.tenantId },
      { $set: { active: false, disabledAt: new Date() } },
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Push subscription removal error:", error.message);
    return res.status(500).json({ message: "تعذر فصل اشتراك الإشعارات." });
  }
};

module.exports = {
  registerPushSubscription,
  unregisterPushSubscription,
};
