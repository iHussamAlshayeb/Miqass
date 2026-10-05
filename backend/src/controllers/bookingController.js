// تم تقسيم هذا الملف إلى controllers/booking/* — نُبقيه لتوافق الاستيرادات الحالية
const customerAccessController = require("./booking/customerAccessController");
const publicBookingController = require("./booking/publicBookingController");
const salonBookingController = require("./booking/salonBookingController");

module.exports = {
  ...customerAccessController,
  ...publicBookingController,
  ...salonBookingController,
};
