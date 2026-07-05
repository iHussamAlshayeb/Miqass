const mongoose = require("mongoose");

const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const Payment = require("../models/Payment");
const Service = require("../models/Service");
const Customer = require("../models/Customer");
const Tenant = require("../models/Tenant");
const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");
const { generateZatcaQR } = require("../utils/zatca");

const VAT_RATE = 0.15;
const VALID_SOURCES = ["appointment", "walk_in", "pos"];
const VALID_PAYMENT_METHODS = ["cash", "card", "transfer", "online"];

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const calculateVatInclusiveTotals = (grossAmount) => {
  const totalAmount = toMoney(grossAmount);
  const subtotal = toMoney(totalAmount / (1 + VAT_RATE));
  const vatAmount = toMoney(totalAmount - subtotal);

  return { subtotal, vatAmount, totalAmount };
};

const getSaleStatus = (totalAmount, paidAmount) => {
  if (paidAmount <= 0) return "Draft";
  if (paidAmount + 0.001 >= totalAmount) return "Paid";
  return "Partially_Paid";
};

const mapSale = (sale, items = [], payments = []) => ({
  ...(sale._doc ? sale._doc : sale),
  items,
  payments,
});

const getCustomerForSale = async ({ tenantId, customerPhone, customerName }) => {
  const cleanPhone = String(customerPhone || "").replace(/\D/g, "");
  const cleanName = String(customerName || "").trim();

  if (!cleanPhone) {
    return {
      customer: null,
      customerSnapshot: {
        name: cleanName || "عميل نقدي",
        phone: "",
      },
    };
  }

  let customer = await Customer.findOne({ tenantId, phone: cleanPhone });
  if (!customer) {
    customer = await Customer.create({
      tenantId,
      phone: cleanPhone,
      parentName: cleanName || "عميل نقدي",
      children: cleanName ? [cleanName] : [],
    });
  } else if (cleanName && !customer.children.includes(cleanName)) {
    await Customer.updateOne(
      { _id: customer._id },
      {
        $set: { parentName: customer.parentName || cleanName },
        $push: { children: cleanName },
      },
    );
  }

  return {
    customer,
    customerSnapshot: {
      name: cleanName || customer.children?.[0] || customer.parentName || "عميل نقدي",
      phone: cleanPhone,
    },
  };
};

