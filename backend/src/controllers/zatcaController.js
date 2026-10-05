const Tenant = require("../models/Tenant");
const { encrypt } = require("../utils/encryption");
const {
  presentZakatyConfig, validateZakatyConfig, prepareZakatyProvisioning,
} = require("../services/zakatyIntegration");
const {
  getProvisioningConfig, connectZakatySalon, issueZakatySalonKey,
  revokeZakatySalonKey, getZakatyEgsUnit, runZakatyDeviceStep, summarizeZakatyError,
} = require('../services/zakatyClient');
const { startZakatySetup, submitZakatyOtp } = require('../services/zakatySetupService');

const zakatySellerFields = ['legalName', 'crNumber', 'street', 'buildingNumber', 'city', 'postalCode'];

const presentZakatyResponse = (tenant) => {
  let provisioningEnvironment = '';
  try { provisioningEnvironment = getProvisioningConfig().environment; } catch { /* Optional in development. */ }
  return {
    config: presentZakatyConfig(tenant),
    serviceConfigured: !!process.env.ZAKATY_BASE_URL,
    provisioningConfigured: !!provisioningEnvironment,
    provisioningEnvironment,
  };
};

const getZakatyConfig = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('taxSettings.zakaty taxSettings.taxNumber').lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.json({ ...presentZakatyResponse(tenant), taxNumber: tenant.taxSettings?.taxNumber || '' });
  } catch (error) {
    return res.status(500).json({ message: "تعذر قراءة إعدادات Zakaty" });
  }
};

const updateZakatyConfig = async (req, res) => {
  try {
    const error = validateZakatyConfig(req.body);
    if (error) return res.status(400).json({ message: error });
    const { apiKey, egsUnitId, seller } = req.body;
    const current = await Tenant.findById(req.tenantId).select('taxSettings.zakaty').lean();
    if (!current) return res.status(404).json({ message: 'الصالون غير موجود' });
    if (current.taxSettings?.zakaty?.tenantId &&
        (current.taxSettings.zakaty.egsUnitId !== egsUnitId || !!apiKey?.trim() ||
         current.taxSettings.zakaty.seller?.legalName !== String(seller.legalName || '').trim() ||
         current.taxSettings.zakaty.registeredCrNumber !== seller.crNumber.trim())) {
      return res.status(409).json({ message: 'لا يمكن تغيير بيانات الهوية أو معرّف الجهاز أو المفتاح بعد تهيئة Zakaty.' });
    }
    const changes = { 'taxSettings.zakaty.egsUnitId': egsUnitId };
    for (const key of zakatySellerFields) {
      changes[`taxSettings.zakaty.seller.${key}`] = String(seller[key] || '').trim();
    }
    if (apiKey?.trim()) changes['taxSettings.zakaty.apiKey'] = encrypt(apiKey.trim());
    const tenant = await Tenant.findByIdAndUpdate(req.tenantId, { $set: changes }, {
      returnDocument: 'after', select: 'taxSettings.zakaty',
    }).lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.json({ message: "تم حفظ إعدادات Zakaty دون تفعيل الإرسال.", config: presentZakatyConfig(tenant) });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حفظ إعدادات Zakaty" });
  }
};

const disconnectZakatyConfig = async (req, res) => {
  try {
    const current = await Tenant.findById(req.tenantId).select('taxSettings.zakaty').lean();
    if (!current) return res.status(404).json({ message: 'الصالون غير موجود' });
    const config = current.taxSettings?.zakaty || {};
    if (['preparing', 'awaiting_otp', 'finalizing'].includes(config.setup?.status)) {
      return res.status(409).json({ message: 'لا يمكن إلغاء المفتاح أثناء تجهيز الربط.' });
    }
    if (config.keyIssuingAt) return res.status(409).json({ message: 'إصدار المفتاح غير محسوم. راجع المسؤول قبل الفصل.' });
    if (config.apiKeyId) await revokeZakatySalonKey(config.apiKeyId);
    const tenant = await Tenant.findByIdAndUpdate(req.tenantId, {
      $set: {
        'taxSettings.zakaty.apiKey': '', 'taxSettings.zakaty.apiKeyId': '',
        'taxSettings.zakaty.setup.status': '', 'taxSettings.zakaty.setup.error': '',
      },
    }, { returnDocument: 'after', select: 'taxSettings.zakaty' }).lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });
    return res.json({ message: 'تم إلغاء مفتاح الصالون؛ بقي سجل الصالون ووحدة EGS في Zakaty.', config: presentZakatyConfig(tenant) });
  } catch (error) {
    return res.status(502).json({ message: 'تعذر إلغاء المفتاح من Zakaty. لم تُمسح بيانات الربط المحلية.' });
  }
};

