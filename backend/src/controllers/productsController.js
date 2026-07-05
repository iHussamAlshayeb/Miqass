const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toQuantity = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

const cleanString = (value) => String(value || "").trim();

const mapProduct = (product) => ({
  ...(product._doc ? product._doc : product),
  isLowStock:
    Number(product.stockQuantity || 0) <= Number(product.lowStockThreshold || 0),
});

const listProducts = async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.includeInactive !== "true") query.isActive = true;
    if (req.query.category) query.category = cleanString(req.query.category);
    if (req.query.q) {
      const q = cleanString(req.query.q);
      query.$or = [
        { name: new RegExp(q, "i") },
        { sku: new RegExp(q, "i") },
        { barcode: new RegExp(q, "i") },
      ];
    }

    const products = await Product.find(query)
      .sort({ isActive: -1, name: 1 })
      .lean();

    res.status(200).json({ products: products.map(mapProduct) });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب المنتجات" });
  }
};

const createProduct = async (req, res) => {
  try {
    const name = cleanString(req.body.name);
    const salePrice = toMoney(req.body.salePrice);
    const initialStock = toQuantity(req.body.stockQuantity);

    if (!name || salePrice < 0 || initialStock < 0) {
      return res.status(400).json({ message: "بيانات المنتج غير مكتملة." });
    }

    const product = await Product.create({
      tenantId: req.tenantId,
      name,
      sku: cleanString(req.body.sku),
      barcode: cleanString(req.body.barcode),
      category: cleanString(req.body.category) || "عام",
      salePrice,
      costPrice: toMoney(req.body.costPrice),
      stockQuantity: initialStock,
      lowStockThreshold: Math.max(Number(req.body.lowStockThreshold) || 0, 0),
      isActive: req.body.isActive !== false,
    });

    if (initialStock > 0) {
      await InventoryMovement.create({
        tenantId: req.tenantId,
        productId: product._id,
        type: "initial",
        quantity: initialStock,
        unitCost: product.costPrice,
        unitPrice: product.salePrice,
        balanceAfter: product.stockQuantity,
        referenceType: "Product",
        referenceId: product._id,
        note: "رصيد افتتاحي",
      });
    }

    res.status(201).json({
      message: "تم إضافة المنتج بنجاح.",
      product: mapProduct(product),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: "رمز المنتج أو الباركود مستخدم مسبقاً." });
    }
    res.status(500).json({ message: "حدث خطأ أثناء إضافة المنتج" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const updateData = {
      name: cleanString(req.body.name),
      sku: cleanString(req.body.sku),
      barcode: cleanString(req.body.barcode),
      category: cleanString(req.body.category) || "عام",
      salePrice: toMoney(req.body.salePrice),
      costPrice: toMoney(req.body.costPrice),
      lowStockThreshold: Math.max(Number(req.body.lowStockThreshold) || 0, 0),
      isActive: req.body.isActive !== false,
    };

    if (!updateData.name || updateData.salePrice < 0) {
      return res.status(400).json({ message: "بيانات المنتج غير مكتملة." });
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.productId, tenantId: req.tenantId },
      updateData,
      { returnDocument: "after" },
    ).lean();

    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });

    res.status(200).json({
      message: "تم تحديث المنتج بنجاح.",
      product: mapProduct(product),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: "رمز المنتج أو الباركود مستخدم مسبقاً." });
    }
    res.status(500).json({ message: "حدث خطأ أثناء تحديث المنتج" });
  }
};

const adjustProductStock = async (req, res) => {
  try {
    const quantity = toQuantity(req.body.quantity);
    const type = ["purchase", "adjustment"].includes(req.body.type)
      ? req.body.type
      : "adjustment";

    if (!quantity) {
      return res.status(400).json({ message: "كمية التعديل غير صالحة." });
    }

    const product = await Product.findOne({
      _id: req.params.productId,
      tenantId: req.tenantId,
    });

    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });

    const balanceAfter = toQuantity(product.stockQuantity + quantity);
    if (balanceAfter < 0) {
      return res
        .status(400)
        .json({ message: "لا يمكن أن يصبح المخزون أقل من صفر." });
    }

    product.stockQuantity = balanceAfter;
    if (req.body.costPrice !== undefined) product.costPrice = toMoney(req.body.costPrice);
    await product.save();

    const movement = await InventoryMovement.create({
      tenantId: req.tenantId,
      productId: product._id,
      type,
      quantity,
      unitCost: product.costPrice,
      unitPrice: product.salePrice,
      balanceAfter,
      referenceType: "Manual",
      note: cleanString(req.body.note),
    });

    res.status(200).json({
      message: "تم تحديث المخزون بنجاح.",
      product: mapProduct(product),
      movement,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تحديث المخزون" });
  }
};

const listInventoryMovements = async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.params.productId) query.productId = req.params.productId;

    const movements = await InventoryMovement.find(query)
      .populate("productId", "name sku barcode")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 300))
      .lean();

    res.status(200).json({ movements });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب حركة المخزون" });
  }
};

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  adjustProductStock,
  listInventoryMovements,
};
