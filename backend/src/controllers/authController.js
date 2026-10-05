const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const PromoCode = require("../models/PromoCode");
const SystemSettings = require("../models/SystemSettings");

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const mongoose = require("mongoose");
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require("../utils/emailService");

const VALID_PLANS = ["Pro", "Premium"];
const VALID_BILLING_CYCLES = ["monthly", "annual"];

const normalizeSubscriptionRequest = (plan, billingCycle) => {
  const normalizedPlan = VALID_PLANS.includes(plan) ? plan : null;
  const normalizedBillingCycle = VALID_BILLING_CYCLES.includes(billingCycle)
    ? billingCycle
    : "monthly";

  if (!normalizedPlan) return null;
  return { plan: normalizedPlan, billingCycle: normalizedBillingCycle };
};

const findValidPromo = async (promoCodeId) => {
  if (!promoCodeId) return null;
  if (!mongoose.Types.ObjectId.isValid(promoCodeId)) return null;

  return PromoCode.findOne({
    _id: promoCodeId,
    isActive: true,
    expiryDate: { $gt: new Date() },
    $expr: { $lt: ["$usedCount", "$maxUses"] },
  }).lean();
};

const calculateSubscriptionPrice = async (plan, billingCycle, promo = null) => {
  const settings = await SystemSettings.findOne({ isGlobal: true }).lean();
  const pricing = settings?.pricing || { pro: 99, premium: 199 };
  const planKey = plan.toLowerCase();

  let price = Number(pricing[planKey] || (plan === "Premium" ? 199 : 99));
  if (billingCycle === "annual") price *= 10;

  if (settings?.discount?.isActive) {
    const discountPercentage = Number(settings.discount.percentage || 0);
    price *= 1 - discountPercentage / 100;
  }

  if (promo) {
    if (promo.discountType === "percentage") {
      price *= 1 - Number(promo.discountValue || 0) / 100;
    } else if (promo.discountType === "fixed") {
      price -= Number(promo.discountValue || 0);
    }
  }

  return Math.max(0, Math.round(price));
};

const consumePromo = async (promoCodeId) => {
  if (!promoCodeId) return true;

  const result = await PromoCode.updateOne(
    {
      _id: promoCodeId,
      isActive: true,
      expiryDate: { $gt: new Date() },
      $expr: { $lt: ["$usedCount", "$maxUses"] },
    },
    { $inc: { usedCount: 1 } },
  );

  return result.modifiedCount === 1;
};

