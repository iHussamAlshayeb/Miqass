const nodemailer = require("nodemailer");

// 💡 العودة للطريقة الرسمية والمضمونة (SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// للتشخيص: للتأكد من نجاح الاتصال بسيرفرات Brevo دون تعطيل السيرفر الأساسي
try {
  transporter.verify((error, success) => {
    if (error) {
      console.error(
        "❌ تحذير: خطأ في الاتصال بسيرفر الإيميلات (لن تتوقف بقية الخدمات):",
        error.message,
      );
    } else {
      console.log("📧 سيرفر الإيميلات (Brevo) جاهز للإرسال! ✅");
    }
  });
} catch (e) {
  console.log("⚠️ تم تخطي فحص SMTP لتجنب إيقاف السيرفر.");
}

// 💡 رابط الواجهة الأمامية مع Fallback ذكي
const FRONTEND_URL = process.env.FRONTEND_URL || "https://miqass.app";

// التصميم الأساسي الموحد للإيميلات (SaaS Style)
const baseTemplate = (title, content, buttonText, buttonLink) => `
<div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; text-align: right;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
        <div style="background-color: #0f172a; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">نظام مِقَص السحابي</h1>
        </div>
        <div style="padding: 40px 30px;">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">${title}</h2>
            <div style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                ${content}
            </div>
            ${
              buttonText && buttonLink
                ? `
            <div style="text-align: center;">
                <a href="${buttonLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 12px; font-size: 16px;">
                    ${buttonText}
                </a>
            </div>
            `
                : ""
            }
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} نظام مِقَص السحابي لصالونات الحلاقة والتجميل</p>
        </div>
    </div>
</div>
`;

// 💡 تجهيز اسم وعنوان المُرسل من ملف .env
const fromAddress = `"${process.env.FROM_NAME || "Miqass App"}" <${process.env.FROM_EMAIL || "noreply@miqass.app"}>`;

// =================================================================
// 🚀 دوال إرسال الإيميلات (مُغلفة بالـ Try/Catch لحماية السيرفر)
// =================================================================

// 1. رسالة تأكيد إنشاء الحساب
const sendWelcomeEmail = async (email, ownerName, salonName) => {
  try {
    const content = `
        أهلاً بك يا <strong>${ownerName}</strong> في نظام مِقَص! 🎉<br><br>
        تم إنشاء مساحة عمل صالونك "<strong>${salonName}</strong>" بنجاح على <strong>الباقة الأساسية (المجانية)</strong>.<br>
        صالونك الآن جاهز لاستقبال الحجوزات فوراً عبر رابطك المخصص، ويمكنك إدارة مواعيدك بكل سهولة.<br><br>
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 12px; font-size: 14px; margin-top: 15px;">
            💡 <strong>نصيحة:</strong> للحصول على سكرتير الواتساب الآلي وشاشة الانتظار التلفزيونية، يمكنك ترقية باقتك إلى (Pro) أو (VIP) من داخل لوحة التحكم في أي وقت.
        </div>
    `;
    const html = baseTemplate(
      "مرحباً بك في نظام مِقَص! 🚀",
      content,
      "الذهاب للوحة التحكم",
      `${FRONTEND_URL}/login`,
    );

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: "🎉 تم إنشاء حسابك المجاني بنجاح",
      html,
    });
  } catch (error) {
    console.error(`❌ فشل إرسال بريد الترحيب لـ ${email}:`, error.message);
  }
};

// 2. رسالة تأكيد تفعيل الترقية
const sendActivationEmail = async (email, ownerName, planName, endDate) => {
  try {
    const content = `
        أخبار رائعة يا <strong>${ownerName}</strong>! 🌟<br><br>
        تم ترقية وتفعيل اشتراكك في <strong>${planName}</strong> بنجاح.<br>
        صالونك الآن مجهز بأحدث أدوات الأتمتة الاحترافية لخدمة عملائك بأرقى مستوى.<br><br>
        ${endDate ? `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px 15px; border-radius: 8px; display: inline-block; font-weight: bold;">تاريخ التجديد القادم: ${new Date(endDate).toLocaleDateString("en-GB")}</div>` : ""}
    `;
    const html = baseTemplate(
      "تمت الترقية بنجاح! ✅",
      content,
      "تصفح الميزات الجديدة",
      `${FRONTEND_URL}/dashboard`,
    );

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: `✅ تم تفعيل باقة ${planName} لصالونك`,
      html,
    });
  } catch (error) {
    console.error(`❌ فشل إرسال بريد الترقية لـ ${email}:`, error.message);
  }
};

// 3. رسالة التذكير بقرب انتهاء الاشتراك
const sendRenewalReminderEmail = async (email, ownerName, daysLeft) => {
  try {
    const content = `
        مرحباً <strong>${ownerName}</strong>،<br><br>
        نود تذكيرك بأن اشتراك باقتك المتقدمة في نظام مِقَص سينتهي خلال <strong>${daysLeft} أيام</strong> ⏳.<br><br>
        لضمان استمرار عمل سكرتير الواتساب الآلي، وعدم توقف الميزات الاحترافية، يرجى المبادرة بتجديد الاشتراك.<br>
        <span style="color: #ef4444; font-size: 13px;"><em>(في حال عدم التجديد، سيعود حسابك تلقائياً للباقة المجانية المحدودة).</em></span>
    `;
    const html = baseTemplate(
      "تنبيه: اقترب موعد التجديد ⏰",
      content,
      "تجديد الاشتراك الآن 💳",
      `${FRONTEND_URL}/settings`,
    );

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: "⏳ تذكير بتجديد اشتراك باقتك في مِقَص",
      html,
    });
  } catch (error) {
    console.error(`❌ فشل إرسال بريد التذكير لـ ${email}:`, error.message);
  }
};

// 4. رسالة إعادة تعيين كلمة المرور
const sendPasswordResetEmail = async (email, ownerName, resetLink) => {
  try {
    const content = `
        مرحباً <strong>${ownerName}</strong>،<br><br>
        لقد استلمنا طلباً لإعادة تعيين كلمة المرور الخاصة بلوحة تحكم صالونك.<br>
        إذا كنت أنت من طلب ذلك، يرجى الضغط على الزر أدناه لإعداد كلمة مرور جديدة.<br><br>
        <span style="color: #64748b; font-size: 13px;"><em>إذا لم تقم بهذا الطلب، يمكنك تجاهل هذه الرسالة بأمان وسيبقى حسابك محمياً.</em></span>
    `;
    const html = baseTemplate(
      "إعادة تعيين كلمة المرور 🔐",
      content,
      "تغيير كلمة المرور",
      resetLink,
    );

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: "🔐 طلب إعادة تعيين كلمة المرور - مِقَص",
      html,
    });
  } catch (error) {
    console.error(
      `❌ فشل إرسال بريد استعادة كلمة المرور لـ ${email}:`,
      error.message,
    );
    // 💡 ملاحظة: بما أن هذه الدالة مهمة جداً (لا يمكن للمستخدم الدخول بدونها)،
    // يمكنك لاحقاً جعل الـ controller يعيد رسالة خطأ للعميل إذا فشلت هذه بالذات.
    throw new Error("فشل إرسال الإيميل"); // نعيد رمي الخطأ للـ controller ليتعامل معه
  }
};

module.exports = {
  sendWelcomeEmail,
  sendActivationEmail,
  sendRenewalReminderEmail,
  sendPasswordResetEmail,
};
