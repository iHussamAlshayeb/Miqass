const axios = require("axios");

// إرسال البريد عبر Resend API (https://resend.com/docs/api-reference/emails/send-email)
const RESEND_API_URL = "https://api.resend.com/emails";

if (process.env.RESEND_API_KEY) {
  console.log("📧 خدمة الإيميلات (Resend) جاهزة للإرسال! ✅");
} else {
  console.warn("⚠️ RESEND_API_KEY غير مضبوط — لن تُرسل الإيميلات (بقية الخدمات تعمل).");
}

// القيم القادمة من المستخدم (اسم المالك/الصالون) تُهرَّب قبل إدراجها في HTML
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const sendEmail = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY غير مضبوط");

  try {
    const { data } = await axios.post(
      RESEND_API_URL,
      {
        from: fromAddress,
        to: [to],
        subject,
        html,
        ...(text ? { text } : {}),
        ...(process.env.REPLY_TO_EMAIL ? { reply_to: process.env.REPLY_TO_EMAIL } : {}),
      },
      {
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    return data;
  } catch (error) {
    throw new Error(error.response?.data?.message || error.message);
  }
};

const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.miqass.app";
const BRAND = "مِقَص";
const BRAND_TAGLINE = "نظام إدارة صالونات الحلاقة والتجميل";

const fromAddress = `${process.env.FROM_NAME || "Miqass"} <${process.env.FROM_EMAIL || "noreply@miqass.app"}>`;

const footerNote = () =>
  process.env.REPLY_TO_EMAIL
    ? "للاستفسار، يمكنك الرد مباشرة على هذه الرسالة."
    : "هذه رسالة آلية، يرجى عدم الرد عليها.";

const formatDays = (value) => {
  const days = Number(value);
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومين";
  if (days >= 3 && days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
};

/**
 * يبني الرسالة بصيغتين: HTML ونص عادي (الرسائل التي تحتوي على نسخة نصية
 * تُصنَّف أفضل لدى مزودي البريد). كل النصوص تُهرَّب قبل إدراجها في HTML.
 */
const renderEmail = ({ heading, greeting, paragraphs = [], note, button }) => {
  const year = new Date().getFullYear();
  const paragraphHtml = paragraphs
    .map((text) => `<p style="margin: 0 0 14px;">${escapeHtml(text)}</p>`)
    .join("");

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<body style="margin: 0; padding: 0; background-color: #f4f5f7;">
<div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background-color: #f4f5f7; padding: 32px 16px; text-align: right;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #0f172a; padding: 20px 28px;">
      <span style="color: #ffffff; font-size: 20px; font-weight: bold;">${BRAND}</span>
    </div>
    <div style="padding: 32px 28px; color: #334155; font-size: 15px; line-height: 1.8;">
      <h1 style="margin: 0 0 20px; color: #0f172a; font-size: 20px;">${escapeHtml(heading)}</h1>
      ${greeting ? `<p style="margin: 0 0 14px;">${escapeHtml(greeting)}</p>` : ""}
      ${paragraphHtml}
      ${
        button
          ? `<div style="margin: 28px 0;">
        <a href="${escapeHtml(button.url)}" style="display: inline-block; background-color: #1d4ed8; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px;">${escapeHtml(button.text)}</a>
      </div>
      <p style="margin: 0 0 14px; color: #64748b; font-size: 13px;">إذا لم يعمل الزر، انسخ الرابط التالي في المتصفح:<br><span dir="ltr" style="word-break: break-all;">${escapeHtml(button.url)}</span></p>`
          : ""
      }
      ${
        note
          ? `<p style="margin: 20px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #64748b; font-size: 13px;">${escapeHtml(note)}</p>`
          : ""
      }
    </div>
    <div style="background-color: #f8fafc; padding: 16px 28px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 12px; line-height: 1.6;">
      ${escapeHtml(footerNote())}<br>
      &copy; ${year} ${BRAND} - ${BRAND_TAGLINE}
    </div>
  </div>
</div>
</body>
</html>`;

  const text = [
    heading,
    "",
    greeting,
    ...paragraphs,
    button ? `\n${button.text}:\n${button.url}` : null,
    note ? `\n${note}` : null,
    "",
    "--",
    footerNote(),
    `${BRAND} - ${BRAND_TAGLINE}`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  return { html, text };
};

const sendWelcomeEmail = async (email, ownerName, salonName) => {
  try {
    const { html, text } = renderEmail({
      heading: `مرحباً بك في ${BRAND}`,
      greeting: `مرحباً ${ownerName}،`,
      paragraphs: [
        `تم إنشاء حساب صالون «${salonName}» بنجاح على الباقة المجانية.`,
        "يمكنك الآن استقبال الحجوزات عبر رابط صالونك المخصص، وإدارة المواعيد والعملاء من لوحة التحكم.",
      ],
      note: "تتوفر ميزات إضافية مثل رسائل واتساب الآلية وشاشة الانتظار ضمن باقتي Pro وPremium، ويمكنك الترقية في أي وقت من لوحة التحكم.",
      button: { text: "الدخول إلى لوحة التحكم", url: `${FRONTEND_URL}/login` },
    });

    await sendEmail({
      to: email,
      subject: `تم إنشاء حساب صالونك في ${BRAND}`,
      html,
      text,
    });
  } catch (error) {
    console.error(`فشل إرسال بريد الترحيب إلى ${email}:`, error.message);
  }
};

const sendActivationEmail = async (email, ownerName, planName, endDate) => {
  try {
    const paragraphs = [
      `تم تفعيل اشتراكك في باقة ${planName} بنجاح، وأصبحت جميع ميزات الباقة متاحة في حسابك.`,
    ];
    if (endDate) {
      paragraphs.push(
        `تاريخ التجديد القادم: ${new Date(endDate).toLocaleDateString("en-GB")}`,
      );
    }

    const { html, text } = renderEmail({
      heading: "تأكيد تفعيل الاشتراك",
      greeting: `مرحباً ${ownerName}،`,
      paragraphs,
      button: { text: "الانتقال إلى لوحة التحكم", url: `${FRONTEND_URL}/dashboard` },
    });

    await sendEmail({
      to: email,
      subject: `تم تفعيل باقة ${planName} في ${BRAND}`,
      html,
      text,
    });
  } catch (error) {
    console.error(`فشل إرسال بريد التفعيل إلى ${email}:`, error.message);
  }
};

const sendRenewalReminderEmail = async (email, ownerName, daysLeft) => {
  try {
    const { html, text } = renderEmail({
      heading: "تذكير بموعد تجديد الاشتراك",
      greeting: `مرحباً ${ownerName}،`,
      paragraphs: [
        `ينتهي اشتراكك في ${BRAND} خلال ${formatDays(daysLeft)}.`,
        "لضمان استمرار ميزات باقتك دون انقطاع، نرجو تجديد الاشتراك قبل تاريخ الانتهاء.",
      ],
      note: "في حال عدم التجديد، سيتحول الحساب تلقائياً إلى الباقة المجانية.",
      button: { text: "تجديد الاشتراك", url: `${FRONTEND_URL}/settings` },
    });

    await sendEmail({
      to: email,
      subject: `تذكير: ينتهي اشتراكك في ${BRAND} خلال ${formatDays(daysLeft)}`,
      html,
      text,
    });
  } catch (error) {
    console.error(`فشل إرسال بريد التذكير إلى ${email}:`, error.message);
  }
};

const sendPasswordResetEmail = async (email, ownerName, resetLink) => {
  try {
    const { html, text } = renderEmail({
      heading: "إعادة تعيين كلمة المرور",
      greeting: `مرحباً ${ownerName}،`,
      paragraphs: [
        `تلقينا طلباً لإعادة تعيين كلمة المرور لحساب صالونك في ${BRAND}.`,
        "لإنشاء كلمة مرور جديدة، استخدم الرابط أدناه. صلاحية الرابط ساعة واحدة.",
      ],
      note: "إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة ولن يطرأ أي تغيير على حسابك.",
      button: { text: "إعادة تعيين كلمة المرور", url: resetLink },
    });

    await sendEmail({
      to: email,
      subject: `إعادة تعيين كلمة المرور - ${BRAND}`,
      html,
      text,
    });
  } catch (error) {
    console.error(`فشل إرسال بريد استعادة كلمة المرور إلى ${email}:`, error.message);
    throw new Error("فشل إرسال الإيميل");
  }
};

module.exports = {
  sendWelcomeEmail,
  sendActivationEmail,
  sendRenewalReminderEmail,
  sendPasswordResetEmail,
};
