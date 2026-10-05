const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_TEMPLATES,
  getTemplates,
  renderTemplate,
  validateTemplates,
} = require('../src/utils/whatsappTemplates');

test('existing salons retain default WhatsApp messages', () => {
  assert.deepEqual(getTemplates({ whatsappSettings: {} }), DEFAULT_TEMPLATES);
  assert.match(renderTemplate({}, 'confirmation', {
    اسم_الصالون: 'بالون', اسم_العميل: 'أحمد', التاريخ: '2026-10-04',
    الوقت: '06:00 مساءً', الحلاق: '', الموقع: '', رقم_التواصل: '',
  }), /تم تأكيد حجز \*أحمد\*/);
});

test('a salon override affects only its own selected message', () => {
  const tenant = { whatsappSettings: { templates: { reminder: 'مرحباً {اسم_العميل} في {اسم_الصالون}' } } };
  assert.equal(renderTemplate(tenant, 'reminder', { اسم_العميل: 'سارة', اسم_الصالون: 'بالون' }), 'مرحباً سارة في بالون');
  assert.equal(getTemplates(tenant).confirmation, DEFAULT_TEMPLATES.confirmation);
  assert.equal(getTemplates({}).reminder, DEFAULT_TEMPLATES.reminder);
});

test('template validation rejects unknown types, variables, empty and oversized messages', () => {
  assert.equal(validateTemplates({ reminder: 'مرحباً {اسم_العميل}' }), null);
  assert.ok(validateTemplates({ other: 'نص' }));
  assert.ok(validateTemplates({ reminder: '{رابط_التقييم}' }));
  assert.ok(validateTemplates({ reminder: '  ' }));
  assert.ok(validateTemplates({ reminder: 'x'.repeat(4001) }));
});

test('null, undefined or empty stored templates fall back to defaults', () => {
  const tenant = { whatsappSettings: { templates: { confirmation: null, cancellation: undefined, reminder: '   ' } } };
  assert.equal(getTemplates(tenant).confirmation, DEFAULT_TEMPLATES.confirmation);
  assert.equal(getTemplates(tenant).cancellation, DEFAULT_TEMPLATES.cancellation);
  assert.equal(getTemplates(tenant).reminder, DEFAULT_TEMPLATES.reminder);
  assert.doesNotThrow(() => renderTemplate(tenant, 'confirmation', {}));
  assert.doesNotThrow(() => renderTemplate(tenant, 'cancellation', {}));
  const subdoc = { toObject: () => ({ confirmation: null, reminder: 'أهلاً {اسم_العميل}' }) };
  assert.equal(renderTemplate({ whatsappSettings: { templates: subdoc } }, 'reminder', { اسم_العميل: 'علي' }), 'أهلاً علي');
  assert.equal(getTemplates({ whatsappSettings: { templates: subdoc } }).confirmation, DEFAULT_TEMPLATES.confirmation);
});
