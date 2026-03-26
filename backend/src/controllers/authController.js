const Tenant = require("../models/Tenant");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const PromoCode = require("../models/PromoCode");

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require("../utils/emailService");

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

    // 🚀 تنفيذ الحقن الافتراضي بالتوازي (Parallel Execution) لسرعة استجابة أعلى
    try {
      await Promise.all([
        Barber.insertMany([
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

    // إرسال البريد في الخلفية بدون أن نعطل الاستجابة (Fire and Forget)
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
    const { tenantId, paymentId, plan, billingCycle, promoCodeId } = req.body;

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
      const endDate = new Date();
      if (billingCycle === "annual") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      tenant.subscription.plan = plan || "Premium";
      tenant.subscription.status = "Active";
      tenant.subscription.endDate = endDate;
      tenant.subscription.billingCycle = billingCycle;
      await tenant.save();

      // 🛡️ زيادة عداد الكوبون بشكل ذري (Atomic) لمنع تجاوز الحد الأقصى
      if (promoCodeId) {
        await PromoCode.updateOne(
          {
            _id: promoCodeId,
            isActive: true,
            $expr: { $lt: ["$usedCount", "$maxUses"] },
          },
          { $inc: { usedCount: 1 } },
        ).catch((err) => console.error("فشل تحديث الكوبون", err));
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
    const { tenantId, plan, billingCycle, promoCodeId } = req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    // 🚀 السحر الأمني هنا (Optimistic Locking):
    // نفحص الصلاحية والكمية ونزيد العداد في عملية قاعدة بيانات واحدة لا يمكن مقاطعتها!
    const validPromo = await PromoCode.findOneAndUpdate(
      {
        _id: promoCodeId,
        isActive: true,
        expiryDate: { $gt: new Date() }, // يجب أن يكون غير منتهي الصلاحية
        $expr: { $lt: ["$usedCount", "$maxUses"] }, // لم يتجاوز الحد الأقصى
      },
      { $inc: { usedCount: 1 } },
      { returnDocument: "after" },
    );

    if (!validPromo) {
      return res.status(400).json({
        message: "عذراً، هذا الكود غير صالح، أو منتهي الصلاحية، أو نفدت كميته!",
      });
    }

    const endDate = new Date();
    if (billingCycle === "annual") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    tenant.subscription.plan = plan || "Pro";
    tenant.subscription.status = "Active";
    tenant.subscription.endDate = endDate;
    tenant.subscription.billingCycle = billingCycle;
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

    // 🚀 استخدام .lean() لسرعة القراءة وعدم حجز RAM للـ Mongoose Object
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
    const { tenantId, senderName, bankName, plan, billingCycle, promoCodeId } =
      req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: "الصالون غير موجود" });

    tenant.subscription.status = "Pending_Approval";
    if (plan) tenant.subscription.plan = plan;
    if (billingCycle) tenant.subscription.billingCycle = billingCycle;

    await tenant.save();

    // 🛡️ التحديث الذري للكوبون
    if (promoCodeId) {
      await PromoCode.updateOne(
        {
          _id: promoCodeId,
          isActive: true,
          $expr: { $lt: ["$usedCount", "$maxUses"] },
        },
        { $inc: { usedCount: 1 } },
      ).catch((err) => console.log(err));
    }

    res.status(200).json({
      message: `تم استلام طلب الترقية لباقة (${plan}) الدفع (${billingCycle === "annual" ? "السنوي" : "الشهري"})، سيتم مراجعة الحوالة وتفعيل حسابك قريباً.`,
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
    // إرسال في الخلفية Fire and Forget
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
