const axios = require("axios");

const WAFEQ_MASTER_API_KEY =
  process.env.WAFEQ_MASTER_API_KEY || "YOUR_WAFEQ_MASTER_API_KEY";

const createConnectedAccount = async (tenant) => {
  try {
    const payload = {
      name: tenant.salonName,
      address: tenant.address || "المملكة العربية السعودية",
      city: tenant.city || "Riyadh",
      country: "SA",
      business_category:
        tenant.businessCategory || "Barbershop and Beauty Salon",
      tax_registration_number: tenant.settings?.taxNumber,
    };

    const response = await axios.post(
      "https://api.wafeq.com/v1/zatca/connected-accounts/",
      payload,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Wafeq Create Account Error:",
      error.response?.data || error.message,
    );
    throw new Error(
      error.response?.data?.message || "فشل فتح حساب فرعي للصالون في وافق",
    );
  }
};

const registerZatcaDevice = async (
  wafeqAccountId,
  otp,
  deviceName = "Miqass_POS_1",
) => {
  try {
    const payload = {
      common_name: deviceName,
      otp: String(otp),
    };

    const response = await axios.post(
      "https://api.wafeq.com/v1/zatca/devices/register/",
      payload,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Zatca-Environment": "simulation",
          "X-ZATCA-Connected-Account-ID": wafeqAccountId,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Wafeq Register Device Error:",
      error.response?.data || error.message,
    );
    throw new Error(
      error.response?.data?.message || "فشل ربط الجهاز، تأكد من صحة كود OTP.",
    );
  }
};

const reportInvoiceToWafeq = async (appointment, tenant) => {
  try {
    const accountId = tenant.settings?.wafeqAccountId;

    if (!accountId) {
      throw new Error(
        "هذا الصالون غير مربوط بهيئة الزكاة (لا يوجد Account ID).",
      );
    }

    const lineItems =
      appointment.selectedServices && appointment.selectedServices.length > 0
        ? appointment.selectedServices.map((srv) => {
            const priceIncludeVat = Number(srv.price);
            const netPrice = priceIncludeVat / 1.15;
            const vatAmount = priceIncludeVat - netPrice;

            return {
              name: srv.name,
              quantity: 1,
              unit_price: Number(netPrice.toFixed(2)),
              tax_percent: 15,
              tax_amount: Number(vatAmount.toFixed(2)),
              total_amount: Number(priceIncludeVat.toFixed(2)),
            };
          })
        : [
            {
              name: "حجز مقعد حلاقة",
              quantity: 1,
              unit_price: Number((appointment.totalPrice / 1.15).toFixed(2)),
              tax_percent: 15,
              tax_amount: Number(
                (
                  appointment.totalPrice -
                  appointment.totalPrice / 1.15
                ).toFixed(2),
              ),
              total_amount: Number(appointment.totalPrice),
            },
          ];

    const payload = {
      language: "ar",
      document: {
        invoice_type: "SIMPLIFIED",
        invoice_number: `INV-${appointment._id.toString().slice(-6).toUpperCase()}`,
        issue_date: new Date().toISOString().split("T")[0],
        issue_time: new Date().toISOString().split("T")[1].substring(0, 8),
        currency: "SAR",

        supplier: {
          name: tenant.salonName,
          tax_registration_number: tenant.settings?.taxNumber,
          address: {
            country: "SA",
            building: "0000",
            city: tenant.city || "Riyadh", // 💡 التعديل هنا أيضاً للربط الديناميكي
            district: "General",
            postal_code: "12345",
            street: tenant.address || "General Street",
          },
        },

        customer: {
          name: appointment.childName || "عميل نقدي",
        },
        line_items: lineItems,
      },
    };

    const response = await axios.post(
      "https://api.wafeq.com/v1/zatca/simplified-invoices/report/",
      payload,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "X-ZATCA-Connected-Account-ID": accountId,
          Accept: "application/json; version=v1",
          "Content-Type": "application/json",
          "X-Zatca-Environment": "simulation",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Wafeq ZATCA API Error:",
      error.response?.data || error.message,
    );
    throw new Error(
      error.response?.data?.message ||
        "فشل إرسال الفاتورة لهيئة الزكاة عبر وافق",
    );
  }
};

