const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");
const { getZakatySaleStatus, submitSaleToZakaty, reconcileZakatySale } = require('../controllers/zakatySaleController');
const {
  listSales,
  getSale,
  createSale,
  addSalePayment,
  cancelSale,
  getSaleInvoice,
  getZakatyReadiness,
} = require("../controllers/salesController");

router.use(protect);

router.get("/", listSales);
router.post("/", createSale);
router.get("/:saleId", getSale);
router.post("/:saleId/payments", addSalePayment);
router.post("/:saleId/cancel", cancelSale);
router.get("/:saleId/invoice", getSaleInvoice);
router.get('/:saleId/zakaty-readiness', getZakatyReadiness);
router.get('/:saleId/zakaty/status', getZakatySaleStatus);
router.post('/:saleId/zakaty/submit', submitSaleToZakaty);
router.post('/:saleId/zakaty/reconcile', reconcileZakatySale);

module.exports = router;
