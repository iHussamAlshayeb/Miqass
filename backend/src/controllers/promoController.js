const PromoCode = require("../models/PromoCode");

// ==========================================
// 🛡️ [Super Admin] دوال الإدارة العليا
// ==========================================

// 1. إنشاء كوبون جديد
const createPromoCode = async (req, res) => {
  try {
    const { code, discountType, discountValue, maxUses, expiryDate } = req.body;
    const formattedCode = code.toUpperCase().trim();

    // التأكد من عدم وجود كوبون بنفس الاسم (استخدام lean لسرعة الفحص)
    const existingCode = await PromoCode.findOne({ code: formattedCode })
      .select("_id")
      .lean();
    if (existingCode) {
      return res.status(400).json({ message: "هذا الكود موجود مسبقاً!" });
    }

    const newPromo = await PromoCode.create({
      code: formattedCode,
      discountType,
      discountValue,
      maxUses,
      expiryDate,
    });

    res
      .status(201)
      .json({ message: "تم إنشاء الكوبون بنجاح 🎉", promo: newPromo });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء إنشاء الكوبون." });
  }
};

// 2. جلب جميع الكوبونات لعرضها في لوحة الإدارة
const getAllPromoCodes = async (req, res) => {
  try {
    // 🚀 استخدام lean و الترتيب التنازلي مع الفهارس التي أنشأناها
    const promos = await PromoCode.find().sort({ createdAt: -1 }).lean();
    res.status(200).json(promos);
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب الكوبونات." });
  }
};

// 3. تفعيل/تعطيل الكوبون
const togglePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    // جلب الحالة الحالية أولاً لتبديلها
    const promo = await PromoCode.findById(id).select("isActive");
    if (!promo) return res.status(404).json({ message: "الكوبون غير موجود" });

    // 🚀 تحديث ذري للحالة
    const updatedPromo = await PromoCode.findByIdAndUpdate(
      id,
      { $set: { isActive: !promo.isActive } },
      { returnDocument: "after" },
    ).lean();

    res.status(200).json({
      message: `تم ${updatedPromo.isActive ? "تفعيل" : "تعطيل"} الكوبون بنجاح.`,
      promo: updatedPromo,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء تحديث الكوبون." });
  }
};

// ==========================================
// 💇‍♂️ [Tenant] دالة الصالون (للتحقق من الكوبون عند الترقية)
// ==========================================

const validatePromoCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code)
      return res.status(400).json({ message: "الرجاء إدخال كود الخصم." });

    const formattedCode = code.toUpperCase().trim();

    // 🚀 استعلام صاروخي: نفحص كل الشروط داخل قاعدة البيانات بضربة واحدة
    // هذا يمنع تحميل بيانات الكوبونات غير الصالحة في الـ RAM
    const promo = await PromoCode.findOne({
      code: formattedCode,
      isActive: true,
      expiryDate: { $gt: new Date() }, // التأكد من تاريخ الصلاحية برمجياً في الداتا بيس
    }).lean();

    // 1. هل الكوبون موجود وصالح تاريخياً؟
    if (!promo) {
      return res
        .status(404)
        .json({ message: "كود الخصم غير صحيح أو منتهي الصلاحية." });
    }

    // 2. هل تجاوز الحد الأقصى للاستخدام؟
    if (promo.usedCount >= promo.maxUses) {
      return res
        .status(400)
        .json({ message: "عذراً، تم استنفاد الحد الأقصى لهذا الكوبون." });
    }

    // إذا مر بكل هذه الفحوصات بنجاح! 🎉
    res.status(200).json({
      message: "تم تطبيق الخصم بنجاح! ✨",
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      codeId: promo._id,
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحقق من الكوبون." });
  }
};

module.exports = {
  createPromoCode,
  getAllPromoCodes,
  togglePromoCode,
  validatePromoCode,
};
