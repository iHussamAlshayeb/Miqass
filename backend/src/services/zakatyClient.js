const axios = require('axios');
const fs = require('node:fs');
const { decrypt } = require('../utils/encryption');

const getBaseUrl = () => {
  const raw = process.env.ZAKATY_BASE_URL;
  if (!raw) throw new Error('عنوان خدمة Zakaty غير مضبوط على الخادم.');
  const url = new URL(raw);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('عنوان خدمة Zakaty غير صالح.');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname) && url.hostname.includes('.')) {
    throw new Error('اتصال Zakaty الخارجي يجب أن يستخدم HTTPS.');
  }
  return url;
};

const getApiKey = (tenant) => {
  const stored = tenant?.taxSettings?.zakaty?.apiKey;
  const key = stored && decrypt(stored);
  if (!key) throw new Error('مفتاح Zakaty للصالون غير متوفر.');
  return key;
};

const getProvisioningConfig = () => {
  let apiKey = process.env.ZAKATY_PROVISIONING_API_KEY;
  let environment = process.env.ZAKATY_PROVISIONING_ENVIRONMENT;
  if (!apiKey && process.env.ZAKATY_PROVISIONING_CONFIG_FILE) {
    const config = JSON.parse(fs.readFileSync(process.env.ZAKATY_PROVISIONING_CONFIG_FILE, 'utf8'));
    apiKey = config.ZAKATY_PROVISIONING_API_KEY;
    environment = config.environment;
  }
  if (typeof apiKey !== 'string' || !apiKey.trim() ||
      !['sandbox', 'simulation', 'production'].includes(environment)) {
    throw new Error('مفتاح تهيئة Zakaty أو بيئته غير مضبوطين على الخادم.');
  }
  return { apiKey, environment };
};

const provisioningRequestConfig = () => ({
  headers: { 'x-api-key': getProvisioningConfig().apiKey, 'content-type': 'application/json' },
  timeout: 12000,
});

const connectZakatySalon = async (payload) => {
  const base = getBaseUrl();
  const response = await axios.post(new URL('/api/onboarding/connect', base).href, payload, provisioningRequestConfig());
  return response.data;
};

const issueZakatySalonKey = async (tenantId, name) => {
  const base = getBaseUrl();
  const response = await axios.post(
    new URL(`/api/integration/tenants/${encodeURIComponent(tenantId)}/api-keys`, base).href,
    { name }, provisioningRequestConfig(),
  );
  return response.data;
};

const revokeZakatySalonKey = async (keyId) => {
  const base = getBaseUrl();
  await axios.post(
    new URL(`/api/integration/api-keys/${encodeURIComponent(keyId)}/revoke`, base).href,
    {}, provisioningRequestConfig(),
  );
};

const getZakatyEgsUnit = async (tenant) => {
  const base = getBaseUrl();
  const egsUnitId = tenant.taxSettings.zakaty.egsUnitId;
  const response = await axios.get(new URL(`/api/egs-units/${encodeURIComponent(egsUnitId)}`, base).href, {
    headers: { 'x-api-key': getApiKey(tenant) }, timeout: 12000,
  });
  return response.data;
};

const runZakatyDeviceStep = async (tenant, step, body = {}) => {
  const paths = {
    csr: 'generate-csr', compliance: 'request-compliance-csid',
    check: 'run-compliance-check', production: 'request-production-csid',
  };
  if (!Object.hasOwn(paths, step)) throw new Error('خطوة تجهيز EGS غير معروفة.');
  const base = getBaseUrl();
  const egsUnitId = tenant.taxSettings.zakaty.egsUnitId;
  await axios.post(new URL(`/api/egs-units/${encodeURIComponent(egsUnitId)}/${paths[step]}`, base).href, body, {
    headers: { 'x-api-key': getApiKey(tenant), 'content-type': 'application/json' }, timeout: 60000,
  });
  return getZakatyEgsUnit(tenant);
};

const requestConfig = (tenant, externalInvoiceId) => ({
  headers: {
    'x-api-key': getApiKey(tenant),
    'x-request-id': externalInvoiceId,
    'content-type': 'application/json',
  },
  timeout: 12000,
});

const getZakatyInvoiceStatus = async (tenant, externalInvoiceId) => {
  const base = getBaseUrl();
  try {
    const response = await axios.get(new URL('/api/integration/invoices/status', base).href, {
      ...requestConfig(tenant, externalInvoiceId),
      params: { externalInvoiceId },
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

const submitZakatyInvoice = async (tenant, payload) => {
  const base = getBaseUrl();
  const response = await axios.post(
    new URL('/api/integration/invoices/submit', base).href,
    payload,
    requestConfig(tenant, payload.externalInvoiceId),
  );
  return response.data;
};

const normalizeZakatyResult = (result) => {
  const status = String(result?.zatcaStatus || 'unknown').toLowerCase();
  const states = {
    accepted: 'Accepted',
    accepted_with_warnings: 'AcceptedWithWarnings',
    rejected: 'Rejected',
    retry_pending: 'RetryPending',
    failed: 'Failed',
  };
  return {
    status: states[status] || 'Unknown',
    invoiceId: String(result?.invoiceId || ''),
    uuid: String(result?.uuid || ''),
    invoiceHash: String(result?.invoiceHash || ''),
    qrBase64: String(result?.qrBase64 || ''),
    submittedAt: result?.submittedAt ? new Date(result.submittedAt) : null,
    lastError: String(result?.lastSubmissionError || result?.submission?.errorMessage || '').slice(0, 500),
    checkedAt: new Date(),
  };
};

const summarizeZakatyError = (error) => {
  const status = Number(error.response?.status || 0);
  const message = String(error.response?.data?.message || error.message || 'تعذر الاتصال بخدمة Zakaty.').slice(0, 300);
  return { status, message };
};

module.exports = {
  getBaseUrl,
  getProvisioningConfig,
  connectZakatySalon,
  issueZakatySalonKey,
  revokeZakatySalonKey,
  getZakatyEgsUnit,
  runZakatyDeviceStep,
  getZakatyInvoiceStatus,
  submitZakatyInvoice,
  normalizeZakatyResult,
  summarizeZakatyError,
};
