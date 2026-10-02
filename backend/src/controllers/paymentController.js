const axios = require("axios"); // للاتصال بسيرفرات ميسر
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");

const crypto = require("crypto");
const { decrypt } = require("../utils/encryption");
const zatcaXML = require("../utils/zatcaXML");
const zatcaCore = require("../utils/zatcaCore");
const { generateZatcaQR } = require("../utils/zatca");

const { sendWhatsAppMessage } = require("../utils/whatsapp");
const { sendAdminNotification } = require("../utils/onesignal");
const {
  getStcWebhookContext,
  isPaidWebhookStatus,
} = require("../services/paymentGatewayService");

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
          tenant.taxSettings.zatcaCredentials.privateKey,
          tenant.taxSettings.zatcaCredentials.binarySecurityToken,
        );

        qrCodeBase64 = phase2Qr;
        isZatcaPhase2 = true;

        zatcaCore
          .reportSingleInvoice(
            invoiceHash,
            xmlBase64,
            invoiceDetails.uuid,
            tenant.taxSettings.zatcaCredentials,
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
    const paymentData = req.body;

    if (paymentData.status !== "paid") {
      return res.status(200).send("Payment not paid yet");
    }

    const appointmentId = paymentData.metadata?.appointmentId;
    const tenantId = paymentData.metadata?.tenantId;

    if (!appointmentId || !tenantId) {
      return res
        .status(400)
        .send("Missing metadata (appointmentId or tenantId)");
    }

    const tenant = await Tenant.findById(tenantId).select(
      "salonName slug ownerPhone branding taxSettings whatsappSettings settings paymentSettings",
    );

    if (!tenant || !tenant.paymentSettings?.moyasarSecretKey) {
      return res.status(400).send("Tenant or secret key not found");
    }

    // 🔓 فك التشفير السري بأمان
    const secretKey = decrypt(tenant.paymentSettings.moyasarSecretKey);
    if (!secretKey) {
      return res.status(500).send("Failed to decrypt secret key");
    }

    const verifyResponse = await axios.get(
      `https://api.moyasar.com/v1/payments/${paymentData.id}`,
      {
        auth: {
          username: secretKey,
          password: "",
        },
      },
    );

    const verifiedPayment = verifyResponse.data;
    const verifiedAppointmentId = verifiedPayment.metadata?.appointmentId;
    const verifiedTenantId = verifiedPayment.metadata?.tenantId;

    if (
      String(verifiedAppointmentId || "") !== String(appointmentId) ||
      String(verifiedTenantId || "") !== String(tenantId)
    ) {
      return res.status(400).send("Payment metadata mismatch");
    }

    if (verifiedPayment.status === "paid") {
      const primaryAppointment =
        await Appointment.findOne({
          _id: appointmentId,
          tenantId: tenant._id,
        }).populate("customerId");
      if (!primaryAppointment)
        return res.status(404).send("Appointment not found");

      if (
        primaryAppointment.status === "Booked" &&
        primaryAppointment.payment?.status === "Paid"
      ) {
        return res.status(200).send("Already processed");
      }

      const bookedAppointments = await confirmPaidAppointmentGroup({
        appointment: primaryAppointment,
        tenant,
        provider: "moyasar",
        providerPaymentId: verifiedPayment.id,
        amount: verifiedPayment.amount / 100,
        method: verifiedPayment.source?.type || "online",
      });

      const combinedNames = bookedAppointments.map((app) => app.childName).join(" و ");

      console.log(
        `✅ [Webhook] تم تأكيد حجز ${combinedNames} لصالون ${tenant.salonName} بعد استلام العربون!`,
      );
      return res.status(200).send("Webhook processed successfully");
    } else {
      console.warn(
        `⚠️ محاولة تلاعب أو دفع غير مكتمل لصالون ${tenant.salonName}`,
      );
      return res.status(400).send("Payment verification failed");
    }
  } catch (error) {
    console.error("❌ Moyasar Webhook Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
};

const stcBankWebhook = async (req, res) => {
  try {
    const {
      appointment,
      tenant,
      providerPaymentId,
      amount,
      status,
    } = await getStcWebhookContext(req);

    if (!isPaidWebhookStatus(status)) {
      return res.status(200).send("Payment not paid yet");
    }

    if (
      appointment.status === "Booked" &&
      appointment.payment?.status === "Paid"
    ) {
      return res.status(200).send("Already processed");
    }

    const paidAmount = amount || appointment.payment?.amount || 0;
    if (paidAmount <= 0) {
      return res.status(400).send("Missing paid amount");
    }

    const bookedAppointments = await confirmPaidAppointmentGroup({
      appointment,
      tenant,
      provider: "stc_bank",
      providerPaymentId,
      amount: paidAmount,
      method: "card",
    });

    const combinedNames = bookedAppointments.map((app) => app.childName).join(" و ");
    console.log(
      `✅ [STC Bank] تم تأكيد حجز ${combinedNames} بعد استلام العربون.`,
    );

    return res.status(200).send("Webhook processed successfully");
  } catch (error) {
    console.error("STC Bank Webhook Error:", error.message);
    return res
      .status(error.statusCode || 500)
      .send(error.message || "Internal Server Error");
  }
};

module.exports = { getInvoiceData, moyasarWebhook, stcBankWebhook };
