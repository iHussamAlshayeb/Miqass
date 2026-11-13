const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  getCatalog,
  getCurrentShift,
  postOpenShift,
  postCloseShift,
  listShifts,
  getShift,
  searchCustomers,
  getCheckoutAppointment,
  listOpenAppointments,
} = require("../controllers/posController");

const router = express.Router();
router.use(protect);

router.get("/catalog", getCatalog);
router.get("/shift", getCurrentShift);
router.post("/shift/open", postOpenShift);
router.post("/shift/close", postCloseShift);
router.get("/shifts", listShifts);
router.get("/shifts/:shiftId", getShift);
router.get("/customers", searchCustomers);
router.get("/appointments", listOpenAppointments);
router.get("/appointments/:appointmentId", getCheckoutAppointment);

module.exports = router;