const buildSaleItems = async (tenantId, rawItems = []) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const error = new Error("الرجاء إضافة بند واحد على الأقل للبيع.");
    error.statusCode = 400;
    throw error;
  }

  const serviceIds = rawItems
    .filter((item) => item?.itemType === "service")
    .map((item) => item.serviceId)
    .filter(Boolean)
    .map(String);

  const invalidServiceId = serviceIds.find(
    (id) => !mongoose.Types.ObjectId.isValid(id),
  );
  if (invalidServiceId) {
    const error = new Error("إحدى الخدمات المختارة غير صالحة.");
    error.statusCode = 400;
    throw error;
  }

  const productIds = rawItems
    .filter((item) => item?.itemType === "product")
    .map((item) => item.productId)
    .filter(Boolean)
    .map(String);

  const invalidProductId = productIds.find(
    (id) => !mongoose.Types.ObjectId.isValid(id),
  );
  if (invalidProductId) {
    const error = new Error("أحد المنتجات المختارة غير صالح.");
    error.statusCode = 400;
    throw error;
  }

  const services = serviceIds.length
    ? await Service.find({
        _id: { $in: [...new Set(serviceIds)] },
        tenantId,
        isActive: true,
      }).lean()
    : [];
  const servicesById = new Map(services.map((service) => [String(service._id), service]));

  const products = productIds.length
    ? await Product.find({
        _id: { $in: [...new Set(productIds)] },
        tenantId,
        isActive: true,
      }).lean()
    : [];
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  const requestedProductQuantities = rawItems
    .filter((item) => item?.itemType === "product")
    .reduce((map, item) => {
      const productId = String(item.productId || "");
      map.set(productId, toMoney((map.get(productId) || 0) + Number(item.quantity || 1)));
      return map;
    }, new Map());

  for (const [productId, quantity] of requestedProductQuantities.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      const error = new Error("أحد المنتجات المختارة غير متاح لهذا الصالون.");
      error.statusCode = 400;
      throw error;
    }

    if (Number(product.stockQuantity || 0) + 0.001 < quantity) {
      const error = new Error(`الكمية المتاحة من ${product.name} غير كافية.`);
      error.statusCode = 400;
      throw error;
    }
  }

  const items = rawItems.map((item) => {
    const itemType = item?.itemType || "custom";
    const quantity = toMoney(item?.quantity || 1);
    const discountAmount = toMoney(item?.discountAmount || 0);

    if (quantity <= 0) {
      const error = new Error("كمية أحد البنود غير صالحة.");
      error.statusCode = 400;
      throw error;
    }

    let name;
    let serviceId = null;
    let productId = null;
    let unitCost = 0;
    let unitPrice = 0;

    if (itemType === "service") {
      const service = servicesById.get(String(item.serviceId || ""));
      if (!service) {
        const error = new Error("إحدى الخدمات المختارة غير متاحة لهذا الصالون.");
        error.statusCode = 400;
        throw error;
      }

      serviceId = service._id;
      name = service.name;
      unitPrice = toMoney(service.price);
    } else if (itemType === "product") {
      const product = productsById.get(String(item.productId || ""));
      if (!product) {
        const error = new Error("أحد المنتجات المختارة غير متاح لهذا الصالون.");
        error.statusCode = 400;
        throw error;
      }

      productId = product._id;
      name = product.name;
      unitPrice = toMoney(product.salePrice);
      unitCost = toMoney(product.costPrice);
    } else if (itemType === "custom") {
      name = String(item?.name || "").trim();
      unitPrice = toMoney(item?.unitPrice);

      if (!name || unitPrice < 0) {
        const error = new Error("بيانات البند المخصص غير مكتملة.");
        error.statusCode = 400;
        throw error;
      }
    } else {
      const error = new Error("نوع بند البيع غير صالح.");
      error.statusCode = 400;
      throw error;
    }

    const grossBeforeDiscount = toMoney(quantity * unitPrice);
    const lineTotal = toMoney(Math.max(grossBeforeDiscount - discountAmount, 0));
    const { vatAmount } = calculateVatInclusiveTotals(lineTotal);

    return {
      itemType,
      serviceId,
      productId,
      name,
      quantity,
      unitPrice,
      unitCost,
      discountAmount,
      vatRate: VAT_RATE,
      vatAmount,
      totalAmount: lineTotal,
    };
  });

  const totalAmount = toMoney(
    items.reduce((sum, item) => sum + item.totalAmount, 0),
  );
  const discountAmount = toMoney(
    items.reduce((sum, item) => sum + item.discountAmount, 0),
  );
  const { subtotal, vatAmount } = calculateVatInclusiveTotals(totalAmount);

  return {
    items,
    totals: {
      subtotal,
      discountAmount,
      vatAmount,
      totalAmount,
    },
  };
};

const applySaleInventoryMovements = async ({ tenantId, saleId, saleItems = [], type = "sale", note = "" }) => {
  for (const item of saleItems) {
    if (item.itemType !== "product" || !item.productId) continue;

    const quantityChange = type === "sale" ? -Number(item.quantity || 0) : Number(item.quantity || 0);
    const product = await Product.findOneAndUpdate(
      {
        _id: item.productId,
        tenantId,
        ...(quantityChange < 0
          ? { stockQuantity: { $gte: Math.abs(quantityChange) } }
          : {}),
      },
      { $inc: { stockQuantity: quantityChange } },
      { returnDocument: "after" },
    ).lean();

    if (!product) {
      const error = new Error(`تعذر تحديث مخزون المنتج ${item.name}.`);
      error.statusCode = 409;
      throw error;
    }

    await InventoryMovement.create({
      tenantId,
      productId: item.productId,
      type,
      quantity: quantityChange,
      unitCost: item.unitCost || 0,
      unitPrice: item.unitPrice || 0,
      balanceAfter: product.stockQuantity,
      referenceType: "Sale",
      referenceId: saleId,
      note,
    });
  }
};

