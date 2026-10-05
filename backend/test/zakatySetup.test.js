const test = require('node:test');
const assert = require('node:assert/strict');

test('automatic setup pauses only for OTP and resumes without duplicate keys or CSR', async () => {
  const tenantId = '507f1f77bcf86cd799439011';
  const seller = {
    legalName: 'شركة صالون الاختبار', crNumber: '1010000000', street: 'شارع الملك',
    buildingNumber: '1234', city: 'الرياض', postalCode: '12211',
  };
  const record = {
    _id: tenantId, salonName: 'صالون الاختبار',
    taxSettings: { taxNumber: '', isZatcaOnboarded: false, zakaty: {
      apiKey: '', tenantId: '', egsUnitId: '', keyIssuingAt: null,
      setup: { status: '', error: '', lockOwner: '', lockUntil: null, nextAttemptAt: null },
      seller: {},
    } },
  };
  const device = { status: 'draft', hasPrivateKey: false, hasComplianceCsid: false, hasProductionCsid: false };
  let csrResponseLost = true;
  const calls = [];
  const clone = (value) => structuredClone(value);
  const get = (path) => path.split('.').reduce((value, part) => value?.[part], record);
  const set = (path, value) => {
    const parts = path.split('.');
    let target = record;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    target[parts.at(-1)] = value;
  };
  const query = (value) => ({ select() { return this; }, lean: async () => value ? clone(value) : null });
  const Tenant = {
    findById: () => query(record),
    findOneAndUpdate: (filter, update) => {
      let matches = filter._id === tenantId;
      const status = get('taxSettings.zakaty.setup.status');
      const owner = get('taxSettings.zakaty.setup.lockOwner');
      if (filter['taxSettings.zakaty.setup.status']?.$nin) matches &&= !filter['taxSettings.zakaty.setup.status'].$nin.includes(status);
      if (filter['taxSettings.zakaty.setup.status']?.$in) matches &&= filter['taxSettings.zakaty.setup.status'].$in.includes(status);
      if (filter['taxSettings.zakaty.setup.lockOwner']) matches &&= owner === filter['taxSettings.zakaty.setup.lockOwner'];
      if (filter.$and) {
        const lockUntil = get('taxSettings.zakaty.setup.lockUntil');
        const nextAttempt = get('taxSettings.zakaty.setup.nextAttemptAt');
        matches &&= !lockUntil || lockUntil <= new Date();
        matches &&= !nextAttempt || nextAttempt <= new Date();
      }
      if (matches) Object.entries(update.$set || {}).forEach(([path, value]) => set(path, value));
      return query(matches ? record : null);
    },
    updateOne: async (filter, update) => {
      const matches = filter._id === tenantId && filter['taxSettings.zakaty.setup.lockOwner'] === get('taxSettings.zakaty.setup.lockOwner');
      if (matches) Object.entries(update.$set || {}).forEach(([path, value]) => set(path, value));
      return { matchedCount: matches ? 1 : 0 };
    },
  };
  const client = {
    getProvisioningConfig: () => ({ apiKey: 'hidden', environment: 'production' }),
    connectZakatySalon: async (payload) => {
      calls.push('connect');
      assert.equal(payload.externalTenantId, tenantId);
      return { tenant: { id: 'zakaty-tenant-id' }, egsUnit: { id: 'zakaty-device-id' } };
    },
    issueZakatySalonKey: async () => {
      calls.push('issue');
      return { plaintextKey: 'salon-secret', apiKey: { id: 'salon-key-id' } };
    },
    getZakatyEgsUnit: async () => clone(device),
    runZakatyDeviceStep: async (_tenant, step, body) => {
      calls.push(step);
      if (step === 'csr') {
        device.hasPrivateKey = true;
        device.status = 'csr_generated';
        if (csrResponseLost) { csrResponseLost = false; throw new Error('response lost'); }
      }
      if (step === 'compliance') {
        if (body.otp !== '123456') throw Object.assign(new Error('OTP مرفوض'), { status: 400 });
        device.hasComplianceCsid = true;
        device.status = 'compliance_ready';
      }
      if (step === 'check') assert.deepEqual(body, { signingMode: 'sdk', payloadMode: 'sdk' });
      if (step === 'production') { device.hasProductionCsid = true; device.status = 'production_ready'; }
      return clone(device);
    },
    summarizeZakatyError: (error) => ({ status: error.status || 0, message: error.message }),
  };

  const replacements = [
    ['../src/models/Tenant', Tenant],
    ['../src/utils/encryption', { encrypt: (value) => `encrypted:${value}` }],
    ['../src/services/zakatyClient', client],
  ].map(([path, exports]) => [require.resolve(path), exports]);
  const originalCache = new Map(replacements.map(([path]) => [path, require.cache[path]]));
  const originalImmediate = global.setImmediate;
  const servicePath = require.resolve('../src/services/zakatySetupService');
  try {
    for (const [path, exports] of replacements) require.cache[path] = { id: path, filename: path, loaded: true, exports };
    delete require.cache[servicePath];
    global.setImmediate = () => 0;
    const setup = require(servicePath);

    const started = await setup.startZakatySetup(tenantId, { taxNumber: '300000000000003', seller });
    assert.equal(started.setupStatus, 'preparing');
    await setup.processZakatySetup(tenantId);
    assert.equal(get('taxSettings.zakaty.setup.status'), 'preparing');
    set('taxSettings.zakaty.setup.nextAttemptAt', null);
    await setup.processZakatySetup(tenantId);
    assert.equal(get('taxSettings.zakaty.setup.status'), 'awaiting_otp');
    assert.equal(get('taxSettings.zakaty.apiKey'), 'encrypted:salon-secret');
    assert.deepEqual(calls, ['connect', 'issue', 'csr']);

    const repeated = await setup.startZakatySetup(tenantId, { taxNumber: '300000000000003', seller });
    assert.equal(repeated.setupStatus, 'awaiting_otp');
    await assert.rejects(setup.submitZakatyOtp(tenantId, '12'), /OTP/);
    assert.equal(get('taxSettings.zakaty.setup.status'), 'awaiting_otp');
    await assert.rejects(setup.submitZakatyOtp(tenantId, '000000'), /OTP/);
    assert.equal(get('taxSettings.zakaty.setup.status'), 'awaiting_otp');

    const afterOtp = await setup.submitZakatyOtp(tenantId, '123456');
    assert.equal(afterOtp.setupStatus, 'finalizing');
    await setup.processZakatySetup(tenantId);
    assert.equal(get('taxSettings.zakaty.setup.status'), 'ready');
    assert.deepEqual(calls, ['connect', 'issue', 'csr', 'compliance', 'compliance', 'check', 'production']);
    assert.equal(JSON.stringify(record).includes('123456'), false);
    assert.equal(await setup.processZakatySetup(tenantId), false);
  } finally {
    global.setImmediate = originalImmediate;
    delete require.cache[servicePath];
    for (const [path] of replacements) {
      if (originalCache.get(path)) require.cache[path] = originalCache.get(path);
      else delete require.cache[path];
    }
  }
});
