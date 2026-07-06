const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const Payment = require("../models/Payment");
const Tenant = require("../models/Tenant");
const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");

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

const normalizePaymentMethod = (method) =>
  VALID_PAYMENT_METHODS.includes(method) ? method : "online";

const getId = (value) => value?._id || value || null;

const resolveAppointmentCustomer = async (appointment, tenantId) => {
  if (appointment.customerId && appointment.customerId.phone) {
    return appointment.customerId;
  }

  const customerId = getId(appointment.customerId);
  if (!customerId) return null;

  return Customer.findOne({ _id: customerId, tenantId })
    .select("phone parentName children")
    .lean();
};

const buildAppointmentSaleItems = (appointment) => {
  const selectedServices = Array.isArray(appointment.selectedServices)
    ? appointment.selectedServices
    : [];

  const items = selectedServices
    .map((service) => {
      const unitPrice = toMoney(service?.price);
      const name = String(service?.name || "").trim();
      if (!name || unitPrice <= 0) return null;

      const totalAmount = unitPrice;
      const { vatAmount } = calculateVatInclusiveTotals(totalAmount);
      const serviceId = getId(service?.serviceId);

      return {
        itemType: serviceId ? "service" : "custom",
        serviceId,
        productId: null,
        name,
        quantity: 1,
        unitPrice,
        unitCost: 0,
        discountAmount: 0,
        vatRate: VAT_RATE,
        vatAmount,
        totalAmount,
      };
    })
    .filter(Boolean);

  if (items.length === 0 && toMoney(appointment.totalPrice) > 0) {
    const totalAmount = toMoney(appointment.totalPrice);
    const { vatAmount } = calculateVatInclusiveTotals(totalAmount);

    items.push({
      itemType: "custom",
      serviceId: null,
      productId: null,
      name: "خدمة حلاقة",
      quantity: 1,
      unitPrice: totalAmount,
      unitCost: 0,
      discountAmount: 0,
      vatRate: VAT_RATE,
      vatAmount,
      totalAmount,
    });
  }

  const totalAmount = toMoney(
    items.reduce((sum, item) => sum + item.totalAmount, 0),
  );
  const { subtotal, vatAmount } = calculateVatInclusiveTotals(totalAmount);

  return {
    items,
    totals: {
      subtotal,
      discountAmount: 0,
      vatAmount,
      totalAmount,
    },
  };
};

const getAppointmentPaymentProviderId = (appointment) => {
  const providerPaymentId = String(
    appointment.payment?.providerPaymentId ||
      appointment.payment?.moyasarPaymentId ||
      "",
  ).trim();

  return providerPaymentId || `appointment:${appointment._id}:deposit`;
};

const syncAppointmentSalePayment = async ({ tenantId, sale, appointment }) => {
  if (!sale || !appointment) return [];

  const appointmentPayment = appointment.payment || {};
  const totalAmount = toMoney(sale.totalAmount);
  const appointmentPaidAmount =
    appointmentPayment.status === "Paid" ? toMoney(appointmentPayment.amount) : 0;

  if (appointmentPaidAmount > 0 && totalAmount > 0) {
    const providerPaymentId = getAppointmentPaymentProviderId(appointment);
    const existingPayment = await Payment.findOne({
      tenantId,
      saleId: sale._id,
      providerPaymentId,
    }).lean();

    if (!existingPayment) {
      const existingPaidPayments = await Payment.find({
        tenantId,
        saleId: sale._id,
        status: "Paid",
      })
        .select("amount")
        .lean();

      const currentPaidAmount = toMoney(
        existingPaidPayments.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0,
        ),
      );
      const remainingAmount = toMoney(totalAmount - currentPaidAmount);
      const paymentAmount = toMoney(
        Math.min(appointmentPaidAmount, Math.max(remainingAmount, 0)),
      );

      if (paymentAmount > 0) {
        await Payment.create({
          tenantId,
          saleId: sale._id,
          method: normalizePaymentMethod(appointmentPayment.method),
          amount: paymentAmount,
          status: "Paid",
          provider:
            appointmentPayment.provider ||
            (appointmentPayment.moyasarPaymentId ? "moyasar" : "appointment"),
          providerPaymentId,
          paidAt: appointment.updatedAt || new Date(),
        });
      }
    }
  }

  const payments = await Payment.find({
    tenantId,
    saleId: sale._id,
    status: "Paid",
  }).lean();
  const paidAmount = toMoney(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );

  sale.paidAmount = paidAmount;
  sale.status = getSaleStatus(sale.totalAmount, paidAmount);
  await sale.save();

  return payments;
};

const createSaleFromAppointment = async (appointmentInput) => {
  if (!appointmentInput) return null;

  const appointment = appointmentInput._doc
    ? appointmentInput
    : await Appointment.findById(appointmentInput._id || appointmentInput)
        .populate("customerId", "phone parentName children")
        .exec();

  if (!appointment || appointment.status !== "Completed") return null;
  if (appointment.childName === "Padding Block" || appointment.status === "Blocked") {
    return null;
  }

  const tenantId = getId(appointment.tenantId);
  if (!tenantId) return null;

  if (appointment.saleId) {
    const linkedSale = await Sale.findOne({
      _id: getId(appointment.saleId),
      tenantId,
      status: { $ne: "Cancelled" },
    });
    if (linkedSale) {
      const payments = await syncAppointmentSalePayment({
        tenantId,
        sale: linkedSale,
        appointment,
      });
      return { sale: linkedSale, payments };
    }
  }

  const existingSale = await Sale.findOne({
    tenantId,
    appointmentId: appointment._id,
    status: { $ne: "Cancelled" },
  });

  if (existingSale) {
    const payments = await syncAppointmentSalePayment({
      tenantId,
      sale: existingSale,
      appointment,
    });

    await Appointment.updateOne(
      { _id: appointment._id, tenantId },
      { $set: { saleId: existingSale._id } },
    );
    appointment.saleId = existingSale._id;
    return { sale: existingSale, payments };
  }

  const { items, totals } = buildAppointmentSaleItems(appointment);
  if (items.length === 0 || totals.totalAmount <= 0) return null;

  const customer = await resolveAppointmentCustomer(appointment, tenantId);
  const customerId = getId(appointment.customerId);
  const updatedTenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $inc: { invoiceCounter: 1 } },
    { returnDocument: "after", select: "invoiceCounter" },
  ).lean();

  if (!updatedTenant) return null;

  const sale = await Sale.create({
    tenantId,
    customerId,
    appointmentId: appointment._id,
    source:
      appointment.isWalkIn || appointment.bookingSource === "kiosk_walk_in"
        ? "walk_in"
        : "appointment",
    invoiceNumber: `SALE-${updatedTenant.invoiceCounter}`,
    customerSnapshot: {
      name: appointment.childName || customer?.children?.[0] || "عميل نقدي",
      phone: customer?.phone || "",
    },
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
      tenantId,
      saleId: sale._id,
    })),
  );

  await Appointment.updateOne(
    { _id: appointment._id, tenantId },
    { $set: { saleId: sale._id } },
  );
  appointment.saleId = sale._id;

  const payments = await syncAppointmentSalePayment({
    tenantId,
    sale,
    appointment,
  });

  return { sale, saleItems, payments };
};

module.exports = {
  VAT_RATE,
  toMoney,
  calculateVatInclusiveTotals,
  getSaleStatus,
  createSaleFromAppointment,
};
