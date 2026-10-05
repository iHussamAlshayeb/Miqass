const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const fs = require('node:fs');
const { encrypt } = require('../src/utils/encryption');
const {
  getZakatyInvoiceStatus,
  submitZakatyInvoice,
  connectZakatySalon,
  issueZakatySalonKey,
  normalizeZakatyResult,
} = require('../src/services/zakatyClient');

test('Zakaty client uses the tenant key and stable external invoice id', async () => {
  const previousUrl = process.env.ZAKATY_BASE_URL;
  const previousPost = axios.post;
  const previousGet = axios.get;
  process.env.ZAKATY_BASE_URL = 'https://zakaty.example.test';
  const tenant = { taxSettings: { zakaty: { apiKey: encrypt('tenant-only-key') } } };
  const payload = { externalInvoiceId: 'miqass:tenant:sale', invoiceNumber: 'POS-1' };
  try {
    axios.post = async (url, body, config) => {
      assert.equal(url, 'https://zakaty.example.test/api/integration/invoices/submit');
      assert.deepEqual(body, payload);
      assert.equal(config.headers['x-api-key'], 'tenant-only-key');
      assert.equal(config.headers['x-request-id'], payload.externalInvoiceId);
      return { data: { zatcaStatus: 'accepted', invoiceId: 'provider-id' } };
    };
    axios.get = async (url, config) => {
      assert.equal(url, 'https://zakaty.example.test/api/integration/invoices/status');
      assert.equal(config.params.externalInvoiceId, payload.externalInvoiceId);
      assert.equal(config.headers['x-api-key'], 'tenant-only-key');
      return { data: { zatcaStatus: 'accepted', invoiceId: 'provider-id' } };
    };
    const submitted = await submitZakatyInvoice(tenant, payload);
    assert.equal(submitted.invoiceId, 'provider-id');
    const checked = await getZakatyInvoiceStatus(tenant, payload.externalInvoiceId);
    assert.equal(checked.invoiceId, 'provider-id');
  } finally {
    axios.post = previousPost;
    axios.get = previousGet;
    if (previousUrl === undefined) delete process.env.ZAKATY_BASE_URL;
    else process.env.ZAKATY_BASE_URL = previousUrl;
  }
});

test('provisioning key is read server-side and never substituted for a salon key', async () => {
  const previousUrl = process.env.ZAKATY_BASE_URL;
  const previousFile = process.env.ZAKATY_PROVISIONING_CONFIG_FILE;
  const previousRead = fs.readFileSync;
  const previousPost = axios.post;
  process.env.ZAKATY_BASE_URL = 'https://zakaty.example.test';
  process.env.ZAKATY_PROVISIONING_CONFIG_FILE = 'test-secret.json';
  try {
    fs.readFileSync = () => JSON.stringify({ ZAKATY_PROVISIONING_API_KEY: 'provisioning-only', environment: 'production' });
    axios.post = async (url, body, config) => {
      assert.equal(config.headers['x-api-key'], 'provisioning-only');
      if (url.endsWith('/api/onboarding/connect')) {
        assert.equal(body.externalTenantId, 'salon-id');
        return { data: { tenant: { id: 'zakaty-tenant' }, egsUnit: { id: 'device' } } };
      }
      assert.equal(url, 'https://zakaty.example.test/api/integration/tenants/zakaty-tenant/api-keys');
      assert.deepEqual(body, { name: 'Miqass salon salon-id' });
      return { data: { apiKey: { id: 'key-id' }, plaintextKey: 'salon-only' } };
    };
    const connected = await connectZakatySalon({ externalTenantId: 'salon-id' });
    assert.equal(connected.tenant.id, 'zakaty-tenant');
    const issued = await issueZakatySalonKey('zakaty-tenant', 'Miqass salon salon-id');
    assert.equal(issued.plaintextKey, 'salon-only');
  } finally {
    fs.readFileSync = previousRead;
    axios.post = previousPost;
    if (previousUrl === undefined) delete process.env.ZAKATY_BASE_URL;
    else process.env.ZAKATY_BASE_URL = previousUrl;
    if (previousFile === undefined) delete process.env.ZAKATY_PROVISIONING_CONFIG_FILE;
    else process.env.ZAKATY_PROVISIONING_CONFIG_FILE = previousFile;
  }
});

test('provider state is normalized without treating retry pending as accepted', () => {
  assert.equal(normalizeZakatyResult({ zatcaStatus: 'accepted_with_warnings' }).status, 'AcceptedWithWarnings');
  assert.equal(normalizeZakatyResult({ zatcaStatus: 'retry_pending' }).status, 'RetryPending');
  assert.equal(normalizeZakatyResult({ zatcaStatus: 'rejected' }).status, 'Rejected');
});
