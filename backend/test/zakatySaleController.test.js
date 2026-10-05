const test = require('node:test');
const assert = require('node:assert/strict');
const Sale = require('../src/models/Sale');
const SaleItem = require('../src/models/SaleItem');
const Tenant = require('../src/models/Tenant');
const client = require('../src/services/zakatyClient');

const setPath = (object, path, value) => {
  const parts = path.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part] ||= {};
  target[parts.at(-1)] = value;
};

test('lost submit response is reconciled by external ID without a second POST', async () => {
  const originals = {
    findOne: Sale.findOne,
    findOneAndUpdate: Sale.findOneAndUpdate,
    findItems: SaleItem.find,
    findTenant: Tenant.findById,
    submit: client.submitZakatyInvoice,
    status: client.getZakatyInvoiceStatus,
  };
  const oldUrl = process.env.ZAKATY_BASE_URL;
  process.env.ZAKATY_BASE_URL = 'https://zakaty.example.test';
  const data = {
    sale: {
      _id: '507f1f77bcf86cd799439012', tenantId: '507f1f77bcf86cd799439011',
      status: 'Paid', invoiceNumber: 'POS-120', totalAmount: 20,
      customerSnapshot: { name: 'عميل نقدي' },
      createdAt: new Date('2026-10-04T15:30:00Z'), zakaty: { status: 'NotSubmitted', attempts: 0 },
    },
  };
  const tenant = {
    _id: data.sale.tenantId, salonName: 'صالون الاختبار',
    taxSettings: {
      taxNumber: '300000000000003',
      zakaty: {
        apiKey: 'encrypted-key',
        egsUnitId: '11b159de-6f90-4215-9e50-a10824fc2838',
        seller: { crNumber: '1010000000', street: 'شارع', buildingNumber: '12', city: 'الرياض', postalCode: '12211' },
      },
    },
  };
  let postCount = 0;
  let statusCount = 0;
  try {
    Sale.findOne = () => ({ lean: async () => structuredClone(data.sale) });
    Sale.findOneAndUpdate = (_filter, update) => ({ lean: async () => {
      for (const [key, value] of Object.entries(update.$set || {})) setPath(data.sale, key, value);
      for (const [key, value] of Object.entries(update.$inc || {})) setPath(data.sale, key, (data.sale.zakaty.attempts || 0) + value);
      for (const key of Object.keys(update.$unset || {})) setPath(data.sale, key, undefined);
      return structuredClone(data.sale);
    } });
    Tenant.findById = () => ({ select: () => ({ lean: async () => tenant }) });
    SaleItem.find = () => ({ lean: async () => [{ name: 'حلاقة', quantity: 1, unitPrice: 20, totalAmount: 20, discountAmount: 0, vatRate: 0.15 }] });
    client.submitZakatyInvoice = async () => { postCount += 1; throw new Error('connection reset after accept'); };
    client.getZakatyInvoiceStatus = async (_tenant, externalId) => {
      statusCount += 1;
      assert.equal(externalId, `miqass:${tenant._id}:${data.sale._id}`);
      return { invoiceId: 'provider-invoice', zatcaStatus: 'accepted', qrBase64: 'QR' };
    };
    delete require.cache[require.resolve('../src/controllers/zakatySaleController')];
    const { submitSaleToZakaty } = require('../src/controllers/zakatySaleController');
    const req = { params: { saleId: data.sale._id }, tenantId: tenant._id };
    const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

    const first = response();
    await submitSaleToZakaty(req, first);
    assert.equal(first.statusCode, 502);
    assert.equal(data.sale.zakaty.status, 'Unknown');
    assert.equal(postCount, 1);
    assert.equal(data.sale.zakaty.payload.externalInvoiceId, `miqass:${tenant._id}:${data.sale._id}`);

    const second = response();
    await submitSaleToZakaty(req, second);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.zakaty.status, 'Accepted');
    assert.equal(postCount, 1);
    assert.equal(statusCount, 1);
  } finally {
    Sale.findOne = originals.findOne;
    Sale.findOneAndUpdate = originals.findOneAndUpdate;
    SaleItem.find = originals.findItems;
    Tenant.findById = originals.findTenant;
    client.submitZakatyInvoice = originals.submit;
    client.getZakatyInvoiceStatus = originals.status;
    delete require.cache[require.resolve('../src/controllers/zakatySaleController')];
    if (oldUrl === undefined) delete process.env.ZAKATY_BASE_URL;
    else process.env.ZAKATY_BASE_URL = oldUrl;
  }
});
