const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");
const {
  listExpenses,
  createExpense,
  updateExpense,
  cancelExpense,
} = require("../controllers/expensesController");

router.use(protect);

router.get("/", listExpenses);
router.post("/", createExpense);
router.put("/:expenseId", updateExpense);
router.post("/:expenseId/cancel", cancelExpense);

module.exports = router;
