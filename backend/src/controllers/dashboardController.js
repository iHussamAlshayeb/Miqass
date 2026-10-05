// تم تقسيم هذا الملف إلى controllers/dashboard/* — نُبقيه لتوافق الاستيرادات الحالية
const settingsController = require("./dashboard/settingsController");
const appointmentsController = require("./dashboard/appointmentsController");
const customersController = require("./dashboard/customersController");
const campaignsController = require("./dashboard/campaignsController");

module.exports = {
  ...settingsController,
  ...appointmentsController,
  ...customersController,
  ...campaignsController,
};