// 1. تسجيل صالون جديد
const registerTenant = async (req, res) => {
  try {
    const { salonName, slug, ownerName, ownerPhone, email, password } =
      req.body;

    const existingTenant = await Tenant.findOne({
      $or: [{ email }, { slug }],
    }).lean();
    if (existingTenant) {
      return res
        .status(400)
        .json({ message: "البريد الإلكتروني أو رابط الصالون مستخدم مسبقاً." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newTenant = new Tenant({
      salonName,
      slug,
      ownerName,
      ownerPhone,
      email,
      password: hashedPassword,
      subscription: { plan: "Free", status: "Active" },
    });

    await newTenant.save();

    try {
      await Promise.all([
        Barber.create([
          { tenantId: newTenant._id, name: "كرسي 1", pin: "0000" },
          { tenantId: newTenant._id, name: "كرسي 2", pin: "1111" },
        ]),
        Service.create({
          tenantId: newTenant._id,
          name: "حلاقة أطفال",
          price: 30,
          duration: 30,
          category: "عام",
        }),
      ]);
    } catch (seedError) {
      console.error("⚠️ خطأ بسيط في حقن البيانات الافتراضية:", seedError);
    }

    sendWelcomeEmail(
      newTenant.email,
      newTenant.ownerName,
      newTenant.salonName,
    ).catch((err) => console.error("لم يتم إرسال بريد الترحيب:", err));

    const token = jwt.sign(
      { tenantId: newTenant._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      message: "تم إنشاء حسابك المجاني بنجاح! 🎉",
      token,
      tenant: { salonName: newTenant.salonName, slug: newTenant.slug },
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "حدث خطأ في الخادم أثناء التسجيل" });
  }
};

// 2. التحقق من الدفع وتفعيل الترقية (من بوابة الدفع)
const verifyPaymentAndActivate = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const tenantId = req.tenantId;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const moyasarSecretKey = process.env.MOYASAR_SECRET_KEY;
    if (!moyasarSecretKey)
      return res.status(500).json({ message: "خطأ في إعدادات بوابة الدفع." });

    const gatewayResponse = await axios.get(
      `https://api.moyasar.com/v1/payments/${paymentId}`,
      { auth: { username: moyasarSecretKey, password: "" } },
    );

    if (gatewayResponse.data.status === "paid") {
      const metadata = gatewayResponse.data.metadata || {};
      if (String(metadata.tenantId || "") !== String(tenantId)) {
        return res
          .status(400)
          .json({ message: "بيانات الدفع لا تطابق حساب الصالون الحالي." });
      }

      const normalized = normalizeSubscriptionRequest(
        metadata.plan,
        metadata.billingCycle,
      );
      if (!normalized) {
        return res
          .status(400)
          .json({ message: "بيانات الباقة في عملية الدفع غير صالحة." });
      }

      const promoCodeId = metadata.promoCodeId || null;
      const promo = promoCodeId ? await findValidPromo(promoCodeId) : null;
      if (promoCodeId && !promo) {
        return res
          .status(400)
          .json({ message: "كود الخصم المرفق بعملية الدفع غير صالح." });
      }

      const expectedAmount = await calculateSubscriptionPrice(
        normalized.plan,
        normalized.billingCycle,
        promo,
      );
      const paidAmount = Number(gatewayResponse.data.amount || 0);

      if (expectedAmount <= 0 || paidAmount < expectedAmount * 100) {
        return res.status(400).json({
          message: "مبلغ الدفع لا يطابق قيمة الاشتراك المطلوبة.",
        });
      }

      const endDate = new Date();
      if (normalized.billingCycle === "annual") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      tenant.subscription.plan = normalized.plan;
      tenant.subscription.status = "Active";
      tenant.subscription.endDate = endDate;
      tenant.subscription.billingCycle = normalized.billingCycle;
      await tenant.save();

      if (promoCodeId && !(await consumePromo(promoCodeId))) {
        console.error("فشل تحديث الكوبون بعد الدفع:", promoCodeId);
      }

      const token = jwt.sign({ tenantId: tenant._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.status(200).json({
        message: "تم تأكيد الدفع وترقية حسابك بنجاح! 🎉",
        token,
      });
    } else {
      res
        .status(400)
        .json({ message: "عذراً، عملية الدفع لم تكتمل أو تم رفضها من البنك." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "خطأ في الاتصال ببوابة الدفع، يرجى المحاولة لاحقاً." });
  }
};

// 3. التفعيل الفوري (إذا كان الكوبون مجاني 100%)
const freeActivation = async (req, res) => {
  try {
    const { plan, billingCycle, promoCodeId } = req.body;
    const tenantId = req.tenantId;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    const normalized = normalizeSubscriptionRequest(plan, billingCycle);
    if (!normalized) {
      return res.status(400).json({ message: "بيانات الباقة غير صالحة." });
    }

    const validPromo = await findValidPromo(promoCodeId);
    if (!validPromo) {
      return res.status(400).json({
        message: "عذراً، هذا الكود غير صالح، أو منتهي الصلاحية، أو نفدت كميته!",
      });
    }

    const finalPrice = await calculateSubscriptionPrice(
      normalized.plan,
      normalized.billingCycle,
      validPromo,
    );

    if (finalPrice > 0) {
      return res.status(400).json({
        message: "هذا الكود لا يغطي كامل قيمة الاشتراك ولا يصلح للتفعيل المجاني.",
      });
    }

    if (!(await consumePromo(promoCodeId))) {
      return res.status(400).json({
        message: "تعذر استخدام الكوبون لأنه استُخدم أو انتهت صلاحيته للتو.",
      });
    }

    const endDate = new Date();
    if (normalized.billingCycle === "annual") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    tenant.subscription.plan = normalized.plan;
    tenant.subscription.status = "Active";
    tenant.subscription.endDate = endDate;
    tenant.subscription.billingCycle = normalized.billingCycle;
    await tenant.save();

    const token = jwt.sign({ tenantId: tenant._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({
      message: "تم تفعيل الاشتراك المجاني بنجاح! 🎁",
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "خطأ في السيرفر أثناء التفعيل." });
  }
};

// 4. تسجيل الدخول
const loginTenant = async (req, res) => {
  try {
    const { email, password } = req.body;

    const tenant = await Tenant.findOne({ email }).lean();
    if (!tenant)
      return res.status(404).json({ message: "البريد الإلكتروني غير مسجل." });

    const isMatch = await bcrypt.compare(password, tenant.password);
    if (!isMatch)
      return res.status(400).json({ message: "كلمة المرور غير صحيحة." });

    if (tenant.subscription.status === "Pending") {
      return res.status(403).json({
        message: "عذراً، يجب إكمال عملية الدفع لتفعيل الحساب.",
        requiresPayment: true,
        tenantId: tenant._id,
      });
    }

    if (tenant.subscription.status !== "Active") {
      return res
        .status(403)
        .json({ message: "عذراً، اشتراكك منتهي أو موقوف." });
    }

    const token = jwt.sign({ tenantId: tenant._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({
      message: "تم تسجيل الدخول بنجاح",
      token,
      tenant: { salonName: tenant.salonName, slug: tenant.slug },
    });
  } catch (error) {
    res.status(500).json({ message: "خطأ في الخادم أثناء تسجيل الدخول" });
  }
};

// 5. استلام طلب التحويل البنكي اليدوي
const submitBankTransfer = async (req, res) => {
  try {
    const { senderName, bankName, plan, billingCycle, promoCodeId } = req.body;
    const tenantId = req.tenantId;

    const normalized = normalizeSubscriptionRequest(plan, billingCycle);
    if (!normalized) {
      return res.status(400).json({ message: "بيانات الباقة غير صالحة." });
    }

    if (promoCodeId) {
      const promo = await findValidPromo(promoCodeId);
      if (!promo) {
        return res.status(400).json({
          message: "كود الخصم غير صالح أو انتهت صلاحيته.",
        });
      }
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    tenant.subscription.status = "Pending_Approval";
    tenant.subscription.plan = normalized.plan;
    tenant.subscription.billingCycle = normalized.billingCycle;

    await tenant.save();

    if (promoCodeId) {
      if (!(await consumePromo(promoCodeId))) {
        return res.status(400).json({
          message: "كود الخصم غير صالح أو انتهت صلاحيته.",
        });
      }
    }

    res.status(200).json({
      message: `تم استلام طلب الترقية لباقة (${normalized.plan}) الدفع (${normalized.billingCycle === "annual" ? "السنوي" : "الشهري"})، سيتم مراجعة الحوالة وتفعيل حسابك قريباً.`,
    });
  } catch (error) {
    console.error("❌ خطأ في إرسال الحوالة:", error);
    res.status(500).json({ message: "خطأ في الخادم أثناء إرسال طلب التحويل" });
  }
};

// 6. استعادة كلمة المرور
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const tenant = await Tenant.findOne({ email });

    if (!tenant)
      return res
        .status(404)
        .json({ message: "لا يوجد حساب مسجل بهذا البريد الإلكتروني." });

    const resetToken = crypto.randomBytes(32).toString("hex");

    tenant.resetPasswordToken = resetToken;
    tenant.resetPasswordExpires = Date.now() + 3600000; // 1 Hour
    await tenant.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    sendPasswordResetEmail(tenant.email, tenant.ownerName, resetLink).catch(
      (e) => console.error(e),
    );

    res.status(200).json({
      message: "تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.",
    });
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ message: "حدث خطأ أثناء معالجة الطلب." });
  }
};

// 7. تعيين كلمة المرور الجديدة
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const tenant = await Tenant.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!tenant)
      return res
        .status(400)
        .json({ message: "رابط الاستعادة غير صالح أو انتهت صلاحيته." });

    const salt = await bcrypt.genSalt(10);
    tenant.password = await bcrypt.hash(newPassword, salt);

    tenant.resetPasswordToken = undefined;
    tenant.resetPasswordExpires = undefined;
    await tenant.save();

    res.status(200).json({
      message: "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",
    });
  } catch (error) {
    console.error("Error in reset password:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تغيير كلمة المرور." });
  }
};

module.exports = {
  registerTenant,
  resetPassword,
  verifyPaymentAndActivate,
  forgotPassword,
  loginTenant,
  submitBankTransfer,
  freeActivation,
};