const provisionZakatySalon = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('salonName taxSettings').lean();
    if (!tenant) return res.status(404).json({ message: 'الصالون غير موجود' });
    const config = tenant.taxSettings?.zakaty || {};
    if (config.tenantId) return res.json({ message: 'الصالون مهيأ مسبقًا في Zakaty.', ...presentZakatyResponse(tenant) });
    if (config.apiKey) return res.status(409).json({ message: 'يوجد مفتاح يدوي محفوظ. افصله قبل التهيئة التلقائية.' });
    const environment = getProvisioningConfig().environment;
    const { error, payload } = prepareZakatyProvisioning(tenant, req.body?.seller, environment);
    if (error) return res.status(400).json({ message: error });
    const result = await connectZakatySalon(payload);
    if (!result?.tenant?.id || !result?.egsUnit?.id) throw new Error('Zakaty لم يعِد معرّفات الربط.');
    const changes = {
      'taxSettings.zakaty.tenantId': result.tenant.id,
      'taxSettings.zakaty.egsUnitId': result.egsUnit.id,
      'taxSettings.zakaty.registeredVatNumber': payload.tenant.vatNumber,
      'taxSettings.zakaty.registeredCrNumber': payload.tenant.crNumber,
    };
    for (const key of zakatySellerFields) changes[`taxSettings.zakaty.seller.${key}`] = req.body.seller[key].trim();
    const updated = await Tenant.findByIdAndUpdate(req.tenantId, { $set: changes }, {
      returnDocument: 'after', select: 'taxSettings.zakaty',
    }).lean();
    return res.json({ message: 'تم تهيئة الصالون ووحدة EGS في Zakaty. الخطوة التالية إصدار مفتاح الصالون.', ...presentZakatyResponse(updated) });
  } catch (error) {
    const provider = summarizeZakatyError(error);
    return res.status(provider.status === 409 ? 409 : 502).json({ message: provider.message });
  }
};

const issueZakatyKey = async (req, res) => {
  const claimTime = new Date();
  let tenant;
  try {
    tenant = await Tenant.findOneAndUpdate({
      _id: req.tenantId,
      'taxSettings.zakaty.tenantId': { $nin: ['', null] },
      'taxSettings.zakaty.apiKey': { $in: ['', null] },
      'taxSettings.zakaty.keyIssuingAt': null,
    }, { $set: { 'taxSettings.zakaty.keyIssuingAt': claimTime } }, { returnDocument: 'after' }).select('salonName taxSettings.zakaty').lean();
  } catch {
    return res.status(500).json({ message: 'تعذر حجز عملية إصدار المفتاح.' });
  }
  if (!tenant) return res.status(409).json({ message: 'الصالون غير مهيأ، أو لديه مفتاح، أو توجد محاولة إصدار غير محسومة.' });
  try {
    const result = await issueZakatySalonKey(tenant.taxSettings.zakaty.tenantId, `Miqass salon ${tenant._id}`);
    if (!result?.plaintextKey || !result?.apiKey?.id) throw new Error('Zakaty لم يعِد المفتاح ومعرّفه.');
    const updated = await Tenant.findOneAndUpdate({
      _id: req.tenantId, 'taxSettings.zakaty.keyIssuingAt': claimTime,
    }, { $set: {
      'taxSettings.zakaty.apiKey': encrypt(result.plaintextKey),
      'taxSettings.zakaty.apiKeyId': result.apiKey.id,
      'taxSettings.zakaty.keyIssuingAt': null,
    } }, { returnDocument: 'after', select: 'taxSettings.zakaty' }).lean();
    if (!updated) throw new Error('تعذر حفظ مفتاح الصالون بعد إصداره.');
    return res.json({ message: 'تم إصدار مفتاح الصالون وحفظه مشفرًا. جهاز EGS يحتاج استكمال إعداد الشهادة.', config: presentZakatyConfig(updated) });
  } catch (error) {
    const provider = summarizeZakatyError(error);
    if (provider.status >= 400 && provider.status < 500) {
      await Tenant.updateOne({ _id: req.tenantId, 'taxSettings.zakaty.keyIssuingAt': claimTime }, {
        $set: { 'taxSettings.zakaty.keyIssuingAt': null },
      });
    }
    return res.status(provider.status >= 400 && provider.status < 500 ? provider.status : 502)
      .json({ message: provider.status >= 400 && provider.status < 500 ? provider.message : 'نتيجة إصدار المفتاح غير مؤكدة. لا تعِد الطلب حتى يراجع المسؤول حالة Zakaty.' });
  }
};

