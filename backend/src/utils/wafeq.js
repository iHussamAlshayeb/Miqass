const axios = require("axios");

// 💡 مفتاح منصة مِقَص الرئيسي (الماستر) - يفضل وضعه في ملف .env لاحقاً
const WAFEQ_MASTER_API_KEY =
  process.env.WAFEQ_MASTER_API_KEY || "YOUR_WAFEQ_MASTER_API_KEY";

// =================================================================
// 1. دالة إنشاء حساب فرعي للصالون (Connected Account)
// =================================================================
const createConnectedAccount = async (tenant) => {
  try {
    const payload = {
      name: tenant.salonName,
      // 💡 جعلنا القيم ديناميكية، مع الحفاظ على قيمك كـ (Fallbacks) لحماية الطلب من الفشل
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

    return response.data; // سيرجع الـ ID الخاص بهذا الصالون
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

// =================================================================
// 2. دالة تسجيل الجهاز بهيئة الزكاة (Onboarding via OTP)
// =================================================================
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
          "X-Zatca-Environment": "simulation", // 💡 غيرها لـ production لاحقاً
          "X-ZATCA-Connected-Account-ID": wafeqAccountId, // 💡 توجيه الطلب لحساب الصالون
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

// =================================================================
// 3. دالة إرسال الفاتورة المبسطة إلى هيئة الزكاة
// =================================================================
const reportInvoiceToWafeq = async (appointment, tenant) => {
  try {
    const accountId = tenant.settings?.wafeqAccountId;

    if (!accountId) {
      throw new Error(
        "هذا الصالون غير مربوط بهيئة الزكاة (لا يوجد Account ID).",
      );
    }

    // تجهيز الخدمات (Line Items)
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

    // تجهيز هيكل الفاتورة حسب دوكيومنتيشن الحسابات المتصلة
    const payload = {
      language: "ar",
      document: {
        invoice_type: "SIMPLIFIED",
        invoice_number: `INV-${appointment._id.toString().slice(-6).toUpperCase()}`,
        issue_date: new Date().toISOString().split("T")[0],
        issue_time: new Date().toISOString().split("T")[1].substring(0, 8),
        currency: "SAR",

        // بيانات المورّد (الصالون) - مطلوبة في الحسابات المتصلة
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

        // بيانات العميل (مبسطة)
        customer: {
          name: appointment.childName || "عميل نقدي",
        },
        line_items: lineItems,
      },
    };

    // إرسال الطلب
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

// =================================================================
// 4. دالة جلب قائمة الصالونات المربوطة (مخصصة للوحة تحكم مدير المنصة)
// =================================================================
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

    // الرد سيحتوي على count (العدد الكلي)، و results (مصفوفة الحسابات)
    return response.data;
  } catch (error) {
    console.error(
      "Wafeq List Accounts Error:",
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب قائمة الحسابات المتصلة من وافق.");
  }
};

// =================================================================
// 5. دالة جلب بيانات حساب صالون محدد (للتدقيق والمزامنة)
// =================================================================
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

    // الرد سيحتوي على تفاصيل الحساب (الاسم، العنوان، الرقم الضريبي، حالة الحساب)
    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Get Account Error [ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب تفاصيل الحساب الضريبي للصالون من وافق.");
  }
};

// =================================================================
// 6. دالة حذف حساب صالون من هيئة الزكاة (للإلغاء أو إعادة الضبط)
// =================================================================
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

    // الرد 204 يعني نجاح الحذف بدون محتوى
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

// =================================================================
// 7. دالة تحديث بيانات حساب الصالون (Partial Update)
// =================================================================
const updateConnectedAccount = async (wafeqAccountId, updateData) => {
  try {
    // 💡 استخدام patch يسمح لنا بإرسال البيانات المعدلة فقط (مثلاً الاسم فقط)
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

    // الرد سيحتوي على تفاصيل الحساب بعد التعديل بنجاح
    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Update Account Error [ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل تحديث بيانات الحساب الضريبي للصالون في منصة وافق.");
  }
};

// =================================================================
// 8. دالة التحديث الشامل لحساب الصالون (Full Update - PUT)
// =================================================================
const fullUpdateConnectedAccount = async (wafeqAccountId, tenant) => {
  try {
    // 💡 في مسار الـ PUT، يجب إرسال جميع البيانات الإجبارية من جديد
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

    // الرد سيحتوي على تفاصيل الحساب بعد استبدالها بنجاح
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

// =================================================================
// 9. دالة جلب قائمة الأجهزة المرتبطة بهيئة الزكاة لصالون محدد
// =================================================================
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
          "X-Zatca-Environment": "simulation", // 💡 يتم تغييرها لـ production عند الإطلاق
          "X-ZATCA-Connected-Account-ID": wafeqAccountId, // 💡 توجيه الطلب لحساب الصالون
        },
      },
    );

    // الرد سيحتوي على count (عدد الأجهزة)، و results (مصفوفة تفاصيل الأجهزة وحالتها)
    return response.data;
  } catch (error) {
    console.error(
      `Wafeq List Devices Error [Account ID: ${wafeqAccountId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب قائمة الأجهزة المرتبطة من منصة وافق.");
  }
};

// =================================================================
// 10. دالة جلب بيانات جهاز ضريبي محدد (للتدقيق ومعرفة حالة الشهادة الأمنية)
// =================================================================
const getZatcaDevice = async (wafeqAccountId, deviceId) => {
  try {
    const response = await axios.get(
      `https://api.wafeq.com/v1/zatca/devices/${deviceId}/`,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation", // 💡 تغييرها لـ production عند الإطلاق
          "X-ZATCA-Connected-Account-ID": wafeqAccountId, // 💡 توجيه الطلب لحساب الصالون
        },
      },
    );

    // الرد سيحتوي على تفاصيل الجهاز (الاسم، الحالة، وتواريخ الإصدار والانتهاء)
    return response.data;
  } catch (error) {
    console.error(
      `Wafeq Get Device Error [Device ID: ${deviceId}]:`,
      error.response?.data || error.message,
    );
    throw new Error("فشل جلب تفاصيل الجهاز الضريبي من منصة وافق.");
  }
};

