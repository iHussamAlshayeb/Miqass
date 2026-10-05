const crypto = require('node:crypto');
const Tenant = require('../models/Tenant');
const { encrypt } = require('../utils/encryption');
const { prepareZakatyProvisioning, presentZakatyConfig } = require('./zakatyIntegration');
const {
  getProvisioningConfig, connectZakatySalon, issueZakatySalonKey,
  getZakatyEgsUnit, runZakatyDeviceStep, summarizeZakatyError,
} = require('./zakatyClient');

const sellerFields = ['legalName', 'crNumber', 'street', 'buildingNumber', 'city', 'postalCode'];
const activeStatuses = ['preparing', 'awaiting_otp', 'finalizing', 'ready'];
const lockMs = 10 * 60 * 1000;

const setupError = (message, status = 409) => Object.assign(new Error(message), { status });

const loadTenant = (tenantId) => Tenant.findById(tenantId).select('salonName taxSettings').lean();

const startZakatySetup = async (tenantId, input) => {
  const tenant = await loadTenant(tenantId);
  if (!tenant) throw setupError('الصالون غير موجود.', 404);
  const seller = input?.seller;
  const taxNumber = typeof input?.taxNumber === 'string' ? input.taxNumber.trim() : '';
  const environment = getProvisioningConfig().environment;
  const { error, payload } = prepareZakatyProvisioning(tenant, seller, environment, taxNumber);
  if (error) throw setupError(error, 400);
  const config = tenant.taxSettings?.zakaty || {};
  if (config.tenantId && (config.registeredVatNumber !== taxNumber ||
      config.registeredCrNumber !== payload.tenant.crNumber ||
      config.seller?.legalName !== payload.tenant.name)) {
    throw setupError('بيانات المنشأة تختلف عن سجلها المهيأ في Zakaty. راجع المسؤول قبل تغيير الهوية.');
  }
  if (config.apiKey && !config.tenantId) throw setupError('يوجد مفتاح Zakaty يدوي. افصله قبل الربط التلقائي.');
  if (config.keyIssuingAt) throw setupError('إصدار المفتاح السابق غير محسوم. راجع المسؤول قبل المحاولة مجددًا.');
  if (activeStatuses.includes(config.setup?.status)) return presentZakatyConfig(tenant);

  const changes = {
    'taxSettings.taxNumber': taxNumber,
    'taxSettings.zakaty.setup.status': 'preparing',
    'taxSettings.zakaty.setup.error': '',
    'taxSettings.zakaty.setup.nextAttemptAt': null,
  };
  for (const key of sellerFields) changes[`taxSettings.zakaty.seller.${key}`] = seller[key].trim();
  const updated = await Tenant.findOneAndUpdate({
    _id: tenantId,
    'taxSettings.zakaty.setup.status': { $nin: activeStatuses },
  }, { $set: changes }, { returnDocument: 'after', select: 'taxSettings.zakaty' }).lean();
  if (!updated) return presentZakatyConfig(await loadTenant(tenantId));
  queueZakatySetup(tenantId);
  return presentZakatyConfig(updated);
};

const claimSetup = (tenantId, statuses) => {
  const now = new Date();
  const owner = crypto.randomUUID();
  return Tenant.findOneAndUpdate({
    _id: tenantId,
    'taxSettings.zakaty.setup.status': { $in: statuses },
    $and: [
      { $or: [
        { 'taxSettings.zakaty.setup.lockUntil': null },
        { 'taxSettings.zakaty.setup.lockUntil': { $lte: now } },
      ] },
      { $or: [
        { 'taxSettings.zakaty.setup.nextAttemptAt': null },
        { 'taxSettings.zakaty.setup.nextAttemptAt': { $lte: now } },
      ] },
    ],
  }, { $set: {
    'taxSettings.zakaty.setup.lockOwner': owner,
    'taxSettings.zakaty.setup.lockUntil': new Date(now.getTime() + lockMs),
  } }, { returnDocument: 'after', select: 'salonName taxSettings' }).lean();
};

const updateClaimed = async (tenantId, owner, changes) => {
  const result = await Tenant.updateOne({
    _id: tenantId, 'taxSettings.zakaty.setup.lockOwner': owner,
  }, { $set: changes });
  if (!result.matchedCount) throw setupError('فُقد قفل تهيئة Zakaty.');
};

