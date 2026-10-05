const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const { hashPin } = require("./barberPin");
const {
  encrypt,
  decrypt,
  isEncrypted,
  isLegacyEncrypted,
  hashForLookup,
} = require("./encryption");

// الحقول السرية في مستند الصالون التي يجب أن تكون مشفرة بصيغة v2
const SECRET_PATHS = [
  "paymentSettings.moyasarSecretKey",
  "taxSettings.zakaty.apiKey",
  "whatsappSettings.apiKey",
  "whatsappSettings.whatsiWebhookSecret",
];

const { compressLogoDataUri, isDataUriLogo } = require("./logoImage");

const getPath = (doc, path) => path.split(".").reduce((value, key) => value?.[key], doc);

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

/**
 * 4) ترقية الأسرار إلى AES-256-GCM (v2):
 *    - المشفّر بالصيغة القديمة (CBC) يُفك ويُعاد تشفيره.
 *    - النص الصريح (مثل مفتاح واتساب وبيانات ZATCA) يُشفَّر.
 *    - إذا فشل فك قيمة قديمة لا نلمسها، حتى لا نفقدها.
 */
const upgradeStoredSecrets = async () => {
  const projection = Object.fromEntries(
    [...SECRET_PATHS, "whatsappSettings.apiKeyHash"].map((path) => [path, 1]),
  );
  const cursor = Tenant.collection.find({}, { projection });

  let upgraded = 0;
  let failed = 0;
  for await (const tenant of cursor) {
    const filter = { _id: tenant._id };
    const set = {};

    for (const path of SECRET_PATHS) {
      const value = getPath(tenant, path);
      if (!value || typeof value !== "string") continue;
      if (isEncrypted(value) && !isLegacyEncrypted(value)) continue; // v2 بالفعل

      const plain = isLegacyEncrypted(value) ? decrypt(value) : value;
      if (!plain) {
        failed += 1;
        continue;
      }
      filter[path] = value; // لا نكتب إذا تغيّرت القيمة أثناء الترحيل
      set[path] = encrypt(plain);

      if (path === "whatsappSettings.apiKey") {
        set["whatsappSettings.apiKeyHash"] = hashForLookup(plain);
      }
    }

    // صالونات مفتاحها مشفّر لكن بلا hash (مثلاً شُفّر في تشغيل سابق)
    const waKey = tenant.whatsappSettings?.apiKey;
    if (!set["whatsappSettings.apiKeyHash"] && waKey && !tenant.whatsappSettings?.apiKeyHash) {
      const plain = decrypt(waKey);
      if (plain) set["whatsappSettings.apiKeyHash"] = hashForLookup(plain);
    }

    if (Object.keys(set).length === 0) continue;
    const result = await Tenant.collection.updateOne(filter, { $set: set });
    upgraded += result.modifiedCount;
  }

  if (upgraded) console.log(`🔐 تمت ترقية/تشفير أسرار ${upgraded} صالون إلى AES-256-GCM.`);
  if (failed) {
    console.error(
      `⚠️ تعذّر فك ${failed} سرّ قديم — تحقق أن ENCRYPTION_KEY لم يتغير. لم تُعدَّل هذه القيم.`,
    );
  }
};

/**
 * 5) ضغط شعارات base64 الكبيرة (512×512 WebP). عند أي فشل يبقى الشعار كما هو.
 */
const LOGO_COMPRESS_THRESHOLD = 40 * 1024;
const compressStoredLogos = async () => {
  const cursor = Tenant.collection.find(
    { "branding.logoUrl": { $regex: "^data:image/" } },
    { projection: { slug: 1, "branding.logoUrl": 1 } },
  );
  let saved = 0;
  for await (const tenant of cursor) {
    const logo = tenant.branding?.logoUrl;
    if (!isDataUriLogo(logo) || logo.length < LOGO_COMPRESS_THRESHOLD) continue;
    try {
      const compressed = await compressLogoDataUri(logo);
      if (compressed.length >= logo.length) continue;
      const result = await Tenant.collection.updateOne(
        { _id: tenant._id, "branding.logoUrl": logo },
        { $set: { "branding.logoUrl": compressed } },
      );
      if (result.modifiedCount) {
        saved += 1;
        console.log(`🖼️ ضغط شعار ${tenant.slug}: ${Math.round(logo.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB`);
      }
    } catch (error) {
      console.warn(`⚠️ تعذر ضغط شعار ${tenant.slug}: ${error.message}`);
    }
  }
  return saved;
};

const runStartupMigrations = async () => {
  for (const migration of [
    migratePaymentAndTaxSettings,
    hashLegacyBarberPins,
    upgradeStoredSecrets,
    compressStoredLogos,
  ]) {
    try {
      await migration();
    } catch (error) {
      console.error(`⚠️ فشل الترحيل ${migration.name}:`, error.message);
    }
  }
};

module.exports = { runStartupMigrations, upgradeStoredSecrets, compressStoredLogos };
