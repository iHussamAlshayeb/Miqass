const mongoose = require("mongoose");

const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const Payment = require("../models/Payment");
const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");
const Service = require("../models/Service");
const Tenant = require("../models/Tenant");
const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");
const { generateZatcaQR } = require("../utils/zatca");
const { prepareZakatyInvoice } = require('../services/zakatyIntegration');

const VAT_RATE = 0.15;
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

const getCustomerForSale = async ({ tenantId, customerPhone, customerName, session }) => {
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

  let customer = await Customer.findOne({ tenantId, phone: cleanPhone }).session(session);
  if (!customer) {
    [customer] = await Customer.create([{
      tenantId,
      phone: cleanPhone,
      parentName: cleanName || "عميل نقدي",
      children: [],
    }], { session });
  }

  return {
    customer,
    customerSnapshot: {
      name: cleanName || customer.parentName || "عميل نقدي",
      phone: cleanPhone,
    },
  };
};

const saleItemFromCatalog = ({ itemType, serviceId = null, productId = null, name, quantity, unitPrice, unitCost = 0 }) => {
  const totalAmount = toMoney(quantity * unitPrice);
  return {
    itemType,
    serviceId,
    productId,
    name,
    quantity,
    unitPrice: toMoney(unitPrice),
    unitCost: toMoney(unitCost),
    discountAmount: 0,
    vatRate: VAT_RATE,
    vatAmount: calculateVatInclusiveTotals(totalAmount).vatAmount,
    totalAmount,
  };
};

const buildSaleItems = async (tenantId, rawItems = [], session, appointment = null) => {
  if (!Array.isArray(rawItems) || rawItems.length > 100) {
    const error = new Error("بنود البيع غير صالحة.");
    error.statusCode = 400;
    throw error;
  }
  const serviceIds = [];
  const productIds = [];
  for (const item of rawItems) {
    const id = item?.itemType === "service" ? item.serviceId : item?.itemType === "product" ? item.productId : null;
    const quantity = Number(item?.quantity);
    if (!id || !mongoose.Types.ObjectId.isValid(id) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10000) {
      const error = new Error("نوع البند أو كميته غير صالحة.");
      error.statusCode = 400;
      throw error;
    }
    if (item.itemType === "service") serviceIds.push(String(id));
    else productIds.push(String(id));
  }

  const services = await Service.find({ _id: { $in: [...new Set(serviceIds)] }, tenantId, isActive: true }).session(session).lean();
  const products = await Product.find({ _id: { $in: [...new Set(productIds)] }, tenantId, isActive: true }).session(session).lean();
  const servicesById = new Map(services.map((service) => [String(service._id), service]));
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const requestedProductQuantities = new Map();
  for (const item of rawItems.filter((entry) => entry.itemType === "product")) {
    const id = String(item.productId);
    requestedProductQuantities.set(id, (requestedProductQuantities.get(id) || 0) + Number(item.quantity));
  }
  for (const [id, quantity] of requestedProductQuantities) {
    const product = productsById.get(id);
    if (!product || Number(product.stockQuantity || 0) < quantity) {
      const error = new Error(`المنتج غير متاح أو الكمية المطلوبة غير متوفرة${product ? `: ${product.name}` : ""}.`);
      error.statusCode = 400;
      throw error;
    }
  }

  const bookedItems = (appointment?.selectedServices || []).map((service) => saleItemFromCatalog({
    itemType: service.serviceId ? "service" : "custom",
    serviceId: service.serviceId || null,
    name: service.name,
    quantity: 1,
    unitPrice: Number(service.price || 0),
  }));
  if (appointment && bookedItems.length === 0 && Number(appointment.totalPrice) > 0) {
    bookedItems.push(saleItemFromCatalog({ itemType: "custom", name: "خدمة حلاقة", quantity: 1, unitPrice: appointment.totalPrice }));
  }

  const items = [...bookedItems, ...rawItems.map((item) => {
    const quantity = Number(item.quantity);
    if (item.itemType === "service") {
      const service = servicesById.get(String(item.serviceId));
      if (!service) {
        const error = new Error("إحدى الخدمات غير متاحة لهذا الصالون.");
        error.statusCode = 400;
        throw error;
      }
      return saleItemFromCatalog({ itemType: "service", serviceId: service._id, name: service.name, quantity, unitPrice: service.price });
    }
    const product = productsById.get(String(item.productId));
    if (!product) {
      const error = new Error("أحد المنتجات غير متاح لهذا الصالون.");
      error.statusCode = 400;
      throw error;
    }
    return saleItemFromCatalog({ itemType: "product", productId: product._id, name: product.name, quantity, unitPrice: product.salePrice, unitCost: product.costPrice });
  })];
  if (items.length === 0) {
    const error = new Error("الرجاء إضافة خدمة أو منتج واحد على الأقل للبيع.");
    error.statusCode = 400;
    throw error;
  }

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

const applySaleInventoryMovements = async ({ tenantId, saleId, saleItems = [], type = "sale", note = "", session }) => {
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
      { returnDocument: "after", session },
    ).lean();

    if (!product) {
      const error = new Error(`تعذر تحديث مخزون المنتج ${item.name}.`);
      error.statusCode = 409;
      throw error;
    }

    await InventoryMovement.create([{
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
    }], { session });
  }
};