const createPaidPayments = async ({ tenantId, saleId, payments = [] }) => {
  const validPayments = payments
    .map((payment) => ({
      method: payment?.method || "cash",
      amount: toMoney(payment?.amount),
      provider: String(payment?.provider || ""),
      providerPaymentId: String(payment?.providerPaymentId || ""),
    }))
    .filter((payment) => payment.amount > 0);

  const invalidMethod = validPayments.find(
    (payment) => !VALID_PAYMENT_METHODS.includes(payment.method),
  );
  if (invalidMethod) {
    const error = new Error("طريقة الدفع غير صالحة.");
    error.statusCode = 400;
    throw error;
  }

  if (validPayments.length === 0) return [];

  return Payment.insertMany(
    validPayments.map((payment) => ({
      tenantId,
      saleId,
      method: payment.method,
      amount: payment.amount,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: "Paid",
      paidAt: new Date(),
    })),
  );
};

const listSales = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const query = { tenantId: req.tenantId };

    if (req.query.status) query.status = req.query.status;

    const sales = await Sale.find(query)
      .populate("customerId", "phone parentName children")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ sales });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب المبيعات" });
  }
};

const getSale = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      _id: req.params.saleId,
      tenantId: req.tenantId,
    }).lean();

    if (!sale) return res.status(404).json({ message: "عملية البيع غير موجودة" });

    const [items, payments] = await Promise.all([
      SaleItem.find({ tenantId: req.tenantId, saleId: sale._id }).lean(),
      Payment.find({ tenantId: req.tenantId, saleId: sale._id }).lean(),
    ]);

    res.status(200).json({ sale: mapSale(sale, items, payments) });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب عملية البيع" });
  }
};

const createSale = async (req, res) => {
  try {
    const source = VALID_SOURCES.includes(req.body.source)
      ? req.body.source
      : "pos";

    const tenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $inc: { invoiceCounter: 1 } },
      { returnDocument: "after", select: "invoiceCounter salonName ownerPhone branding taxSettings" },
    ).lean();

    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const { customer, customerSnapshot } = await getCustomerForSale({
      tenantId: req.tenantId,
      customerPhone: req.body.customerPhone,
      customerName: req.body.customerName,
    });

    const { items, totals } = await buildSaleItems(req.tenantId, req.body.items);
    const invoiceNumber = `SALE-${tenant.invoiceCounter}`;

    const sale = await Sale.create({
      tenantId: req.tenantId,
      customerId: customer?._id || null,
      appointmentId: req.body.appointmentId || null,
      source,
      invoiceNumber,
      customerSnapshot,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
      paidAmount: 0,
      status: "Draft",
    });

    const saleItems = await SaleItem.insertMany(
      items.map((item) => ({
        ...item,
        tenantId: req.tenantId,
        saleId: sale._id,
      })),
    );

    await applySaleInventoryMovements({
      tenantId: req.tenantId,
      saleId: sale._id,
      saleItems,
      type: "sale",
      note: "بيع من نقطة البيع",
    });

    const payments = await createPaidPayments({
      tenantId: req.tenantId,
      saleId: sale._id,
      payments: req.body.payments || [],
    });
    const paidAmount = toMoney(
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    );
    const status = getSaleStatus(sale.totalAmount, paidAmount);

    sale.paidAmount = paidAmount;
    sale.status = status;
    await sale.save();

    res.status(201).json({
      message: "تم إنشاء عملية البيع بنجاح.",
      sale: mapSale(sale.toObject(), saleItems, payments),
    });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "حدث خطأ أثناء إنشاء عملية البيع" });
  }
};

const addSalePayment = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      _id: req.params.saleId,
      tenantId: req.tenantId,
      status: { $ne: "Cancelled" },
    });

    if (!sale) return res.status(404).json({ message: "عملية البيع غير موجودة" });

    const requestedAmount = toMoney(req.body.amount);
    const remainingAmount = toMoney(sale.totalAmount - sale.paidAmount);

    if (requestedAmount <= 0) {
      return res.status(400).json({ message: "مبلغ الدفعة غير صالح." });
    }

    if (requestedAmount > remainingAmount + 0.001) {
      return res
        .status(400)
        .json({ message: "مبلغ الدفعة أكبر من المبلغ المتبقي." });
    }

    const payments = await createPaidPayments({
      tenantId: req.tenantId,
      saleId: sale._id,
      payments: [req.body],
    });

    const addedAmount = toMoney(
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    );
    const paidAmount = toMoney(sale.paidAmount + addedAmount);

    sale.paidAmount = paidAmount;
    sale.status = getSaleStatus(sale.totalAmount, paidAmount);
    await sale.save();

    res.status(201).json({
      message: "تم تسجيل الدفعة بنجاح.",
      sale,
      payments,
    });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "حدث خطأ أثناء تسجيل الدفعة" });
  }
};

