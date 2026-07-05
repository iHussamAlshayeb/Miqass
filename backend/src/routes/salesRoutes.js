const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");
const {
  listSales,
  getSale,
  createSale,
  addSalePayment,
  cancelSale,
  getSaleInvoice,
} = require("../controllers/salesController");

router.use(protect);

router.get("/", listSales);
router.post("/", createSale);
router.get("/:saleId", getSale);
router.post("/:saleId/payments", addSalePayment);
router.post("/:saleId/cancel", cancelSale);
router.get("/:saleId/invoice", getSaleInvoice);

module.exports = router;
