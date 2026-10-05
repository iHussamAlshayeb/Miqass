const VAT_NUMBER = /^3\d{13}3$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const formatRiyadhDateTime = (value) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return { issueDate: `${parts.year}-${parts.month}-${parts.day}`, issueTime: `${parts.hour}:${parts.minute}:${parts.second}` };
};

const presentZakatyConfig = (tenant) => {
  const settings = tenant?.taxSettings?.zakaty || {};
  return {
    hasApiKey: !!settings.apiKey,
    egsUnitId: settings.egsUnitId || '',
    isProvisioned: !!settings.tenantId,
    keyIssuePending: !!settings.keyIssuingAt,
    setupStatus: settings.setup?.status || '',
    setupError: settings.setup?.error || '',
    seller: {
      legalName: settings.seller?.legalName || '',
      crNumber: settings.seller?.crNumber || '',
      street: settings.seller?.street || '',
      buildingNumber: settings.seller?.buildingNumber || '',
      city: settings.seller?.city || '',
      postalCode: settings.seller?.postalCode || '',
    },
  };
};

const validateSeller = (seller, requireLegalName = false) => {
  if (!seller || typeof seller !== 'object' || Array.isArray(seller)) return 'بيانات البائع مطلوبة.';
  const limits = { crNumber: 30, street: 200, buildingNumber: 20, city: 100, postalCode: 20 };
  if (requireLegalName || seller.legalName) limits.legalName = 200;
  for (const [key, max] of Object.entries(limits)) {
    const value = seller[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) return `حقل ${key} غير صالح.`;
  }
  if (seller.crNumber.trim().length < 3 || seller.postalCode.trim().length < 3) return 'السجل التجاري أو الرمز البريدي غير صالح.';
  return null;
};

const validateZakatyConfig = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'بيانات الربط غير صالحة.';
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 512)) return 'مفتاح API غير صالح.';
  if (typeof input.egsUnitId !== 'string' || !UUID.test(input.egsUnitId)) return 'معرّف وحدة EGS غير صالح.';
  return validateSeller(input.seller);
};

const prepareZakatyProvisioning = (tenant, seller, environment, taxNumber = tenant?.taxSettings?.taxNumber) => {
  const sellerError = validateSeller(seller, true);
  if (sellerError) return { error: sellerError };
  if (!VAT_NUMBER.test(taxNumber || '')) return { error: 'الرقم الضريبي للصالون غير صالح.' };
  if (!['sandbox', 'simulation', 'production'].includes(environment)) return { error: 'بيئة Zakaty غير صالحة.' };
  return { payload: {
    externalTenantId: String(tenant._id),
    tenant: {
      name: seller.legalName.trim(),
      vatNumber: taxNumber,
      crNumber: seller.crNumber.trim(),
      environment,
    },
    egsUnit: {
      name: `${seller.legalName.trim()} POS`.slice(0, 200),
      serialNumber: `MIQASS-${tenant._id}-POS-1`,
      invoiceTypeCode: '0100',
    },
  } };
};

