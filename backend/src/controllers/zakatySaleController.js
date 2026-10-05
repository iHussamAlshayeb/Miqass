const crypto = require('crypto');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Tenant = require('../models/Tenant');
const { prepareZakatyInvoice } = require('../services/zakatyIntegration');
const {
  getZakatyInvoiceStatus,
  getZakatyEgsUnit,
  submitZakatyInvoice,
  normalizeZakatyResult,
  summarizeZakatyError,
} = require('../services/zakatyClient');

const FINAL_STATUSES = ['Accepted', 'AcceptedWithWarnings'];

const presentStatus = (sale) => ({
  status: sale.zakaty?.status || 'NotSubmitted',
  externalInvoiceId: sale.zakaty?.externalInvoiceId || '',
  invoiceId: sale.zakaty?.invoiceId || '',
  submittedAt: sale.zakaty?.submittedAt || null,
  checkedAt: sale.zakaty?.checkedAt || null,
  lastError: sale.zakaty?.lastError || '',
});

const releaseLock = async (saleId, tenantId, lockOwner, changes) => {
  const updates = Object.fromEntries(Object.entries(changes).map(([key, value]) => [`zakaty.${key}`, value]));
  const sale = await Sale.findOneAndUpdate(
    { _id: saleId, tenantId, 'zakaty.lockOwner': lockOwner },
    { $set: updates, $unset: { 'zakaty.lockOwner': '', 'zakaty.lockExpiresAt': '' } },
    { returnDocument: 'after' },
  ).lean();
  if (!sale) throw new Error('تعذر تثبيت حالة الفاتورة بعد الاتصال.');
  return sale;
};

const getZakatySaleStatus = async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.saleId, tenantId: req.tenantId })
      .select('zakaty.status zakaty.externalInvoiceId zakaty.invoiceId zakaty.submittedAt zakaty.checkedAt zakaty.lastError')
      .lean();
    if (!sale) return res.status(404).json({ message: 'عملية البيع غير موجودة.' });
    return res.json({ zakaty: presentStatus(sale) });
  } catch (error) {
    return res.status(500).json({ message: 'تعذر قراءة حالة Zakaty.' });
  }
};

const processZakatySale = async (req, res, submit) => {
  const saleId = req.params.saleId;
  const tenantId = req.tenantId;
  let lockOwner = null;
  try {
    const sale = await Sale.findOne({ _id: saleId, tenantId }).lean();
    if (!sale) return res.status(404).json({ message: 'عملية البيع غير موجودة.' });
    if (FINAL_STATUSES.includes(sale.zakaty?.status)) return res.json({ zakaty: presentStatus(sale) });
    if (sale.status !== 'Paid') return res.status(409).json({ message: 'يجب إكمال دفع البيع قبل إرساله.' });

    const tenant = await Tenant.findById(tenantId)
      .select('salonName taxSettings.taxNumber taxSettings.zakaty')
      .lean();
    if (!tenant) return res.status(404).json({ message: 'الصالون غير موجود.' });
    if (sale.appointmentId) {
      return res.status(409).json({ message: 'البيع المرتبط بحجز يحتاج تسوية الفاتورة القديمة أولًا لمنع التبليغ المزدوج.' });
    }
    if (!process.env.ZAKATY_BASE_URL || !tenant.taxSettings?.zakaty?.apiKey) {
      return res.status(409).json({ message: 'عنوان الخدمة أو مفتاح Zakaty غير مضبوط.' });
    }
    if (submit && tenant.taxSettings.zakaty.tenantId) {
      const unit = await getZakatyEgsUnit(tenant);
      if (unit.status !== 'production_ready' || !unit.hasProductionCsid) {
        return res.status(409).json({ message: 'وحدة EGS لم تكمل إعداد شهادة الإنتاج في Zakaty.' });
      }
    }

    let payload = sale.zakaty?.payload;
    if (!payload) {
      if (!submit) return res.status(409).json({ message: 'لم تُرسل هذه الفاتورة إلى Zakaty بعد.' });
      const items = await SaleItem.find({ tenantId, saleId }).lean();
      const prepared = prepareZakatyInvoice({ tenant, sale, items, baseUrl: process.env.ZAKATY_BASE_URL });
      if (!prepared.ready) return res.status(409).json({ message: 'الفاتورة غير جاهزة.', issues: prepared.issues });
      payload = prepared.payload;
    }

    lockOwner = crypto.randomUUID();
    const now = new Date();
    const claimed = await Sale.findOneAndUpdate(
      {
        _id: saleId, tenantId, status: 'Paid',
        'zakaty.status': { $nin: FINAL_STATUSES },
        $or: [
          { 'zakaty.lockExpiresAt': { $exists: false } },
          { 'zakaty.lockExpiresAt': null },
          { 'zakaty.lockExpiresAt': { $lte: now } },
        ],
      },
      {
        $set: {
          'zakaty.status': 'Submitting',
          'zakaty.payload': payload,
          'zakaty.externalInvoiceId': payload.externalInvoiceId,
          'zakaty.lockOwner': lockOwner,
          'zakaty.lockExpiresAt': new Date(now.getTime() + 120000),
          'zakaty.lastError': '',
        },
        $inc: { 'zakaty.attempts': 1 },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!claimed) return res.status(409).json({ message: 'الفاتورة قيد المعالجة أو تم قبولها بالفعل.' });

    let result = null;
    if (sale.zakaty?.attempts > 0 || !submit) {
      result = await getZakatyInvoiceStatus(tenant, payload.externalInvoiceId);
    }
    if (!result && submit) result = await submitZakatyInvoice(tenant, payload);

    if (!result) {
      const updated = await releaseLock(saleId, tenantId, lockOwner, {
        status: 'Unknown', checkedAt: new Date(), lastError: 'لم تُعثر على الفاتورة لدى Zakaty. يمكن إعادة الإرسال بالمعرّف نفسه.',
      });
      return res.status(202).json({ zakaty: presentStatus(updated) });
    }
    const updated = await releaseLock(saleId, tenantId, lockOwner, normalizeZakatyResult(result));
    return res.json({ zakaty: presentStatus(updated) });
  } catch (error) {
    const summary = summarizeZakatyError(error);
    if (lockOwner) {
      await releaseLock(saleId, tenantId, lockOwner, {
        status: summary.status === 409 ? 'Conflict' : summary.status >= 400 && summary.status < 500 ? 'Failed' : 'Unknown',
        checkedAt: new Date(), lastError: summary.message,
      }).catch(() => {});
    }
    return res.status(summary.status === 409 ? 409 : 502).json({ message: summary.message });
  }
};

const submitSaleToZakaty = (req, res) => processZakatySale(req, res, true);
const reconcileZakatySale = (req, res) => processZakatySale(req, res, false);

module.exports = { getZakatySaleStatus, submitSaleToZakaty, reconcileZakatySale };