const presentDevice = (unit) => ({
  status: unit.status || 'unknown',
  hasPrivateKey: !!unit.hasPrivateKey,
  hasComplianceCsid: !!unit.hasComplianceCsid,
  hasProductionCsid: !!unit.hasProductionCsid,
});

const getZakatyDevice = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('taxSettings.zakaty').lean();
    if (!tenant) return res.status(404).json({ message: 'الصالون غير موجود' });
    if (!tenant.taxSettings?.zakaty?.apiKey || !tenant.taxSettings.zakaty.egsUnitId) {
      return res.status(409).json({ message: 'أصدر مفتاح الصالون أولًا.' });
    }
    return res.json({ device: presentDevice(await getZakatyEgsUnit(tenant)) });
  } catch (error) {
    return res.status(502).json({ message: summarizeZakatyError(error).message });
  }
};

const stepZakatyDevice = async (req, res) => {
  const step = req.params.step;
  if (!['csr', 'compliance', 'check', 'production'].includes(step)) {
    return res.status(400).json({ message: 'خطوة تجهيز EGS غير معروفة.' });
  }
  const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
  if (step === 'compliance' && (otp.length < 4 || otp.length > 20)) {
    return res.status(400).json({ message: 'رمز OTP غير صالح.' });
  }
  try {
    const tenant = await Tenant.findById(req.tenantId).select('taxSettings.zakaty').lean();
    if (!tenant) return res.status(404).json({ message: 'الصالون غير موجود' });
    if (!tenant.taxSettings?.zakaty?.apiKey || !tenant.taxSettings.zakaty.egsUnitId) {
      return res.status(409).json({ message: 'أصدر مفتاح الصالون أولًا.' });
    }
    const body = step === 'compliance' ? { otp } : {};
    const unit = await runZakatyDeviceStep(tenant, step, body);
    return res.json({ message: 'تم تنفيذ خطوة تجهيز الجهاز في Zakaty.', device: presentDevice(unit) });
  } catch (error) {
    const provider = summarizeZakatyError(error);
    return res.status(provider.status >= 400 && provider.status < 500 ? provider.status : 502).json({ message: provider.message });
  }
};

const startAutomaticZakatySetup = async (req, res) => {
  try {
    const config = await startZakatySetup(req.tenantId, req.body);
    return res.status(202).json({ message: 'بدأ تجهيز ربط الصالون. ستظهر خطوة OTP عند جاهزية الجهاز.', config });
  } catch (error) {
    const provider = summarizeZakatyError(error);
    return res.status(error.status || provider.status || 502).json({ message: provider.message });
  }
};

const completeAutomaticZakatySetup = async (req, res) => {
  try {
    const config = await submitZakatyOtp(req.tenantId, req.body?.otp);
    return res.status(202).json({ message: 'تم قبول OTP. يجري فحص الامتثال وطلب شهادة الإنتاج تلقائيًا.', config });
  } catch (error) {
    const provider = summarizeZakatyError(error);
    return res.status(error.status || provider.status || 502).json({ message: provider.message });
  }
};

module.exports = {
  getZakatyConfig,
  updateZakatyConfig,
  disconnectZakatyConfig,
  provisionZakatySalon,
  issueZakatyKey,
  getZakatyDevice,
  stepZakatyDevice,
  startAutomaticZakatySetup,
  completeAutomaticZakatySetup,
};
