const test = require('node:test');
const assert = require('node:assert/strict');
const {
  presentZakatyConfig,
  validateZakatyConfig,
  prepareZakatyProvisioning,
  prepareZakatyInvoice,
} = require('../src/services/zakatyIntegration');

const tenant = {
  _id: '507f1f77bcf86cd799439011',
  salonName: 'صالون بالون',
  taxSettings: {
    taxNumber: '300000000000003',
    zakaty: {
      apiKey: 'encrypted-key',
      egsUnitId: '11b159de-6f90-4215-9e50-a10824fc2838',
      seller: {
        crNumber: '1010000000', street: 'شارع الملك', buildingNumber: '1234',
        city: 'الرياض', postalCode: '12211',
      },
    },
  },
};
const sale = {
  _id: '507f1f77bcf86cd799439012',
  status: 'Paid', invoiceNumber: 'POS-120', totalAmount: 23,
  createdAt: new Date('2026-10-04T15:30:00.000Z'),
};
const items = [
  { name: 'حلاقة', quantity: 1, unitPrice: 20, totalAmount: 20, discountAmount: 0, vatRate: 0.15 },
  { name: 'منتج', quantity: 1, unitPrice: 3, totalAmount: 3, discountAmount: 0, vatRate: 0.15 },
];
const buyer = {
  name: 'عميل', street: 'شارع الاختبار', buildingNumber: '10', city: 'الرياض', postalCode: '12211',
};

test('Zakaty config presenter never exposes the API key', () => {
  const config = presentZakatyConfig(tenant);
  assert.equal(config.hasApiKey, true);
  assert.equal(JSON.stringify(config).includes('encrypted-key'), false);
  assert.equal(validateZakatyConfig({ egsUnitId: config.egsUnitId, seller: config.seller }), null);
  assert.ok(validateZakatyConfig({ egsUnitId: 'bad', seller: config.seller }));
});

test('provisioning uses the stable Miqass salon id and real taxpayer identity', () => {
  const seller = { ...tenant.taxSettings.zakaty.seller, legalName: 'شركة بالون للحلاقة' };
  const result = prepareZakatyProvisioning(tenant, seller, 'production');
  assert.equal(result.error, undefined);
  assert.equal(result.payload.externalTenantId, tenant._id);
  assert.equal(result.payload.tenant.vatNumber, tenant.taxSettings.taxNumber);
  assert.equal(result.payload.tenant.name, seller.legalName);
  assert.equal(result.payload.egsUnit.invoiceTypeCode, '0100');
  assert.equal(result.payload.egsUnit.serialNumber, `MIQASS-${tenant._id}-POS-1`);
  assert.ok(prepareZakatyProvisioning(tenant, { ...seller, legalName: '' }, 'production').error);
  assert.ok(prepareZakatyProvisioning(tenant, seller, 'invalid').error);
});

test('paid POS items map to VAT-inclusive Zakaty lines and stable invoice id', () => {
  const result = prepareZakatyInvoice({ tenant, sale, items, buyer, baseUrl: 'https://zatca.example.com' });
  assert.equal(result.ready, true);
  assert.equal(result.payload.externalInvoiceId, `miqass:${tenant._id}:${sale._id}`);
  assert.equal(result.payload.idempotencyKey, result.payload.externalInvoiceId);
  assert.equal(result.payload.issueDate, '2026-10-04');
  assert.equal(result.payload.issueTime, '18:30:00');
  assert.equal(result.payload.items[0].unitPrice, 20);
  assert.equal(result.payload.items[0].priceIncludesVat, true);
  assert.equal(result.payload.items[0].vatRate, 15);
  assert.equal(result.payload.items[1].name, 'منتج');
});

test('cash buyer needs no invented address for a simplified invoice', () => {
  const result = prepareZakatyInvoice({ tenant, sale, items, baseUrl: 'https://zatca.example.com' });
  assert.equal(result.ready, true);
  assert.deepEqual(result.payload.buyer, { name: 'عميل نقدي' });
});

test('unpaid or inconsistent sales are blocked before any integration', () => {
  const result = prepareZakatyInvoice({ tenant, sale: { ...sale, status: 'Draft' }, items: [{ ...items[0], totalAmount: 21 }], buyer, baseUrl: 'https://zatca.example.com' });
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.includes('الدفع')));
  assert.ok(result.issues.some((issue) => issue.includes('لا يطابق')));
});

test('an appointment sale cannot enter Zakaty before legacy invoice reconciliation', () => {
  const result = prepareZakatyInvoice({
    tenant,
    sale: { ...sale, appointmentId: '507f1f77bcf86cd799439013' },
    items, buyer, baseUrl: 'https://zatca.example.com',
  });
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.includes('المزدوج')));
});
