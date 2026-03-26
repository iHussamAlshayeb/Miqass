const crypto = require("crypto");
const { Buffer } = require("buffer");

// =================================================================
// 🔣 1. محرك توليد الـ QR Code (Phase 2 TLV Base64)
// =================================================================
const getTLV = (tag, value, isBinary = false) => {
  // 🛡️ حماية من القيم الفارغة التي قد تكسر الـ Buffer
  if (!value) value = isBinary ? "" : "Unknown";

  let valueBuffer = isBinary
    ? Buffer.from(value, "base64")
    : Buffer.from(String(value), "utf8");

  // 🚀 الحماية من طفح البيانات النصية (Tags 1 to 5) للأسماء العربية الطويلة جداً
  if (!isBinary && valueBuffer.length > 255) {
    valueBuffer = valueBuffer.subarray(0, 255);
  }

  const tagBuffer = Buffer.from([tag]);
  const lengthBuffer = Buffer.from([valueBuffer.length]);

  return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
};

const generatePhase2QR = (
  data,
  invoiceHash,
  digitalSignature,
  publicKey,
  certificateSignature,
) => {
  try {
    const sellerName = getTLV(1, data.sellerName);
    const vatRegistration = getTLV(2, data.vatNumber);
    const timeStamp = getTLV(3, data.timeStamp);
    const invoiceTotal = getTLV(4, data.totalAmount);
    const vatTotal = getTLV(5, data.vatAmount);
    const hashTlv = getTLV(6, invoiceHash, true); // Binary
    const signatureTlv = getTLV(7, digitalSignature, true); // Binary
    const publicKeyTlv = getTLV(8, publicKey, true); // Binary
    const certSignatureTlv = getTLV(9, certificateSignature, true); // Binary

    const qrBuffer = Buffer.concat([
      sellerName,
      vatRegistration,
      timeStamp,
      invoiceTotal,
      vatTotal,
      hashTlv,
      signatureTlv,
      publicKeyTlv,
      certSignatureTlv,
    ]);

    return qrBuffer.toString("base64");
  } catch (error) {
    console.error("❌ خطأ في توليد الـ Phase 2 QR Code:", error);
    throw new Error("فشل توليد رمز الاستجابة السريعة (QR Code).");
  }
};

