const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const { hashPin } = require("./barberPin");

/**
 * ترحيلات خفيفة تعمل عند كل تشغيل للسيرفر (idempotent):
 * 1) إزالة بقايا تكامل STC Bank ووافق من مستندات الصالونات.
 * 2) إيقاف الدفع الإلكتروني للصالونات التي لا تملك مفتاح ميسر،
 *    حتى لا تفشل حجوزات عملائها بعد إزالة STC Bank.
 * 3) تشفير رموز PIN القديمة المخزنة كنص صريح.
 * نستخدم collection مباشرة لأن الحقول المحذوفة لم تعد في الـ schema.
 */
const migratePaymentAndTaxSettings = async () => {
  const tenants = Tenant.collection;

  const provider = await tenants.updateMany(
    { "paymentSettings.provider": { $exists: true, $ne: "moyasar" } },
    { $set: { "paymentSettings.provider": "moyasar" } },
  );

  const disabled = await tenants.updateMany(
    {
      "paymentSettings.isOnlinePaymentEnabled": true,
      $or: [
        { "paymentSettings.moyasarSecretKey": { $exists: false } },
        { "paymentSettings.moyasarSecretKey": { $in: ["", null] } },
      ],
    },
    { $set: { "paymentSettings.isOnlinePaymentEnabled": false } },
  );

  const cleaned = await tenants.updateMany(
    {
      $or: [
        { "paymentSettings.stcBank": { $exists: true } },
        { "taxSettings.wafeqAccountId": { $exists: true } },
        { "settings.wafeqAccountId": { $exists: true } },
      ],
    },
    {
      $unset: {
        "paymentSettings.stcBank": "",
        "taxSettings.wafeqAccountId": "",
        "settings.wafeqAccountId": "",
      },
    },
  );

  if (provider.modifiedCount || disabled.modifiedCount || cleaned.modifiedCount) {
    console.log(
      `🧹 ترحيل الدفع: provider=${provider.modifiedCount}، تعطيل دفع بلا ميسر=${disabled.modifiedCount}، تنظيف STC/وافق=${cleaned.modifiedCount}`,
    );
  }
};

const hashLegacyBarberPins = async () => {
  const cursor = Barber.collection.find(
    { pin: { $type: "string", $ne: "", $not: /^\$2[aby]\$/ } },
    { projection: { _id: 1, pin: 1 } },
  );

  let count = 0;
  for await (const barber of cursor) {
    const result = await Barber.collection.updateOne(
      { _id: barber._id, pin: barber.pin },
      { $set: { pin: await hashPin(barber.pin) } },
    );
    count += result.modifiedCount;
  }

  if (count) console.log(`🔐 تم تشفير ${count} من رموز PIN القديمة.`);
};

const runStartupMigrations = async () => {
  for (const migration of [migratePaymentAndTaxSettings, hashLegacyBarberPins]) {
    try {
      await migration();
    } catch (error) {
      console.error(`⚠️ فشل الترحيل ${migration.name}:`, error.message);
    }
  }
};

module.exports = { runStartupMigrations };
