// العملاء: الولاء والقائمة والتصدير والاستيراد
const Appointment = require("../../models/Appointment");
const Tenant = require("../../models/Tenant");
const Customer = require("../../models/Customer");
const mongoose = require("mongoose");
const { normalizeSaudiMobile } = require("../../utils/saudiMobile");

// 6. جلب بيانات ولاء عميل محدد
const getCustomerLoyalty = async (req, res) => {
  try {
    const { tenantId, phone } = req.params;
    if (!mongoose.isValidObjectId(tenantId) || !/^05\d{8}$/.test(phone || "")) {
      return res.status(400).json({ message: "بيانات غير صالحة" });
    }

    // مسار عام: يرجع عدد الزيارات فقط. أسماء الأطفال لا تُرجع إلا بعد
    // التحقق برمز الجوال عبر /customer/profile
    const customer = await Customer.findOne({ tenantId, phone })
      .select("totalVisits")
      .lean();

    res.status(200).json({ visits: customer ? customer.totalVisits : 0 });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات الولاء" });
  }
};

// 7. جلب قائمة العملاء (مفلترة ومجهزة بنظام الولاء)
const getTenantCustomers = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .select("settings.loyaltyVisitsRequired")
      .lean();
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const requiredVisits = tenant.settings?.loyaltyVisitsRequired || 5;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 100, 1),
      200,
    );
    const skip = (page - 1) * limit;
    const bookingHistory = ["all", "booked", "never"].includes(
      req.query.bookingHistory,
    )
      ? req.query.bookingHistory
      : "all";
    const search = String(req.query.search || "").trim().slice(0, 100);

    const customerBaseFilter = {
      tenantId: req.tenantId,
      phone: { $ne: "0000000000" },
    };
    const bookedCustomerIds = await Appointment.distinct("customerId", {
      tenantId: req.tenantId,
      status: { $ne: "Blocked" },
    });
    const bookedCustomerIdSet = new Set(bookedCustomerIds.map(String));

    const customerFilter = { ...customerBaseFilter };
    if (bookingHistory === "booked") {
      customerFilter._id = { $in: bookedCustomerIds };
    } else if (bookingHistory === "never") {
      customerFilter._id = { $nin: bookedCustomerIds };
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearch, "i");
      customerFilter.$or = [
        { phone: searchRegex },
        { parentName: searchRegex },
        { children: searchRegex },
      ];
    }

    const [customers, filteredTotal, allCount, bookedCount] = await Promise.all([
      Customer.find(customerFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(customerFilter),
      Customer.countDocuments(customerBaseFilter),
      Customer.countDocuments({
        ...customerBaseFilter,
        _id: { $in: bookedCustomerIds },
      }),
    ]);

    const customersWithLoyaltyStatus = customers.map((c) => {
      const currentCycle = c.totalVisits % requiredVisits;
      const isEligibleForFree = currentCycle === 0 && c.totalVisits > 0;
      return {
        phone: c.phone,
        name: c.children.length > 0 ? c.children[0] : c.parentName,
        children: c.children,
        totalVisits: c.totalVisits,
        lastVisitDate: c.lastVisitDate,
        hasBooked: bookedCustomerIdSet.has(String(c._id)),
        isEligibleForFree,
        remainingForFree: isEligibleForFree ? 0 : requiredVisits - currentCycle,
      };
    });

    res.status(200).json({
      customers: customersWithLoyaltyStatus,
      requiredVisits,
      counts: {
        all: allCount,
        booked: bookedCount,
        never: Math.max(allCount - bookedCount, 0),
      },
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.max(Math.ceil(filteredTotal / limit), 1),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب قائمة العملاء" });
  }
};

const exportTenantCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({
      tenantId: req.tenantId,
      phone: { $ne: "0000000000" },
    })
      .select(
        "phone parentName children totalVisits lastVisitDate customerType createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    const exportCustomers = customers.map((customer) => ({
      phone: customer.phone,
      name:
        customer.children?.[0] || customer.parentName || "عميل غير مسمى",
      children: customer.children || [],
      totalVisits: customer.totalVisits || 0,
      lastVisitDate: customer.lastVisitDate || null,
      customerType: customer.customerType || "New",
      createdAt: customer.createdAt || null,
    }));

    res.status(200).json({
      customers: exportCustomers,
      total: exportCustomers.length,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تجهيز ملف العملاء" });
  }
};

const importCustomers = async (req, res) => {
  try {
    const rows = req.body?.customers;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "ملف العملاء فارغ أو غير صالح." });
    }

    if (rows.length > 5000) {
      return res.status(400).json({
        message: "الحد الأقصى للاستيراد هو 5000 عميل في الملف الواحد.",
      });
    }

    const validRows = [];
    for (const row of rows) {
      const name = String(
        row?.["الاسم"] ?? row?.["اسم العميل"] ?? row?.name ?? "",
      ).trim();
      const phone = normalizeSaudiMobile(
        row?.["رقم الجوال"] ??
          row?.["رقم الهاتف"] ??
          row?.phone ??
          row?.mobile,
      );

      if (!name || !phone) continue;
      validRows.push({ name: name.slice(0, 100), phone });
    }

    if (validRows.length === 0) {
      return res.status(400).json({
        message:
          "لم نجد صفوفاً صالحة. استخدم عمودي الاسم ورقم الجوال، وتأكد أن الرقم يبدأ بـ 05.",
      });
    }

    const uniqueCustomers = new Map();
    validRows.forEach((customer) => {
      if (!uniqueCustomers.has(customer.phone)) {
        uniqueCustomers.set(customer.phone, customer);
      }
    });

    const operations = Array.from(uniqueCustomers.values()).map((customer) => ({
      updateOne: {
        filter: { tenantId: req.tenantId, phone: customer.phone },
        update: {
          $setOnInsert: {
            tenantId: req.tenantId,
            phone: customer.phone,
            parentName: customer.name,
            children: [customer.name],
          },
        },
        upsert: true,
      },
    }));

    const result = await Customer.bulkWrite(operations, { ordered: false });
    const imported = result.upsertedCount || 0;
    const invalid = rows.length - validRows.length;
    const ignored = validRows.length - imported;

    res.status(200).json({
      message: `تم استيراد ${imported} عميل بنجاح.`,
      imported,
      ignored,
      invalid,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء استيراد العملاء." });
  }
};

module.exports = {
  getCustomerLoyalty,
  getTenantCustomers,
  exportTenantCustomers,
  importCustomers,
};