const validatePayments = (payments = []) => {
  if (!Array.isArray(payments)) {
    const error = new Error("الدفعات غير صالحة.");
    error.statusCode = 400;
    throw error;
  }
  return payments.map((payment) => {
    const amount = Number(payment?.amount);
    if (!VALID_PAYMENT_METHODS.includes(payment?.method) || !Number.isFinite(amount) || amount <= 0 || toMoney(amount) <= 0) {
      const error = new Error("مبلغ الدفعة أو طريقة الدفع غير صالحة.");
      error.statusCode = 400;
      throw error;
    }
    return {
      method: payment.method,
      amount: toMoney(amount),
      provider: String(payment.provider || ""),
      providerPaymentId: String(payment.providerPaymentId || ""),
    };
  });
};

const createPaidPayments = async ({ tenantId, saleId, payments = [], session }) => {
  if (payments.length === 0) return [];
  return Payment.insertMany(
    payments.map((payment) => ({
      tenantId,
      saleId,
      method: payment.method,
      amount: payment.amount,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: "Paid",
      paidAt: new Date(),
    })),
    { session },
  );
};

const listSales = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const query = { tenantId: req.tenantId };

    if (req.query.appointmentId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.appointmentId)) return res.status(400).json({ message: "معرّف الحجز غير صالح." });
      query.appointmentId = req.query.appointmentId;
    }

    if (req.query.status) query.status = req.query.status;

    const sales = await Sale.find(query)
      .select('-zakaty.payload -zakaty.qrBase64 -zakaty.lockOwner -zakaty.lockExpiresAt')
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
    }).select('-zakaty.payload -zakaty.qrBase64 -zakaty.lockOwner -zakaty.lockExpiresAt').lean();

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
  const requestId = String(req.body.requestId || "").trim();
  const appointmentId = req.body.appointmentId || null;
  if (!requestId || requestId.length > 128 || (appointmentId && !mongoose.Types.ObjectId.isValid(appointmentId))) {
    return res.status(400).json({ message: "معرّف طلب البيع أو الحجز غير صالح." });
  }

  let session;
  try {
    await Sale.init();
    const existing = await Sale.findOne({ tenantId: req.tenantId, requestId }).lean();
    if (existing) return res.status(200).json({ message: "تم حفظ البيع مسبقاً.", sale: existing });
    if (appointmentId) {
      const linkedSale = await Sale.findOne({ tenantId: req.tenantId, appointmentId }).lean();
      if (linkedSale) return res.status(200).json({ message: "يوجد بيع مرتبط بهذا الحجز مسبقاً.", sale: linkedSale });
    }
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const appointment = appointmentId
        ? await Appointment.findOne({ _id: appointmentId, tenantId: req.tenantId, status: "Completed" }).session(session).lean()
        : null;
      if (appointmentId && !appointment) {
        const error = new Error("الحجز غير موجود أو لم تكتمل الحلاقة بعد.");
        error.statusCode = 409;
        throw error;
      }
      if (appointment?.saleId) {
        const error = new Error("هذا الحجز مرتبط بعملية بيع مسبقاً.");
        error.statusCode = 409;
        throw error;
      }
      const { items, totals } = await buildSaleItems(req.tenantId, req.body.items, session, appointment);
      if (totals.totalAmount <= 0) {
        const error = new Error("يجب أن يكون إجمالي البيع أكبر من صفر.");
        error.statusCode = 400;
        throw error;
      }
      const validPayments = validatePayments(req.body.payments || []);
      const depositAmount = appointment?.payment?.status === "Paid" ? toMoney(appointment.payment.amount) : 0;
      const paidAmount = toMoney(depositAmount + validPayments.reduce((sum, payment) => sum + payment.amount, 0));
      if (paidAmount > totals.totalAmount + 0.001) {
        const error = new Error("مبلغ الدفعات أكبر من إجمالي البيع.");
        error.statusCode = 400;
        throw error;
      }
      const tenant = await Tenant.findByIdAndUpdate(
        req.tenantId,
        { $inc: { posInvoiceCounter: 1 } },
        { returnDocument: "after", select: "posInvoiceCounter", session },
      ).lean();
      if (!tenant) {
        const error = new Error("الصالون غير موجود.");
        error.statusCode = 404;
        throw error;
      }
      const bookedCustomer = appointment
        ? await Customer.findOne({ _id: appointment.customerId, tenantId: req.tenantId }).session(session).lean()
        : null;
      const { customer, customerSnapshot } = appointment
        ? { customer: bookedCustomer, customerSnapshot: { name: appointment.childName, phone: bookedCustomer?.phone || "" } }
        : await getCustomerForSale({
            tenantId: req.tenantId,
            customerPhone: req.body.customerPhone,
            customerName: req.body.customerName,
            session,
          });
      const [sale] = await Sale.create([{
        tenantId: req.tenantId,
        customerId: customer?._id || null,
        appointmentId,
        source: appointment ? "appointment" : "pos",
        requestId,
        invoiceNumber: `POS-${tenant.posInvoiceCounter}`,
        customerSnapshot,
        ...totals,
        paidAmount,
        status: getSaleStatus(totals.totalAmount, paidAmount),
      }], { session });
      const saleItems = await SaleItem.insertMany(items.map((item) => ({
        ...item,
        tenantId: req.tenantId,
        saleId: sale._id,
      })), { session });
      await applySaleInventoryMovements({
        tenantId: req.tenantId,
        saleId: sale._id,
        saleItems,
        type: "sale",
        note: "بيع من نقطة البيع",
        session,
      });
      const payments = await createPaidPayments({
        tenantId: req.tenantId,
        saleId: sale._id,
        payments: validPayments,
        session,
      });
      if (depositAmount > 0) {
        const [depositPayment] = await Payment.create([{
          tenantId: req.tenantId,
          saleId: sale._id,
          method: VALID_PAYMENT_METHODS.includes(appointment.payment.method) ? appointment.payment.method : "online",
          amount: depositAmount,
          status: "Paid",
          provider: appointment.payment.provider || "appointment",
          providerPaymentId: appointment.payment.providerPaymentId || appointment.payment.moyasarPaymentId || `appointment:${appointment._id}:deposit`,
          paidAt: new Date(),
        }], { session });
        payments.push(depositPayment);
      }
      if (appointment) {
        const linked = await Appointment.updateOne(
          { _id: appointment._id, tenantId: req.tenantId, saleId: null },
          { $set: { saleId: sale._id } },
          { session },
        );
        if (linked.modifiedCount !== 1) {
          const error = new Error("تعذر ربط عملية البيع بالحجز.");
          error.statusCode = 409;
          throw error;
        }
      }
      result = mapSale(sale.toObject(), saleItems, payments);
    });

    res.status(201).json({
      message: "تم إنشاء عملية البيع بنجاح.",
      sale: result,
    });
  } catch (error) {
    if (error.code === 11000) {
      const saved = await Sale.findOne({ tenantId: req.tenantId, $or: [{ requestId }, ...(appointmentId ? [{ appointmentId }] : [])] }).lean();
      if (saved) return res.status(200).json({ message: "تم حفظ البيع مسبقاً.", sale: saved });
    }
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "حدث خطأ أثناء إنشاء عملية البيع" });
  } finally {
    if (session) await session.endSession();
  }
};