const prepareZakatyInvoice = ({ tenant, sale, items, buyer, baseUrl }) => {
  const issues = [];
  const config = tenant?.taxSettings?.zakaty || {};
  const seller = config.seller || {};
  if (!baseUrl) issues.push('لم يُضبط عنوان خدمة Zakaty على الخادم.');
  if (!config.apiKey) issues.push('مفتاح Zakaty الخاص بالصالون غير محفوظ.');
  if (!UUID.test(config.egsUnitId || '')) issues.push('وحدة EGS غير محددة أو غير صالحة.');
  if (!VAT_NUMBER.test(tenant?.taxSettings?.taxNumber || '')) issues.push('الرقم الضريبي للبائع غير صالح.');
  if (config.tenantId && config.registeredVatNumber !== tenant?.taxSettings?.taxNumber) {
    issues.push('الرقم الضريبي تغير بعد تهيئة Zakaty. راجع الربط قبل الإرسال.');
  }
  if (config.tenantId && config.registeredCrNumber !== seller.crNumber) {
    issues.push('السجل التجاري تغير بعد تهيئة Zakaty. راجع الربط قبل الإرسال.');
  }
  if (!seller.legalName?.trim() && !tenant?.salonName) issues.push('اسم المنشأة غير موجود.');
  for (const key of ['crNumber', 'street', 'buildingNumber', 'city', 'postalCode']) {
    if (!seller[key]?.trim()) issues.push(`بيانات البائع ناقصة: ${key}.`);
  }
  if (sale?.status !== 'Paid') issues.push('لا يمكن تجهيز فاتورة Zakaty قبل اكتمال الدفع.');
  if (sale?.appointmentId) {
    issues.push('البيع المرتبط بحجز يحتاج تسوية مسار فاتورة الحجز القديم قبل إرساله إلى Zakaty، لمنع التبليغ المزدوج.');
  }
  if (!sale?.createdAt || Number.isNaN(new Date(sale.createdAt).getTime())) issues.push('تاريخ البيع غير صالح.');
  if (!Array.isArray(items) || items.length === 0) issues.push('لا توجد بنود محفوظة للبيع.');
  const buyerName = String(buyer?.name || sale?.customerSnapshot?.name || 'عميل نقدي').trim();
  if (!buyerName || buyerName.length > 200) issues.push('اسم العميل في الفاتورة غير صالح.');

  const lines = (items || []).map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = Number(item.totalAmount);
    const discountAmount = Number(item.discountAmount || 0);
    const vatRate = Number(item.vatRate);
    if (!item.name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 ||
        !Number.isFinite(lineTotal) || !Number.isFinite(discountAmount) || !Number.isFinite(vatRate) ||
        Math.abs(quantity * unitPrice - discountAmount - lineTotal) > 0.011) {
      issues.push(`بند البيع ${item.name || 'غير معروف'} لا يطابق المبلغ المحفوظ.`);
    }
    if (vatRate !== 0.15) issues.push(`معدل الضريبة في بند ${item.name || 'غير معروف'} غير مدعوم حاليًا.`);
    return {
      name: item.name,
      quantity,
      unitCode: 'PCE',
      unitPrice,
      priceIncludesVat: true,
      vatRate: 15,
      taxCategory: 'S',
      discountAmount,
    };
  });
  const lineTotal = (items || []).reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  if (!Number.isFinite(lineTotal) || Math.abs(lineTotal - Number(sale?.totalAmount || 0)) > 0.011) {
    issues.push('مجموع البنود لا يطابق إجمالي البيع المحفوظ.');
  }

  if (issues.length) return { ready: false, issues, payload: null };
  const { issueDate, issueTime } = formatRiyadhDateTime(sale.createdAt);
  const externalInvoiceId = `miqass:${tenant._id}:${sale._id}`;
  return {
    ready: true,
    issues: [],
    payload: {
      externalInvoiceId,
      idempotencyKey: externalInvoiceId,
      integrationSource: 'miqass-pos',
      egsUnitId: config.egsUnitId,
      invoiceNumber: sale.invoiceNumber,
      invoiceType: 'simplified',
      documentType: 'invoice',
      issueDate,
      issueTime,
      currencyCode: 'SAR',
      seller: {
        name: seller.legalName?.trim() || tenant.salonName,
        vatNumber: tenant.taxSettings.taxNumber,
        crNumber: seller.crNumber,
        street: seller.street,
        buildingNumber: seller.buildingNumber,
        city: seller.city,
        postalCode: seller.postalCode,
        country: 'SA',
      },
      buyer: { name: buyerName },
      items: lines,
    },
  };
};

module.exports = { presentZakatyConfig, validateZakatyConfig, prepareZakatyProvisioning, prepareZakatyInvoice };
