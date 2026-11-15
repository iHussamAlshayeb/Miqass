// حالة وضع الصيانة بنسخة في الذاكرة تتجدد من قاعدة البيانات كل 15 ثانية،
// وتتحدث فوراً عند تغييرها من السوبر أدمن (نفس العملية). بديل Redis.
const SystemSettings = require("../models/SystemSettings");

const TTL_MS = 15000;
const DEFAULT_MESSAGE = "النظام تحت الصيانة حالياً لتقديم خدمة أفضل، سنعود قريباً.";

let cached = null;
let loading = null;

const remember = (settings) => {
  cached = {
    isMaintenanceMode: Boolean(settings?.isMaintenanceMode),
    message: settings?.maintenanceMessage || DEFAULT_MESSAGE,
    at: Date.now(),
  };
  return cached;
};

const load = async () => remember(
  await SystemSettings.findOne({ isGlobal: true }).select("isMaintenanceMode maintenanceMessage").lean(),
);

const getMaintenanceState = async () => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  loading ||= load().finally(() => { loading = null; });
  try {
    return await loading;
  } catch (error) {
    // قاعدة البيانات لا تجيب: نكمل بآخر حالة معروفة بدل تعطيل الموقع
    if (cached) return cached;
    throw error;
  }
};

/** تحديث فوري بعد تغيير الوضع من لوحة السوبر أدمن */
const setMaintenanceState = (settings) => remember(settings);

const resetMaintenanceState = () => { cached = null; loading = null; };

module.exports = { getMaintenanceState, setMaintenanceState, resetMaintenanceState, TTL_MS };