// =================================================================
// 📄 2. مصنع الفواتير (XML UBL 2.1 Builder)
// =================================================================
const buildSimplifiedInvoiceXML = (invoice, salon, items) => {
  // 🚀 استخدام map و join بدلاً من += لسرعة فائقة في بناء الـ XML وعدم استهلاك الـ RAM
  const invoiceLinesXML = items
    .map((item, index) => {
      const netPrice = (item.price / 1.15).toFixed(2);
      const taxAmount = (item.price - netPrice).toFixed(2);

      return `
    <cac:InvoiceLine>
        <cbc:ID>${index + 1}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="PCE">${item.quantity || 1}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="SAR">${netPrice}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
            <cbc:TaxAmount currencyID="SAR">${taxAmount}</cbc:TaxAmount>
            <cac:TaxSubtotal>
                <cbc:TaxableAmount currencyID="SAR">${netPrice}</cbc:TaxableAmount>
                <cbc:TaxAmount currencyID="SAR">${taxAmount}</cbc:TaxAmount>
                <cac:TaxCategory>
                    <cbc:ID>S</cbc:ID>
                    <cbc:Percent>15.00</cbc:Percent>
                    <cac:TaxScheme>
                        <cbc:ID>VAT</cbc:ID>
                    </cac:TaxScheme>
                </cac:TaxCategory>
            </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:Item>
            <cbc:Name>${item.name}</cbc:Name>
            <cac:ClassifiedTaxCategory>
                <cbc:ID>S</cbc:ID>
                <cbc:Percent>15.00</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:ClassifiedTaxCategory>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="SAR">${netPrice}</cbc:PriceAmount>
        </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join("");

  // 🚨 ملاحظة هامة جداً للإنتاج (PIH - Previous Invoice Hash):
  // النص "NWZlY..." مسموح به فقط للفاتورة الأولى (رقم 1).
  // الفاتورة رقم 2 يجب أن تضع هنا بصمة (Hash) الفاتورة رقم 1، وهكذا!
  const previousInvoiceHash =
    invoice.previousInvoiceHash ||
    "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

  const xmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <ext:UBLExtensions>
        <ext:UBLExtension>
            <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
            <ext:ExtensionContent>
                ZATCA_SIGNATURE_PLACEHOLDER
            </ext:ExtensionContent>
        </ext:UBLExtension>
    </ext:UBLExtensions>
    
    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
    <cbc:ID>${invoice.invoiceNumber}</cbc:ID>
    <cbc:UUID>${invoice.uuid}</cbc:UUID>
    <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
    <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
    <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
    <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
    
    <cac:AdditionalDocumentReference>
        <cbc:ID>ICV</cbc:ID>
        <cbc:UUID>${invoice.invoiceCounter || 1}</cbc:UUID>
    </cac:AdditionalDocumentReference>
    <cac:AdditionalDocumentReference>
        <cbc:ID>PIH</cbc:ID>
        <cac:Attachment>
            <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${previousInvoiceHash}</cbc:EmbeddedDocumentBinaryObject>
        </cac:Attachment>
    </cac:AdditionalDocumentReference>

    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="CRN">${salon.crNumber || "1234567890"}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PostalAddress>
                <cbc:StreetName>${salon.street || "Main Street"}</cbc:StreetName>
                <cbc:BuildingNumber>${salon.buildingNumber || "1234"}</cbc:BuildingNumber>
                <cbc:CitySubdivisionName>${salon.district || "Al Olaya"}</cbc:CitySubdivisionName>
                <cbc:CityName>${salon.city || "Riyadh"}</cbc:CityName>
                <cbc:PostalZone>${salon.postalCode || "12211"}</cbc:PostalZone>
                <cac:Country>
                    <cbc:IdentificationCode>SA</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${salon.taxNumber}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${salon.salonName}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:AccountingSupplierParty>

    <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PartyTaxScheme>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${invoice.customerName || "Cash Customer"}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:AccountingCustomerParty>

    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${invoice.totalVatAmount}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="SAR">${invoice.totalNetPrice}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="SAR">${invoice.totalVatAmount}</cbc:TaxAmount>
            <cac:TaxCategory>
                <cbc:ID>S</cbc:ID>
                <cbc:Percent>15.00</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:TaxCategory>
        </cac:TaxSubtotal>
    </cac:TaxTotal>

    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="SAR">${invoice.totalNetPrice}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="SAR">${invoice.totalNetPrice}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="SAR">${invoice.totalAmount}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="SAR">${invoice.totalAmount}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>

    ${invoiceLinesXML}
</Invoice>`;

  return xmlTemplate;
};

// =================================================================
// ✍️ 3. محرك الختم والتشفير (XML Signer & Hashing)
// =================================================================
const signZatcaInvoice = (rawXml, data, privateKey, certificate) => {
  try {
    // 1. 🛡️ المعالجة السحرية للشهادة
    const cleanToken = String(certificate).replace(/[\r\n\s]/g, "");
    const pemCertificate = `-----BEGIN CERTIFICATE-----\n${cleanToken.match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;

    const cert = new crypto.X509Certificate(pemCertificate);
    const serialNumber = BigInt("0x" + cert.serialNumber).toString(10);
    const issuerName = cert.issuer.split("\n").reverse().join(", ");

    // 2. 🔐 تنظيف الـ XML وحساب البصمة
    const pureXmlForHashing = rawXml
      .replace("ZATCA_SIGNATURE_PLACEHOLDER", "")
      .trim();
    const invoiceHash = crypto
      .createHash("sha256")
      .update(pureXmlForHashing, "utf8")
      .digest("base64");

    // 3. التوقيع الرقمي (Digital Signature) باستخدام المفتاح الخاص
    const sign = crypto.createSign("SHA256");
    sign.update(pureXmlForHashing, "utf8");
    const digitalSignature = sign.sign(privateKey, "base64");

    // 4. بصمة الشهادة نفسها
    const certBuffer = Buffer.from(cleanToken, "base64");
    const certificateHash = crypto
      .createHash("sha256")
      .update(certBuffer)
      .digest("base64");

    // 5. ضبط صيغة الوقت (ZATCA تقبل ثواني بدون ملي ثانية)
    const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    // 6. توليد الـ QR Code
    const qrCodeBase64 = generatePhase2QR(
      data,
      invoiceHash,
      digitalSignature,
      cleanToken,
      certificateHash,
    );

    // 7. 🧱 بناء هيكل XAdES المعتمد
    const signatureBlock = `
                <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
                    <sac:SignatureInformation>
                        <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
                        <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
                        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
                            <ds:SignedInfo>
                                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                                <ds:Reference Id="invoiceSignedData" URI="">
                                    <ds:Transforms>
                                        <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                            <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                                        </ds:Transform>
                                        <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                            <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                                        </ds:Transform>
                                        <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                                    </ds:Transforms>
                                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                    <ds:DigestValue>${invoiceHash}</ds:DigestValue>
                                </ds:Reference>
                            </ds:SignedInfo>
                            <ds:SignatureValue>${digitalSignature}</ds:SignatureValue>
                            <ds:KeyInfo>
                                <ds:X509Data>
                                    <ds:X509Certificate>${cleanToken}</ds:X509Certificate>
                                </ds:X509Data>
                            </ds:KeyInfo>
                            <ds:Object>
                                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#signature">
                                    <xades:SignedProperties Id="xadesSignedProperties">
                                        <xades:SignedSignatureProperties>
                                            <xades:SigningTime>${signingTime}</xades:SigningTime>
                                            <xades:SigningCertificate>
                                                <xades:Cert>
                                                    <xades:CertDigest>
                                                        <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                                        <ds:DigestValue>${certificateHash}</ds:DigestValue>
                                                    </xades:CertDigest>
                                                    <xades:IssuerSerial>
                                                        <ds:X509IssuerName>${issuerName}</ds:X509IssuerName>
                                                        <ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>
                                                    </xades:IssuerSerial>
                                                </xades:Cert>
                                            </xades:SigningCertificate>
                                        </xades:SignedSignatureProperties>
                                    </xades:SignedProperties>
                                </xades:QualifyingProperties>
                            </ds:Object>
                        </ds:Signature>
                    </sac:SignatureInformation>
                </sig:UBLDocumentSignatures>
                
                <cac:AdditionalDocumentReference>
                    <cbc:ID>QR</cbc:ID>
                    <cac:Attachment>
                        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrCodeBase64}</cbc:EmbeddedDocumentBinaryObject>
                    </cac:Attachment>
                </cac:AdditionalDocumentReference>`;

    const finalSignedXml = rawXml.replace(
      "ZATCA_SIGNATURE_PLACEHOLDER",
      signatureBlock,
    );
    const finalXmlBase64 = Buffer.from(finalSignedXml).toString("base64");

    return {
      invoiceHash: invoiceHash,
      xmlBase64: finalXmlBase64,
      qrCodeBase64: qrCodeBase64,
    };
  } catch (error) {
    console.error("❌ [XML FACTORY] خطأ أثناء تشفير الفاتورة:", error.message);
    throw new Error("فشل في ختم وتشفير الفاتورة.");
  }
};

module.exports = {
  generatePhase2QR,
  buildSimplifiedInvoiceXML,
  signZatcaInvoice,
};