const addSalePayment = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const [payment] = validatePayments([req.body]);
      const sale = await Sale.findOne({
        _id: req.params.saleId,
        tenantId: req.tenantId,
        status: { $ne: "Cancelled" },
      }).session(session);
      if (!sale) {
        const error = new Error("عملية البيع غير موجودة.");
        error.statusCode = 404;
        throw error;
      }
      const paidAmount = toMoney(sale.paidAmount + payment.amount);
      if (paidAmount > sale.totalAmount + 0.001) {
        const error = new Error("مبلغ الدفعة أكبر من المبلغ المتبقي.");
        error.statusCode = 400;
        throw error;
      }
      sale.paidAmount = paidAmount;
      sale.status = getSaleStatus(sale.totalAmount, paidAmount);
      await sale.save({ session });
      const payments = await createPaidPayments({ tenantId: req.tenantId, saleId: sale._id, payments: [payment], session });
      result = { sale, payments };
    });

    res.status(201).json({
      message: "تم تسجيل الدفعة بنجاح.",
      ...result,
    });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "حدث خطأ أثناء تسجيل الدفعة" });
  } finally {
    if (session) await session.endSession();
  }
};

const cancelSale = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const sale = await Sale.findOne({
        _id: req.params.saleId,
        tenantId: req.tenantId,
        status: { $ne: "Cancelled" },
      }).session(session);
      if (!sale) {
        const error = new Error("عملية البيع غير موجودة.");
        error.statusCode = 404;
        throw error;
      }
      if (sale.paidAmount > 0) {
        const error = new Error("لا يمكن إلغاء بيع مدفوع قبل معالجة استرجاع المبلغ.");
        error.statusCode = 409;
        throw error;
      }
      if (sale.appointmentId) {
        const error = new Error("لا يمكن إلغاء بيع مرتبط بحجز من نقطة البيع.");
        error.statusCode = 409;
        throw error;
      }
      const saleItems = await SaleItem.find({ tenantId: req.tenantId, saleId: sale._id, itemType: "product" }).session(session).lean();
      await applySaleInventoryMovements({
        tenantId: req.tenantId,
        saleId: sale._id,
        saleItems,
        type: "return",
        note: req.body.cancelReason || "إلغاء عملية البيع",
        session,
      });
      sale.status = "Cancelled";
      sale.cancelledAt = new Date();
      sale.cancelReason = req.body.cancelReason || "";
      await sale.save({ session });
      result = sale;
    });

    res.status(200).json({ message: "تم إلغاء عملية البيع.", sale: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "حدث خطأ أثناء إلغاء عملية البيع" });
  } finally {
    if (session) await session.endSession();
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
    const zakatyAccepted = ['Accepted', 'AcceptedWithWarnings'].includes(sale.zakaty?.status);
    const qrCode = zakatyAccepted
      ? sale.zakaty?.qrBase64 || null
      : taxNumber ? generateZatcaQR(
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
        itemType: items.some((item) => item.itemType === "service" || item.itemType === "custom")
          ? (items.some((item) => item.itemType === "product") ? "mixed" : "service")
          : "product",
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
        isZatcaPhase2: !!(zakatyAccepted && sale.zakaty?.qrBase64),
        zakatyStatus: sale.zakaty?.status || 'NotSubmitted',
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إصدار فاتورة البيع" });
  }
};

