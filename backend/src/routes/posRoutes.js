const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  getCatalog,
  getCurrentShift,
  postOpenShift,
  postCloseShift,
  listShifts,
  getShift,
} = require("../controllers/posController");

const router = express.Router();
router.use(protect);

router.get("/catalog", getCatalog);
router.get("/shift", getCurrentShift);
router.post("/shift/open", postOpenShift);
router.post("/shift/close", postCloseShift);
router.get("/shifts", listShifts);
router.get("/shifts/:shiftId", getShift);

module.exports = router;
