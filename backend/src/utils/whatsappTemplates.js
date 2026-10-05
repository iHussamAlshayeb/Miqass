const DEFAULT_TEMPLATES = Object.freeze({
  confirmation: `يا هلا والله فيك بـ {اسم_الصالون} 👋
تم تأكيد حجز *{اسم_العميل}* بنجاح! ✂️

📅 التاريخ: {التاريخ}
⏰ الوقت: {الوقت}{الحلاق}

📍 موقعنا على الخريطة:
{الموقع}{رقم_التواصل}

يا ليت تشرفنا قبل الموعد بـ 15 دقيقة،
وإذا صار لك ظرف وما بتقدر تحضر، ياليت تبلغنا بوقت كافي.

ننتظرك، ويومك سعيد! ✨`,
  cancellation: `يا هلا فيك من {اسم_الصالون} 👋
حبينا نبلغك إنه تم إلغاء حجز *{اسم_العميل}* {الحلاق}بناءً على طلبكم أو لظرف طارئ.
{سبب_الإلغاء}
نتمنى نشوفك بوقت ثاني! تقدر تحجز موعد جديد متى ما ناسبك بكل سهولة من هنا:
{رابط_الحجز}

في أمان الله! ✨`,
  reminder: `يا هلا بك مرة ثانية من {اسم_الصالون} 👋

مجرد تذكير بسيط بموعد حلاقة *{اسم_العميل}* ✂️✨

⏰ موعدنا: اليوم الساعة {الوقت}{الحلاق}

📍 موقعنا:
{الموقع}{رقم_التواصل}

يا ليت تشرفنا قبل الموعد بـ 15 دقيقة عشان نخدمك بأفضل شكل.. بانتظارك!

*(وإذا صار لك أي طارئ حاب تلغي، ياليت تتواصل معنا).*`,
  review: `يا هلا والله من {اسم_الصالون} 👋
نتمنى إن تجربة الحلاقة لـ *{اسم_العميل}* كانت ممتازة ونالت إعجابكم! ✂️✨

رأيك يهمنا مرة ويساعدنا نتطور ونقدم الأفضل دايماً.
ياليت تتكرم وتقيم تجربتك عبر الرابط السريع هذا:
⭐ {رابط_التقييم}

شكراً لثقتك فينا، ونتمنى نشوفك قريب! 🌟`,
  loyalty: `يا هلا والله بـ {اسم_العميل}، عميلنا المميز في {اسم_الصالون} 👑

حبينا نبلغك إنك كملت معنا 5 زيارات، وهذا يعني إن **حلاقتك الجاية علينا (مـجـانـاً)!** 🎁✂️

تقديراً لولائك وثقتك فينا، احجز موعدك الجاي متى ما حبيت من هنا، وبلغ الكاشير إن عندك مكافأة ولاء:
{رابط_الحجز}

ننتظرك تنورنا! ✨`,
  retention: `يا هلا والله بـ {اسم_العميل} 👋
طالت الغيبة! اشتقنا لزيارتك لنا في {اسم_الصالون} ✂️✨

تقدر تحجز موعدك وتختار حلاقك المفضل بكل سهولة وفي ثواني عبر الرابط:
👇👇
{رابط_الحجز}

ننتظرك تنورنا! 🤍`,
});

const ALLOWED_VARIABLES = Object.freeze({
  confirmation: ['اسم_الصالون', 'اسم_العميل', 'التاريخ', 'الوقت', 'الحلاق', 'الموقع', 'رقم_التواصل'],
  cancellation: ['اسم_الصالون', 'اسم_العميل', 'الحلاق', 'سبب_الإلغاء', 'رابط_الحجز'],
  reminder: ['اسم_الصالون', 'اسم_العميل', 'الوقت', 'الحلاق', 'الموقع', 'رقم_التواصل'],
  review: ['اسم_الصالون', 'اسم_العميل', 'رابط_التقييم'],
  loyalty: ['اسم_الصالون', 'اسم_العميل', 'رابط_الحجز'],
  retention: ['اسم_الصالون', 'اسم_العميل', 'رابط_الحجز'],
});

// القوالب المخزنة قد تكون null أو فارغة (أو subdocument من Mongoose)،
// فنأخذ فقط النصوص غير الفارغة ونرجع للافتراضي في غير ذلك.
const getTemplates = (tenant) => {
  const raw = tenant?.whatsappSettings?.templates;
  const custom = raw && typeof raw.toObject === 'function' ? raw.toObject() : raw || {};
  const merged = { ...DEFAULT_TEMPLATES };
  for (const key of Object.keys(DEFAULT_TEMPLATES)) {
    if (typeof custom[key] === 'string' && custom[key].trim()) merged[key] = custom[key];
  }
  return merged;
};

const renderTemplate = (tenant, type, values = {}) => {
  const template = getTemplates(tenant)[type] ?? DEFAULT_TEMPLATES[type] ?? '';
  return template.replace(/\{([^{}]+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key] ?? '') : match,
  );
};

const validateTemplates = (templates) => {
  if (!templates || typeof templates !== 'object' || Array.isArray(templates)) return 'بيانات القوالب غير صالحة.';
  const keys = Object.keys(DEFAULT_TEMPLATES);
  if (Object.keys(templates).some((key) => !keys.includes(key))) return 'نوع رسالة غير معروف.';
  for (const [key, value] of Object.entries(templates)) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4000) return 'كل رسالة مطلوبة وبحد أقصى 4000 حرف.';
    const variables = [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
    if (variables.some((variable) => !ALLOWED_VARIABLES[key].includes(variable))) return `يوجد متغير غير مدعوم في رسالة ${key}.`;
  }
  return null;
};

module.exports = { DEFAULT_TEMPLATES, ALLOWED_VARIABLES, getTemplates, renderTemplate, validateTemplates };