const issueKeyOnce = async (tenant, owner) => {
  const tenantId = tenant._id;
  const config = tenant.taxSettings.zakaty;
  if (config.keyIssuingAt) throw setupError('إصدار مفتاح الصالون غير محسوم ويحتاج مراجعة يدوية.');
  const claimedAt = new Date();
  await updateClaimed(tenantId, owner, { 'taxSettings.zakaty.keyIssuingAt': claimedAt });
  try {
    const result = await issueZakatySalonKey(config.tenantId, `Miqass salon ${tenantId}`);
    if (!result?.plaintextKey || !result?.apiKey?.id) throw setupError('Zakaty لم يعِد مفتاح الصالون ومعرّفه.');
    await updateClaimed(tenantId, owner, {
      'taxSettings.zakaty.apiKey': encrypt(result.plaintextKey),
      'taxSettings.zakaty.apiKeyId': result.apiKey.id,
      'taxSettings.zakaty.keyIssuingAt': null,
    });
  } catch (error) {
    const status = Number(error.response?.status || 0);
    if (status >= 400 && status < 500) {
      await updateClaimed(tenantId, owner, { 'taxSettings.zakaty.keyIssuingAt': null });
    }
    throw error;
  }
};

const prepareDevice = async (tenantId, owner) => {
  let tenant = await loadTenant(tenantId);
  let config = tenant.taxSettings.zakaty;
  if (!config.tenantId) {
    const { error, payload } = prepareZakatyProvisioning(
      tenant, config.seller, getProvisioningConfig().environment,
    );
    if (error) throw setupError(error, 400);
    const result = await connectZakatySalon(payload);
    if (!result?.tenant?.id || !result?.egsUnit?.id) throw setupError('Zakaty لم يعِد معرّفات الصالون والجهاز.');
    await updateClaimed(tenantId, owner, {
      'taxSettings.zakaty.tenantId': result.tenant.id,
      'taxSettings.zakaty.egsUnitId': result.egsUnit.id,
      'taxSettings.zakaty.registeredVatNumber': payload.tenant.vatNumber,
      'taxSettings.zakaty.registeredCrNumber': payload.tenant.crNumber,
    });
    tenant = await loadTenant(tenantId);
    config = tenant.taxSettings.zakaty;
  }
  if (!config.apiKey) {
    await issueKeyOnce(tenant, owner);
    tenant = await loadTenant(tenantId);
  }
  let device = await getZakatyEgsUnit(tenant);
  if (!device.hasPrivateKey) device = await runZakatyDeviceStep(tenant, 'csr');
  if (!device.hasPrivateKey) throw setupError('لم يؤكد Zakaty إنشاء مفتاح EGS.');
  return device.hasProductionCsid && device.status === 'production_ready' ? 'ready' :
    device.hasComplianceCsid ? 'finalizing' : 'awaiting_otp';
};

const finalizeDevice = async (tenantId, owner) => {
  const tenant = await loadTenant(tenantId);
  const config = tenant.taxSettings.zakaty;
  let device = await getZakatyEgsUnit(tenant);
  if (device.hasProductionCsid && device.status === 'production_ready') return 'ready';
  if (!device.hasComplianceCsid) return 'awaiting_otp';
  if (!config.setup?.complianceCheckedAt) {
    await runZakatyDeviceStep(tenant, 'check', { signingMode: 'sdk', payloadMode: 'sdk' });
    await updateClaimed(tenantId, owner, { 'taxSettings.zakaty.setup.complianceCheckedAt': new Date() });
  }
  device = await runZakatyDeviceStep(tenant, 'production');
  if (!device.hasProductionCsid || device.status !== 'production_ready') {
    throw setupError('لم يؤكد Zakaty جاهزية شهادة الإنتاج.');
  }
  return 'ready';
};

