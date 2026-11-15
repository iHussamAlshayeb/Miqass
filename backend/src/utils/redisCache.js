// قراءة/كتابة كاش Redis بأمان: إن لم يكن Redis جاهزاً نتخطاه فوراً (الطلب يكمل من
// قاعدة البيانات)، وأي أمر يتأخر أكثر من ثانية يُعامل كأنه غير موجود.

const TIMEOUT_MS = 1000;

const withTimeout = (promise) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Redis timeout")), TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
};

const run = async (client, work, fallback) => {
  if (!client.isReady) return fallback;
  try {
    return await withTimeout(work());
  } catch {
    return fallback;
  }
};

const createCache = (client) => ({
  get: (key) => run(client, () => client.get(key), null),
  set: (key, value, options) => run(client, () => client.set(key, value, options), null),
  del: (key) => run(client, () => client.del(key), 0),
});

// العميل يُحمَّل عند أول استخدام فقط (الاختبارات تستخدم createCache بعميل وهمي)
let defaultCache = null;
const cache = () => (defaultCache ||= createCache(require("./redisClient")));

module.exports = {
  get: (key) => cache().get(key),
  set: (key, value, options) => cache().set(key, value, options),
  del: (key) => cache().del(key),
  createCache,
};
