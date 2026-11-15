const mongoose = require("mongoose");
const Product = require("../models/Product");
const SaleItem = require("../models/SaleItem");
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
    const query = { tenantId: req.tenantId, archivedAt: null };
    if (req.query.includeInactive !== "true") query.isActive = true;
    if (req.query.category) query.category = cleanString(req.query.category);
    if (req.query.q) {
      const q = cleanString(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    if (!mongoose.Types.ObjectId.isValid(req.params.productId)) return res.status(404).json({ message: "المنتج غير موجود" });
    const product = await Product.findOneAndUpdate(
      { _id: req.params.productId, tenantId: req.tenantId, archivedAt: null },
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

/**
 * حركة مخزون يدوية:
 * - purchase: استلام بضاعة (+) مع تكلفة وحدة اختيارية تُحدّث متوسط التكلفة
 * - adjustment: تعديل بالموجب أو السالب (تالف، هدر...)
 * - count: جرد، تُرسل الكمية الفعلية ويُحسب الفرق
 * التحديث ذري حتى لا تتداخل حركتان أو بيع متزامن.
 */
const adjustProductStock = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.productId)) return res.status(404).json({ message: "المنتج غير موجود" });
    const mode = ["purchase", "adjustment", "count"].includes(req.body.type) ? req.body.type : "adjustment";
    const note = cleanString(req.body.note).slice(0, 200);

    const product = await Product.findOne({ _id: req.params.productId, tenantId: req.tenantId, archivedAt: null }).lean();
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });

    let quantity = toQuantity(req.body.quantity);
    if (mode === "count") {
      const counted = toQuantity(req.body.countedQuantity);
      if (req.body.countedQuantity === "" || req.body.countedQuantity === undefined || counted < 0) {
        return res.status(400).json({ message: "اكتب الكمية الفعلية بعد الجرد." });
      }
      quantity = toQuantity(counted - product.stockQuantity);
      if (!quantity) return res.status(400).json({ message: "الكمية الفعلية مطابقة للمخزون، لا يوجد فرق." });
    }
    if (!quantity) return res.status(400).json({ message: "كمية التعديل غير صالحة." });
    if (mode === "purchase" && quantity < 0) return res.status(400).json({ message: "كمية الاستلام يجب أن تكون موجبة." });

    const set = {};
    const unitCost = req.body.unitCost === undefined || req.body.unitCost === "" ? null : toMoney(req.body.unitCost);
    if (unitCost !== null && unitCost < 0) return res.status(400).json({ message: "تكلفة الوحدة غير صالحة." });
    if (mode === "purchase" && unitCost !== null) {
      // متوسط مرجّح: الرصيد الحالي بتكلفته القديمة + المستلم بتكلفته الجديدة
      const currentQty = Math.max(product.stockQuantity, 0);
      set.costPrice = toMoney((currentQty * product.costPrice + quantity * unitCost) / (currentQty + quantity));
    }

    const updated = await Product.findOneAndUpdate(
      { _id: product._id, tenantId: req.tenantId, stockQuantity: { $gte: -quantity } },
      { $inc: { stockQuantity: quantity }, ...(Object.keys(set).length ? { $set: set } : {}) },
      { returnDocument: "after" },
    ).lean();
    if (!updated) return res.status(400).json({ message: "لا يمكن أن يصبح المخزون أقل من صفر." });

    const movement = await InventoryMovement.create({
      tenantId: req.tenantId,
      productId: product._id,
      type: mode === "purchase" ? "purchase" : "adjustment",
      quantity,
      unitCost: unitCost ?? updated.costPrice,
      unitPrice: updated.salePrice,
      balanceAfter: toQuantity(updated.stockQuantity),
      referenceType: "Manual",
      note: mode === "count" ? (note ? `جرد: ${note}` : "جرد") : note,
    });

    res.status(200).json({
      message: mode === "purchase" ? "تم استلام الكمية." : mode === "count" ? "تم تسجيل الجرد." : "تم تحديث المخزون.",
      product: mapProduct(updated),
      movement,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تحديث المخزون" });
  }
};

/**
 * حذف منتج: بدون مبيعات يُحذف نهائياً مع حركاته، وله مبيعات يُؤرشف ليبقى في الفواتير والتقارير.
 * الأرشفة تحرر رمز المنتج والباركود لإعادة استخدامهما.
 */
const deleteProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.productId)) return res.status(404).json({ message: "المنتج غير موجود" });
    const product = await Product.findOne({ _id: req.params.productId, tenantId: req.tenantId, archivedAt: null });
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
    const sold = await SaleItem.exists({ tenantId: req.tenantId, productId: product._id });
    if (sold) {
      product.set({ isActive: false, archivedAt: new Date(), sku: "", barcode: "" });
      await product.save();
      return res.json({ message: "حُذف المنتج من القوائم، وبقي في الفواتير والتقارير السابقة.", archived: true });
    }
    await InventoryMovement.deleteMany({ tenantId: req.tenantId, productId: product._id });
    await product.deleteOne();
    return res.json({ message: "حُذف المنتج.", archived: false });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف المنتج." });
  }
};

const listInventoryMovements = async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.params.productId) {
      if (!mongoose.Types.ObjectId.isValid(req.params.productId)) return res.status(404).json({ message: "المنتج غير موجود" });
      query.productId = req.params.productId;
    }
    if (["initial", "purchase", "sale", "return", "adjustment"].includes(req.query.type)) query.type = req.query.type;

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
  deleteProduct,
  listInventoryMovements,
};