const processZakatySetup = async (tenantId) => {
  const claimed = await claimSetup(tenantId, ['preparing', 'finalizing']);
  if (!claimed) return false;
  const owner = claimed.taxSettings.zakaty.setup.lockOwner;
  const currentStatus = claimed.taxSettings.zakaty.setup.status;
  let status = currentStatus;
  let error = '';
  let nextAttemptAt = null;
  try {
    status = currentStatus === 'preparing' ? await prepareDevice(tenantId, owner) :
      await finalizeDevice(tenantId, owner);
  } catch (cause) {
    const provider = summarizeZakatyError(cause);
    const errorStatus = Number(cause.status || provider.status || 0);
    const latest = await loadTenant(tenantId);
    const uncertainKey = !!latest?.taxSettings?.zakaty?.keyIssuingAt;
    status = uncertainKey || (errorStatus >= 400 && errorStatus < 500) ? 'attention' : currentStatus;
    error = uncertainKey ? 'إصدار مفتاح الصالون غير محسوم. راجع مسؤول Zakaty قبل إعادة المحاولة.' : provider.message;
    if (status === currentStatus) nextAttemptAt = new Date(Date.now() + 2 * 60 * 1000);
  }
  await updateClaimed(tenantId, owner, {
    'taxSettings.zakaty.setup.status': status,
    'taxSettings.zakaty.setup.error': error,
    'taxSettings.zakaty.setup.nextAttemptAt': nextAttemptAt,
    'taxSettings.zakaty.setup.lockOwner': '',
    'taxSettings.zakaty.setup.lockUntil': null,
  });
  if (currentStatus === 'preparing' && status === 'finalizing') queueZakatySetup(tenantId);
  return true;
};

const queueZakatySetup = (tenantId) => {
  setImmediate(() => processZakatySetup(tenantId).catch((error) => {
    console.error('Zakaty setup worker failed:', error.message);
  }));
};

const submitZakatyOtp = async (tenantId, rawOtp) => {
  const otp = typeof rawOtp === 'string' ? rawOtp.trim() : '';
  if (otp.length < 4 || otp.length > 20) throw setupError('رمز OTP غير صالح.', 400);
  const tenant = await claimSetup(tenantId, ['awaiting_otp']);
  if (!tenant) throw setupError('الربط لا ينتظر OTP حاليًا أو تجري معالجة طلب آخر.');
  const owner = tenant.taxSettings.zakaty.setup.lockOwner;
  try {
    let device = await getZakatyEgsUnit(tenant);
    if (!device.hasComplianceCsid) {
      try {
        device = await runZakatyDeviceStep(tenant, 'compliance', { otp });
      } catch (cause) {
        device = await getZakatyEgsUnit(tenant).catch(() => null);
        if (!device?.hasComplianceCsid) throw cause;
      }
    }
    if (!device.hasComplianceCsid) throw setupError('لم يؤكد Zakaty إصدار شهادة الامتثال.');
    await updateClaimed(tenantId, owner, {
      'taxSettings.zakaty.setup.status': 'finalizing',
      'taxSettings.zakaty.setup.error': '',
      'taxSettings.zakaty.setup.nextAttemptAt': null,
      'taxSettings.zakaty.setup.lockOwner': '',
      'taxSettings.zakaty.setup.lockUntil': null,
    });
    queueZakatySetup(tenantId);
    return presentZakatyConfig(await loadTenant(tenantId));
  } catch (cause) {
    await updateClaimed(tenantId, owner, {
      'taxSettings.zakaty.setup.error': summarizeZakatyError(cause).message,
      'taxSettings.zakaty.setup.lockOwner': '',
      'taxSettings.zakaty.setup.lockUntil': null,
    });
    throw cause;
  }
};

const processPendingZakatySetups = async () => {
  const now = new Date();
  const tenants = await Tenant.find({
    'taxSettings.zakaty.setup.status': { $in: ['preparing', 'finalizing'] },
    $and: [
      { $or: [
        { 'taxSettings.zakaty.setup.lockUntil': null },
        { 'taxSettings.zakaty.setup.lockUntil': { $lte: now } },
      ] },
      { $or: [
        { 'taxSettings.zakaty.setup.nextAttemptAt': null },
        { 'taxSettings.zakaty.setup.nextAttemptAt': { $lte: now } },
      ] },
    ],
  }).select('_id').sort({ 'taxSettings.zakaty.setup.nextAttemptAt': 1, _id: 1 }).limit(10).lean();
  for (const tenant of tenants) {
    await processZakatySetup(tenant._id).catch((error) => {
      console.error('Zakaty setup recovery failed:', error.message);
    });
  }
};

module.exports = {
  startZakatySetup, submitZakatyOtp, processZakatySetup, processPendingZakatySetups,
};