const listConnectedAccounts = async (page = 1, pageSize = 50) => {
  try {
    const response = await axios.get(
      `https://api.wafeq.com/v1/zatca/connected-accounts/`,
      {
        params: {
          page: page,
          page_size: pageSize,
        },
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          Accept: "application/json; version=v1",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Wafeq List Accounts Error:",
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب قائمة الحسابات المتصلة من وافق.");
  }
};

const getConnectedAccount = async (wafeqAccountId) => {
  try {
    const response = await axios.get(
      `https://api.wafeq.com/v1/zatca/connected-accounts/${wafeqAccountId}/`,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          Accept: "application/json; version=v1",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Get Account Error [ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب تفاصيل الحساب الضريبي للصالون من وافق.");
  }
};

const deleteConnectedAccount = async (wafeqAccountId) => {
  try {
    const response = await axios.delete(
      `https://api.wafeq.com/v1/zatca/connected-accounts/${wafeqAccountId}/`,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          Accept: "application/json; version=v1",
        },
      },
    );

    if (response.status === 204) {
      return true;
    }
  } catch (error) {
    console.error(
      `Wafeq Delete Account Error [ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل حذف الحساب الضريبي للصالون من وافق.");
  }
};

const updateConnectedAccount = async (wafeqAccountId, updateData) => {
  try {
    const response = await axios.patch(
      `https://api.wafeq.com/v1/zatca/connected-accounts/${wafeqAccountId}/`,
      updateData,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json; version=v1",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Update Account Error [ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل تحديث بيانات الحساب الضريبي للصالون في منصة وافق.");
  }
};

const fullUpdateConnectedAccount = async (wafeqAccountId, tenant) => {
  try {
    const payload = {
      name: tenant.salonName,
      address: tenant.address || "المملكة العربية السعودية",
      city: tenant.city || "Riyadh",
      country: "SA",
      business_category:
        tenant.businessCategory || "Barbershop and Beauty Salon",
      tax_registration_number: tenant.settings?.taxNumber,
    };

    const response = await axios.put(
      `https://api.wafeq.com/v1/zatca/connected-accounts/${wafeqAccountId}/`,
      payload,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json; version=v1",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Full Update Error [ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error(
      "فشل التحديث الشامل لبيانات الحساب الضريبي للصالون في وافق.",
    );
  }
};

const listZatcaDevices = async (wafeqAccountId, page = 1, pageSize = 50) => {
  try {
    const response = await axios.get(
      `https://api.wafeq.com/v1/zatca/devices/`,
      {
        params: {
          page: page,
          page_size: pageSize,
        },
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation",
          "X-ZATCA-Connected-Account-ID": wafeqAccountId,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq List Devices Error [Account ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب قائمة الأجهزة المرتبطة من منصة وافق.");
  }
};

const getZatcaDevice = async (wafeqAccountId, deviceId) => {
  try {
    const response = await axios.get(
      `https://api.wafeq.com/v1/zatca/devices/${deviceId}/`,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation",
          "X-ZATCA-Connected-Account-ID": wafeqAccountId,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Get Device Error [Device ID: ${deviceId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب تفاصيل الجهاز الضريبي من منصة وافق.");
  }
};

const renewZatcaDevice = async (wafeqAccountId, deviceId, otp) => {
  try {
    const payload = {
      otp: String(otp),
    };

    const response = await axios.post(
      `https://api.wafeq.com/v1/zatca/devices/${deviceId}/renew/`,
      payload,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation",
          "X-ZATCA-Connected-Account-ID": wafeqAccountId,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Renew Device Error [Device ID: ${deviceId}]:`,
      error.response?.data || error.message,
    );
    throw new Error(
      "فشل تجديد الشهادة الأمنية للجهاز عبر وافق. تأكد من صحة رمز OTP.",
    );
  }
};

const revokeZatcaDevice = async (wafeqAccountId, deviceId) => {
  try {
    const response = await axios.post(
      `https://api.wafeq.com/v1/zatca/devices/${deviceId}/revoke/`,
      {},
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation",
          "X-ZATCA-Connected-Account-ID": wafeqAccountId,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Revoke Device Error [Device ID: ${deviceId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل إبطال الجهاز من هيئة الزكاة. يرجى المحاولة لاحقاً.");
  }
};

module.exports = {
  createConnectedAccount,
  registerZatcaDevice,
  reportInvoiceToWafeq,
  listConnectedAccounts,
  getConnectedAccount,
  deleteConnectedAccount,
  updateConnectedAccount,
  fullUpdateConnectedAccount,
  listZatcaDevices,
  getZatcaDevice,
  renewZatcaDevice,
  revokeZatcaDevice,
};
