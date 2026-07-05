const Expense = require("../models/Expense");

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const cleanString = (value) => String(value || "").trim();

const VALID_PAYMENT_METHODS = ["cash", "card", "transfer", "online", "other"];

const listExpenses = async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.category) query.category = cleanString(req.query.category);
    if (req.query.from || req.query.to) {
      query.expenseDate = {};
      if (req.query.from) query.expenseDate.$gte = new Date(req.query.from);
      if (req.query.to) query.expenseDate.$lte = new Date(req.query.to);
    }

    const expenses = await Expense.find(query)
      .sort({ expenseDate: -1, createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 300))
      .lean();

    const totalPaid = expenses
      .filter((expense) => expense.status === "Paid")
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    res.status(200).json({
      expenses,
      summary: {
        totalPaid: toMoney(totalPaid),
        count: expenses.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب المصروفات" });
  }
};

const createExpense = async (req, res) => {
  try {
    const category = cleanString(req.body.category);
    const description = cleanString(req.body.description);
    const amount = toMoney(req.body.amount);
    const paymentMethod = VALID_PAYMENT_METHODS.includes(req.body.paymentMethod)
      ? req.body.paymentMethod
      : "cash";

    if (!category || !description || amount <= 0) {
      return res.status(400).json({ message: "بيانات المصروف غير مكتملة." });
    }

    const expense = await Expense.create({
      tenantId: req.tenantId,
      category,
      description,
      amount,
      expenseDate: req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(),
      paymentMethod,
      vendorName: cleanString(req.body.vendorName),
      receiptUrl: cleanString(req.body.receiptUrl),
      status: req.body.status === "Pending" ? "Pending" : "Paid",
    });

    res.status(201).json({
      message: "تم تسجيل المصروف بنجاح.",
      expense,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تسجيل المصروف" });
  }
};

const updateExpense = async (req, res) => {
  try {
    const amount = toMoney(req.body.amount);
    const paymentMethod = VALID_PAYMENT_METHODS.includes(req.body.paymentMethod)
      ? req.body.paymentMethod
      : "cash";

    const updateData = {
      category: cleanString(req.body.category),
      description: cleanString(req.body.description),
      amount,
      expenseDate: req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(),
      paymentMethod,
      vendorName: cleanString(req.body.vendorName),
      receiptUrl: cleanString(req.body.receiptUrl),
      status: ["Paid", "Pending", "Cancelled"].includes(req.body.status)
        ? req.body.status
        : "Paid",
    };

    if (!updateData.category || !updateData.description || amount <= 0) {
      return res.status(400).json({ message: "بيانات المصروف غير مكتملة." });
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.expenseId, tenantId: req.tenantId },
      updateData,
      { returnDocument: "after" },
    ).lean();

    if (!expense) return res.status(404).json({ message: "المصروف غير موجود" });

    res.status(200).json({
      message: "تم تحديث المصروف بنجاح.",
      expense,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تحديث المصروف" });
  }
};

const cancelExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndUpdate(
      {
        _id: req.params.expenseId,
        tenantId: req.tenantId,
        status: { $ne: "Cancelled" },
      },
      {
        status: "Cancelled",
        cancelReason: cleanString(req.body.cancelReason),
      },
      { returnDocument: "after" },
    ).lean();

    if (!expense) return res.status(404).json({ message: "المصروف غير موجود" });

    res.status(200).json({ message: "تم إلغاء المصروف.", expense });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء المصروف" });
  }
};

module.exports = {
  listExpenses,
  createExpense,
  updateExpense,
  cancelExpense,
};
