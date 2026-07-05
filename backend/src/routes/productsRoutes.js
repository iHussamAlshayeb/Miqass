const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");
const {
  listProducts,
  createProduct,
  updateProduct,
  adjustProductStock,
  listInventoryMovements,
} = require("../controllers/productsController");

router.use(protect);

router.get("/", listProducts);
router.post("/", createProduct);
router.get("/inventory/movements", listInventoryMovements);
router.put("/:productId", updateProduct);
router.post("/:productId/stock", adjustProductStock);
router.get("/:productId/movements", listInventoryMovements);

module.exports = router;