const cancelSale = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      _id: req.params.saleId,
      tenantId: req.tenantId,
      status: { $ne: "Cancelled" },
    });

    if (!sale) return res.status(404).json({ message: "عملية البيع غير موجودة" });

    const saleItems = await SaleItem.find({
      tenantId: req.tenantId,
      saleId: sale._id,
      itemType: "product",
    }).lean();

    await applySaleInventoryMovements({
      tenantId: req.tenantId,
      saleId: sale._id,
      saleItems,
      type: "return",
      note: req.body.cancelReason || "إلغاء عملية البيع",
    });

    sale.status = "Cancelled";
    sale.cancelledAt = new Date();
    sale.cancelReason = req.body.cancelReason || "";
    await sale.save();

    res.status(200).json({ message: "تم إلغاء عملية البيع.", sale });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء عملية البيع" });
  }
};

const getSaleInvoice = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      _id: req.params.saleId,
      tenantId: req.tenantId,
    }).lean();

    if (!sale) return res.status(404).json({ message: "عملية البيع غير موجودة" });

    const [tenant, items, payments] = await Promise.all([
      Tenant.findById(req.tenantId).select("salonName ownerPhone branding taxSettings").lean(),
      SaleItem.find({ tenantId: req.tenantId, saleId: sale._id }).lean(),
      Payment.find({ tenantId: req.tenantId, saleId: sale._id }).lean(),
    ]);

    const createdAt = new Date(sale.createdAt);
    const totalAmount = toMoney(sale.totalAmount);
    const vatAmount = toMoney(sale.vatAmount);
    const baseAmount = toMoney(sale.subtotal);
    const taxNumber = tenant?.taxSettings?.taxNumber || "";
    const qrCode = taxNumber
      ? generateZatcaQR(
          tenant?.salonName || "",
          taxNumber,
          createdAt.toISOString(),
          totalAmount.toFixed(2),
          vatAmount.toFixed(2),
        )
      : null;
    const paymentMethodLabels = {
      cash: "نقدي",
      card: "شبكة",
      transfer: "تحويل",
      online: "أونلاين",
    };
    const paymentMethod = payments.length
      ? [
          ...new Set(
            payments.map(
              (payment) =>
                paymentMethodLabels[payment.method] || payment.method,
            ),
          ),
        ].join("، ")
      : "غير مدفوع";

    res.status(200).json({
      invoice: {
        invoiceNumber: sale.invoiceNumber,
        salonName: tenant?.salonName || "",
        logoUrl: tenant?.branding?.logoUrl || "",
        phone: tenant?.ownerPhone || "",
        taxNumber,
        date: createdAt.toLocaleDateString("en-GB"),
        isoDate: sale.createdAt,
        time: createdAt.toLocaleTimeString("ar-SA", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        customerName: sale.customerSnapshot?.name || "عميل نقدي",
        customerPhone: sale.customerSnapshot?.phone || "",
        services: items.map((item) => ({
          name: item.name,
          qty: item.quantity,
          quantity: item.quantity,
          price: toMoney(item.totalAmount || item.unitPrice * item.quantity),
          unitPrice: toMoney(item.unitPrice),
        })),
        payments,
        subtotal: baseAmount.toFixed(2),
        baseAmount: baseAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        paidAmount: toMoney(sale.paidAmount).toFixed(2),
        paymentMethod,
        status: sale.status,
        qrCode,
        isZatcaPhase2: false,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إصدار فاتورة البيع" });
  }
};

module.exports = {
  listSales,
  getSale,
  createSale,
  addSalePayment,
  cancelSale,
  getSaleInvoice,
};
