const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");

const crypto = require("crypto");
const zatcaXML = require("../utils/zatcaXML");
const { decrypt } = require("../utils/encryption");
const zatcaCore = require("../utils/zatcaCore");
const { generateZatcaQR } = require("../utils/zatca");

const { sendWhatsAppMessage } = require("../utils/whatsapp");
const { sendAdminNotification } = require("../utils/onesignal");
const {
  MOYASAR_PROVIDER,
  getTenantMoyasarSecret,
  getVerifiedMoyasarPayment,
} = require("../services/paymentGatewayService");

// بيانات ZATCA الحساسة مخزنة مشفرة؛ نفكها فقط عند التوقيع والتبليغ
const getZatcaCredentials = (tenant) => {
  const credentials = tenant?.taxSettings?.zatcaCredentials || {};
  return {
    binarySecurityToken: credentials.binarySecurityToken,
    secret: decrypt(credentials.secret),
    privateKey: decrypt(credentials.privateKey),
  };
};

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getNormalizedPaymentMethod = (method) => {
  const normalizedMethod = String(method || "").toLowerCase();
  if (["cash", "card", "transfer", "online"].includes(normalizedMethod)) {
    return normalizedMethod;
  }
  return "online";
};

const allocatePaymentAcrossAppointments = (paidAmount, appointments = []) => {
  let remainingAmount = toMoney(paidAmount);

  return appointments.map((appointment) => {
    const appointmentTotal = toMoney(appointment.totalPrice);
    const allocation = toMoney(
      Math.min(Math.max(appointmentTotal, 0), Math.max(remainingAmount, 0)),
    );

    remainingAmount = toMoney(remainingAmount - allocation);
    return allocation;
  });
};

