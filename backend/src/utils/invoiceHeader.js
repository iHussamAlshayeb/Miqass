/**
 * بيانات رأس الفاتورة الضريبية المبسطة (ZATCA): اسم البائع، العنوان، الرقم الضريبي، السجل التجاري،
 * وتاريخ/وقت الإصدار بتوقيت الرياض وبأرقام لاتينية ليتطابق المطبوع مع ما في رمز QR.
 */
const RIYADH = "Asia/Riyadh";

const riyadhDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: RIYADH, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
};

/** طابع ISO 8601 بدون أجزاء الثانية، وهو الشكل المعتمد في الحقل 3 من QR */
const zatcaTimestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().replace(/\.\d{3}Z$/, "Z");
};

const formatSellerAddress = (seller = {}) => {
  const clean = (value) => String(value || "").trim();
  const building = clean(seller.buildingNumber);
  const street = clean(seller.street);
  const cityLine = [clean(seller.city), clean(seller.postalCode)].filter(Boolean).join(" ");
  return [building && street ? `${building} ${street}` : building || street, cityLine].filter(Boolean).join("، ");
};

const sellerInfo = (tenant) => {
  const seller = tenant?.taxSettings?.zakaty?.seller || {};
  const salonName = tenant?.salonName || "";
  const legalName = String(seller.legalName || "").trim();
  return {
    salonName,
    legalName: legalName && legalName !== salonName ? legalName : "",
    // اسم البائع في QR هو الاسم المسجل ضريبياً متى توفر
    sellerName: legalName || salonName,
    sellerAddress: formatSellerAddress(seller),
    crNumber: String(seller.crNumber || tenant?.taxSettings?.zakaty?.registeredCrNumber || "").trim(),
    taxNumber: String(tenant?.taxSettings?.taxNumber || "").trim(),
    phone: tenant?.settings?.contactPhone || tenant?.ownerPhone || "",
  };
};

const SELLER_SELECT = "salonName ownerPhone branding settings.contactPhone taxSettings.taxNumber taxSettings.zakaty.seller taxSettings.zakaty.registeredCrNumber";

module.exports = { riyadhDateTime, zatcaTimestamp, formatSellerAddress, sellerInfo, SELLER_SELECT };