// =================================================================
// 11. دالة تجديد الشهادة الأمنية للجهاز الضريبي (CSID Renewal)
// =================================================================
const renewZatcaDevice = async (wafeqAccountId, deviceId, otp) => {
  try {
    const payload = {
      otp: String(otp), // تحويل الرمز إلى نص احتياطياً
    };

    const response = await axios.post(
      `https://api.wafeq.com/v1/zatca/devices/${deviceId}/renew/`,
      payload,
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation", // 💡 تُغير إلى production لاحقاً
          "X-ZATCA-Connected-Account-ID": wafeqAccountId, // 💡 توجيه الطلب لحساب الصالون
        },
      },
    );

    // الرد سيحتوي على تفاصيل الجهاز بعد تجديد شهادته بنجاح
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

// =================================================================
// 12. دالة إبطال الشهادة الأمنية لجهاز ضريبي (Revoke Device) 🚫
// =================================================================
const revokeZatcaDevice = async (wafeqAccountId, deviceId) => {
  try {
    // 💡 نرسل كائناً فارغاً كـ Payload لأن المسار لا يتطلب Body Params
    const response = await axios.post(
      `https://api.wafeq.com/v1/zatca/devices/${deviceId}/revoke/`,
      {},
      {
        headers: {
          Authorization: `Api-Key ${WAFEQ_MASTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json; version=v1",
          "X-Zatca-Environment": "simulation", // 💡 تُغير إلى production لاحقاً
          "X-ZATCA-Connected-Account-ID": wafeqAccountId, // 💡 توجيه الطلب لحساب الصالون
        },
      },
    );

    // الرد سيؤكد نجاح عملية الإبطال
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