const confirmPaidAppointmentGroup = async ({
  appointment,
  tenant,
  provider,
  providerPaymentId,
  amount,
  method = "online",
}) => {
  const createdAt = appointment.createdAt
    ? new Date(appointment.createdAt)
    : new Date();
  const groupWindowStart = new Date(createdAt.getTime() - 2 * 60 * 1000);
  const groupWindowEnd = new Date(createdAt.getTime() + 2 * 60 * 1000);

  const pendingAppointments = await Appointment.find({
    tenantId: tenant._id,
    customerId: appointment.customerId._id,
    date: appointment.date,
    status: "Pending_Payment",
    createdAt: { $gte: groupWindowStart, $lte: groupWindowEnd },
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const appointmentsToConfirm =
    pendingAppointments.length > 0
      ? pendingAppointments
      : [appointment.toObject ? appointment.toObject() : appointment];
  const paymentAllocations = allocatePaymentAcrossAppointments(
    amount,
    appointmentsToConfirm,
  );
  const paymentMethod = getNormalizedPaymentMethod(method);

  await Appointment.bulkWrite(
    appointmentsToConfirm.map((currentAppointment, index) => ({
      updateOne: {
        filter: { _id: currentAppointment._id, tenantId: tenant._id },
        update: {
          $set: {
            status: "Booked",
            "payment.status": "Paid",
            "payment.amount": paymentAllocations[index],
            "payment.provider": provider,
            "payment.providerPaymentId": providerPaymentId,
            "payment.moyasarPaymentId":
              provider === "moyasar" ? providerPaymentId : null,
            "payment.method": paymentMethod,
          },
        },
      },
    })),
  );

  const bookedAppointments = await Appointment.find({
    _id: { $in: appointmentsToConfirm.map((currentAppointment) => currentAppointment._id) },
    tenantId: tenant._id,
  }).lean();

  const childrenNames = bookedAppointments.map((app) => app.childName);
  const combinedNames = childrenNames.join(" و ");

  sendWhatsAppMessage(
    appointment.customerId.phone,
    combinedNames,
    appointment.date,
    appointment.timeSlot,
    appointment.barberName,
    tenant,
  ).catch((e) => console.error("WhatsApp Error:", e));

  await sendAdminNotification(
    combinedNames,
    appointment.date,
    appointment.timeSlot,
    appointment.barberName,
    String(tenant._id),
    { dedupeKey: `payment:${provider}:${providerPaymentId}` },
  );

  return bookedAppointments;
};

const getInvoiceData = async (req, res) => {
  try {
    const { id: appointmentId } = req.params;
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      tenantId: req.tenantId,
    })
      .populate("customerId")
      .lean();

    if (!appointment)
      return res.status(404).json({ message: "الموعد غير موجود" });

    const tenant = await Tenant.findById(appointment.tenantId).lean();
    const total = appointment.totalPrice || 0;
    const vatRate = 0.15;
    const baseAmount = total / (1 + vatRate);
    const vatAmount = total - baseAmount;

    const formatTime = (timeStr) => {
      if (!timeStr) return "";
      let [h, m] = timeStr.split(":");
      h = parseInt(h, 10);
      const ampm = h >= 12 ? "م" : "ص";
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    };

    let qrCodeBase64 = null;
    let isZatcaPhase2 = false;

    const timestamp = new Date().toISOString();
    const issueDate = timestamp.split("T")[0];
    const issueTime = timestamp.split("T")[1].substring(0, 8);

    if (
      tenant.taxSettings?.isZatcaOnboarded &&
      tenant.taxSettings?.zatcaCredentials
    ) {
      try {
        const zatcaCredentials = getZatcaCredentials(tenant);
        const invoiceDetails = {
          invoiceNumber: appointment.invoiceNumber || "INV-0000",
          invoiceCounter: parseInt(
            (appointment.invoiceNumber || "1").replace(/\D/g, ""),
          ),
          uuid: crypto.randomUUID(),
          issueDate: issueDate,
          issueTime: issueTime,
          customerName: appointment.childName || "عميل نقدي",
          totalNetPrice: baseAmount.toFixed(2),
          totalVatAmount: vatAmount.toFixed(2),
          totalAmount: total.toFixed(2),
        };

        const salonDetails = {
          salonName: tenant.salonName,
          taxNumber: tenant.taxSettings.taxNumber,
          crNumber: tenant.settings?.crNumber || "1234567890",
          address: tenant.address || "Saudi Arabia",
          city: tenant.city || "Riyadh",
          district: tenant.district || "Center",
          buildingNumber: tenant.buildingNumber || "0000",
          postalCode: tenant.postalCode || "00000",
        };

        const servicesArray =
          appointment.selectedServices?.length > 0
            ? appointment.selectedServices.map((s) => ({
                name: s.name,
                price: s.price,
                quantity: 1,
              }))
            : [{ name: "خدمة حلاقة", price: total, quantity: 1 }];

        const rawXml = zatcaXML.buildSimplifiedInvoiceXML(
          invoiceDetails,
          salonDetails,
          servicesArray,
        );

        const qrData = {
          sellerName: tenant.salonName,
          vatNumber: tenant.taxSettings.taxNumber,
          timeStamp: timestamp,
          totalAmount: total.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
        };

        const {
          invoiceHash,
          xmlBase64,
          qrCodeBase64: phase2Qr,
        } = zatcaXML.signZatcaInvoice(
          rawXml,
          qrData,
          zatcaCredentials.privateKey,
          zatcaCredentials.binarySecurityToken,
        );

        qrCodeBase64 = phase2Qr;
        isZatcaPhase2 = true;

        zatcaCore
          .reportSingleInvoice(
            invoiceHash,
            xmlBase64,
            invoiceDetails.uuid,
            zatcaCredentials,
          )
          .then(() =>
            console.log(
              `✅ [ZATCA] تم تبليغ الفاتورة ${invoiceDetails.invoiceNumber} بنجاح!`,
            ),
          )
          .catch((err) =>
            console.error(
              `❌ [ZATCA] فشل التبليغ للفاتورة ${invoiceDetails.invoiceNumber}:`,
              err.validationResults || err.message,
            ),
          );
      } catch (error) {
        console.error("❌ خطأ داخلي في توليد فاتورة المرحلة الثانية:", error);
      }
    }

    if (
      !isZatcaPhase2 &&
      tenant.taxSettings?.taxNumber &&
      typeof generateZatcaQR !== "undefined"
    ) {
      qrCodeBase64 = generateZatcaQR(
        tenant.salonName,
        tenant.taxSettings.taxNumber,
        timestamp,
        total.toFixed(2),
        vatAmount.toFixed(2),
      );
    }

    res.status(200).json({
      invoice: {
        invoiceNumber: appointment.invoiceNumber || "INV-0000",
        salonName: tenant.salonName,
        logoUrl: tenant.branding?.logoUrl || "",
        phone: tenant.ownerPhone || "",
        taxNumber: tenant.taxSettings?.taxNumber,
        date: new Date().toLocaleDateString("en-GB"),
        isoDate: timestamp,
        time: formatTime(appointment.timeSlot),
        customerName: appointment.childName,
        customerPhone: appointment.customerId?.phone || "",
        services:
          appointment.selectedServices?.length > 0
            ? appointment.selectedServices
            : [{ name: "حجز مقعد", price: total }],
        totalAmount: total.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        baseAmount: baseAmount.toFixed(2),
        qrCode: qrCodeBase64,
        isZatcaPhase2: isZatcaPhase2,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إصدار الفاتورة" });
  }
};

const moyasarWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : payload;
    const tenantId = String(req.query.tenantId || data.metadata?.tenantId || "");

    if (!mongoose.isValidObjectId(tenantId)) {
      return res.status(400).send("Missing tenant reference");
    }

    const tenant = await Tenant.findById(tenantId).select(
      "salonName slug ownerPhone branding taxSettings whatsappSettings settings paymentSettings",
    );
    if (!tenant || !tenant.paymentSettings?.moyasarSecretKey) {
      return res.status(400).send("Tenant or secret key not found");
    }

    const secretKey = getTenantMoyasarSecret(tenant);
    // 🔐 التحقق يتم من API ميسر مباشرة، وليس من جسم الطلب
    const verifiedPayment = await getVerifiedMoyasarPayment({
      payload,
      secretKey,
    });

    if (verifiedPayment.status !== "paid") {
      return res.status(200).send("Payment not paid yet");
    }

    const appointmentId = String(verifiedPayment.metadata?.appointmentId || "");
    if (
      String(verifiedPayment.metadata?.tenantId || "") !== String(tenant._id) ||
      !mongoose.isValidObjectId(appointmentId)
    ) {
      return res.status(400).send("Payment metadata mismatch");
    }

    const primaryAppointment = await Appointment.findOne({
      _id: appointmentId,
      tenantId: tenant._id,
    }).populate("customerId");
    if (!primaryAppointment) return res.status(404).send("Appointment not found");

    if (
      primaryAppointment.status === "Booked" &&
      primaryAppointment.payment?.status === "Paid"
    ) {
      return res.status(200).send("Already processed");
    }

    const paidAmount = toMoney(verifiedPayment.amount / 100);
    const expectedAmount = toMoney(primaryAppointment.payment?.amount || 0);
    if (expectedAmount > 0 && paidAmount < expectedAmount) {
      console.warn(
        `⚠️ مبلغ مدفوع أقل من العربون لصالون ${tenant.salonName}: ${paidAmount} < ${expectedAmount}`,
      );
      return res.status(400).send("Paid amount mismatch");
    }

    const bookedAppointments = await confirmPaidAppointmentGroup({
      appointment: primaryAppointment,
      tenant,
      provider: MOYASAR_PROVIDER,
      providerPaymentId: verifiedPayment.providerPaymentId,
      amount: paidAmount,
      method: verifiedPayment.method,
    });

    const combinedNames = bookedAppointments.map((app) => app.childName).join(" و ");
    console.log(
      `✅ [Moyasar] تم تأكيد حجز ${combinedNames} لصالون ${tenant.salonName} بعد استلام العربون!`,
    );
    return res.status(200).send("Webhook processed successfully");
  } catch (error) {
    console.error(
      "❌ Moyasar Webhook Error:",
      error.response?.data || error.message,
    );
    return res
      .status(error.statusCode || 500)
      .send(error.statusCode ? error.message : "Internal Server Error");
  }
};

module.exports = { getInvoiceData, moyasarWebhook };
