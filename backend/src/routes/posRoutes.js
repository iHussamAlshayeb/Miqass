const express = require("express");
const rateLimit = require("../middlewares/rateLimit");
const { protect } = require("../middlewares/authMiddleware");
const { posAuth } = require("../utils/posAuth");
const { createSale, getSaleInvoice, addSalePayment } = require("../controllers/salesController");
const {
  getCatalog,
  getCurrentShift,
  postOpenShift,
  postCloseShift,
  listShifts,
  getShift,
  searchCustomers,
  getCheckoutAppointment,
  listTodayAppointments,
  updateAppointmentStatusFromPos,
  sendAppointmentReminder,
  listShiftSales,
  listShiftExpenses,
  createDrawerExpense,
  posLogin,
  posMe,
  listCashiers,
  createCashier,
  updateCashier,
  deleteCashier,
} = require("../controllers/posController");

const router = express.Router();

const posLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "محاولات دخول كثيرة. حاول بعد 15 دقيقة." },
});

// دخول الكاشير برمزه
router.post("/login", posLoginLimiter, posLogin);

// للمالك فقط: إدارة الكاشيرين وسجل الورديات السابقة
router.get("/cashiers", protect, listCashiers);
router.post("/cashiers", protect, createCashier);
router.put("/cashiers/:cashierId", protect, updateCashier);
router.delete("/cashiers/:cashierId", protect, deleteCashier);
router.get("/shifts", protect, listShifts);
router.get("/shifts/:shiftId", protect, getShift);

// شاشة نقطة البيع: المالك أو الكاشير
router.use(posAuth);
router.get("/me", posMe);
router.get("/catalog", getCatalog);
router.get("/shift", getCurrentShift);
router.post("/shift/open", postOpenShift);
router.post("/shift/close", postCloseShift);
router.get("/shift/sales", listShiftSales);
router.get("/shift/expenses", listShiftExpenses);
router.post("/shift/expenses", createDrawerExpense);
router.get("/customers", searchCustomers);
router.get("/appointments", listTodayAppointments);
router.get("/appointments/:appointmentId", getCheckoutAppointment);
router.put("/appointments/:appointmentId/status", updateAppointmentStatusFromPos);
router.post("/appointments/:appointmentId/reminder", sendAppointmentReminder);
router.post("/sales", createSale);
router.get("/sales/:saleId/invoice", getSaleInvoice);
router.post("/sales/:saleId/payments", addSalePayment);

module.exports = router;