const getZakatyReadiness = async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.saleId, tenantId: req.tenantId }).lean();
    if (!sale) return res.status(404).json({ message: 'عملية البيع غير موجودة' });
    if (['Accepted', 'AcceptedWithWarnings'].includes(sale.zakaty?.status)) {
      return res.json({ ready: false, issues: [], invoiceNumber: sale.invoiceNumber, zakatyStatus: sale.zakaty.status });
    }
    const [tenant, items] = await Promise.all([
      Tenant.findById(req.tenantId).select('salonName taxSettings.taxNumber taxSettings.zakaty').lean(),
      SaleItem.find({ tenantId: req.tenantId, saleId: sale._id }).lean(),
    ]);
    const result = prepareZakatyInvoice({ tenant, sale, items, baseUrl: process.env.ZAKATY_BASE_URL });
    if (result.ready && tenant.taxSettings?.zakaty?.tenantId) {
      const { getZakatyEgsUnit } = require('../services/zakatyClient');
      try {
        const unit = await getZakatyEgsUnit(tenant);
        if (unit.status !== 'production_ready' || !unit.hasProductionCsid) {
          result.ready = false;
          result.issues.push('وحدة EGS لم تكمل إعداد شهادة الإنتاج في Zakaty.');
        }
      } catch {
        result.ready = false;
        result.issues.push('تعذر التحقق من جاهزية وحدة EGS في Zakaty.');
      }
    }
    return res.json({ ready: result.ready, issues: result.issues, invoiceNumber: sale.invoiceNumber, zakatyStatus: sale.zakaty?.status || 'NotSubmitted' });
  } catch (error) {
    return res.status(500).json({ message: 'تعذر فحص جاهزية الفاتورة لـ Zakaty' });
  }
};

module.exports = {
  listSales,
  getSale,
  createSale,
  addSalePayment,
  cancelSale,
  getSaleInvoice,
  getZakatyReadiness,
};
