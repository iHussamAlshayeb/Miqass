const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");
const { requireZakatyEnabled } = require("../utils/zakatySwitch");
const { getZakatySaleStatus, submitSaleToZakaty, reconcileZakatySale, submitRefundToZakaty, reconcileRefundZakaty } = require('../controllers/zakatySaleController');
const {
  listSales,
  getSale,
  createSale,
  addSalePayment,
  cancelSale,
  getSaleInvoice,
  getZakatyReadiness,
  listRefunds,
} = require("../controllers/salesController");

router.use(protect);

router.get("/", listSales);
// إشعارات الاسترجاع وإرسالها إلى Zakaty كإشعار دائن
router.get("/refunds", listRefunds);
router.post("/refunds/:refundId/zakaty/submit", requireZakatyEnabled, submitRefundToZakaty);
router.post("/refunds/:refundId/zakaty/reconcile", requireZakatyEnabled, reconcileRefundZakaty);
router.post("/", createSale);
router.get("/:saleId", getSale);
router.post("/:saleId/payments", addSalePayment);
router.post("/:saleId/cancel", cancelSale);
router.get("/:saleId/invoice", getSaleInvoice);
router.get('/:saleId/zakaty-readiness', getZakatyReadiness);
router.get('/:saleId/zakaty/status', getZakatySaleStatus);
router.post('/:saleId/zakaty/submit', requireZakatyEnabled, submitSaleToZakaty);
router.post('/:saleId/zakaty/reconcile', requireZakatyEnabled, reconcileZakatySale);

module.exports = router;
