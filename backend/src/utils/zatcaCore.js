const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const crypto = require("crypto");

const execPromise = util.promisify(exec);

const ZATCA_BASE_URL =
  process.env.ZATCA_BASE_URL ||
  "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal";

const sanitizeZatcaString = (str) => {
  if (!str) return "Unknown";
  return str.replace(/[\r\n=]/g, " ").trim();
};

const zatcaRequest = async (
  endpoint,
  method = "POST",
  data = null,
  headers = {},
) => {
  try {
    const response = await axios({
      url: `${ZATCA_BASE_URL}${endpoint}`,
      method,
      data,
      headers: {
        "Content-Type": "application/json",
        "Accept-Version": "V2",
        "Accept-Language": "ar",
        ...headers,
      },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    console.error(
      `❌ ZATCA API Error [${endpoint}]:`,
      error.response?.data || error.message,
    );
    throw error.response?.data || error;
  }
};

const generateZatcaCSR = async (salonData) => {
  console.log(
    `⏳ [ZATCA CORE] جاري توليد المفاتيح وملف الـ CSR لصالون: ${salonData.salonName}`,
  );

  const uniqueId = crypto.randomBytes(8).toString("hex");
  const tmpDir = os.tmpdir();

  const privateKeyPath = path.join(tmpDir, `private_${uniqueId}.pem`);
  const csrConfigPath = path.join(tmpDir, `csr_config_${uniqueId}.cnf`);
  const csrPath = path.join(tmpDir, `csr_${uniqueId}.pem`);

  // 🛡️ تنظيف البيانات قبل حقنها
  const safeSalonName = sanitizeZatcaString(salonData.salonName);
  const safeTaxNumber = sanitizeZatcaString(salonData.taxNumber);
  const safeAddress = sanitizeZatcaString(salonData.address);

  const configContent = `
oid_section = OIDs
[ OIDs ]
certificateTemplateName= 1.3.6.1.4.1.311.20.2

[ req ]
default_bits       = 2048
emailAddress       = admin@miqass.app
req_extensions     = v3_req
x509_extensions    = v3_ca
prompt             = no
default_md         = sha256
req_extensions     = req_ext
distinguished_name = dn

[ dn ]
C=SA
OU=Riyadh Branch
O=${safeSalonName}
CN=${safeSalonName}

[ req_ext ]
certificateTemplateName = ASN1:PRINTABLESTRING:ZATCA-Code-Signing
subjectAltName = dirName:dir_sect

[ dir_sect ]
SN=1-Miqass|2-1.0|3-${uniqueId}
UID=${safeTaxNumber}
title=1100
registeredAddress=${safeAddress}
businessCategory=Hair Salon
`;

  try {
    await fs.writeFile(csrConfigPath, configContent);

    console.log("🔑 جاري توليد المفتاح الخاص (Private Key)...");
    await execPromise(
      `openssl ecparam -name secp256k1 -genkey -noout -out ${privateKeyPath}`,
    );

    console.log("📜 جاري توليد ملف الـ CSR...");
    await execPromise(
      `openssl req -new -sha256 -key ${privateKeyPath} -extensions req_ext -config ${csrConfigPath} -out ${csrPath}`,
    );

    const privateKeyPEM = await fs.readFile(privateKeyPath, "utf8");
    const csrPEM = await fs.readFile(csrPath, "utf8");

    const csrBase64 = Buffer.from(csrPEM).toString("base64");

    await Promise.all([
      fs.unlink(privateKeyPath).catch(() => null),
      fs.unlink(csrConfigPath).catch(() => null),
      fs.unlink(csrPath).catch(() => null),
    ]);

    console.log("✅ تم توليد المفاتيح والـ CSR بنجاح!");

    return { csr: csrBase64, privateKey: privateKeyPEM };
  } catch (error) {
    await Promise.all([
      fs.unlink(privateKeyPath).catch(() => null),
      fs.unlink(csrConfigPath).catch(() => null),
      fs.unlink(csrPath).catch(() => null),
    ]);

    console.error("❌ فشل في توليد التشفير عبر OpenSSL:", error.message);
    throw new Error("حدث خطأ داخلي أثناء توليد التشفير الضريبي.");
  }
};

const getComplianceCSID = async (otp, csrBase64) => {
  const endpoint = "/compliance";
  const payload = { csr: csrBase64 };
  const headers = { OTP: otp };
  return await zatcaRequest(endpoint, "POST", payload, headers);
};

const checkComplianceInvoice = async (
  invoiceHash,
  invoiceBase64,
  uuid,
  complianceToken,
  complianceSecret,
) => {
  const endpoint = "/compliance/invoices";
  const authString = Buffer.from(
    `${complianceToken}:${complianceSecret}`,
  ).toString("base64");
  const payload = { invoiceHash, uuid, invoice: invoiceBase64 };
  const headers = { Authorization: `Basic ${authString}` };
  return await zatcaRequest(endpoint, "POST", payload, headers);
};

const getProductionCSID = async (
  complianceRequestId,
  complianceToken,
  complianceSecret,
) => {
  const endpoint = "/production/csids";
  const authString = Buffer.from(
    `${complianceToken}:${complianceSecret}`,
  ).toString("base64");
  const payload = { compliance_request_id: complianceRequestId };
  const headers = { Authorization: `Basic ${authString}` };
  return await zatcaRequest(endpoint, "POST", payload, headers);
};

const renewProductionCSID = async (newCsrBase64, oldToken, oldSecret) => {
  const endpoint = "/production/csids";
  const authString = Buffer.from(`${oldToken}:${oldSecret}`).toString("base64");
  const payload = { csr: newCsrBase64 };
  const headers = { Authorization: `Basic ${authString}`, OTP: "" };
  return await zatcaRequest(endpoint, "POST", payload, headers);
};

const reportSingleInvoice = async (
  invoiceHash,
  invoiceBase64,
  uuid,
  credentials,
) => {
  const endpoint = "/invoices/reporting/single";
  const authString = Buffer.from(
    `${credentials.binarySecurityToken}:${credentials.secret}`,
  ).toString("base64");
  const payload = { invoiceHash, uuid, invoice: invoiceBase64 };
  const headers = {
    Authorization: `Basic ${authString}`,
    "Clearance-Status": "1",
  };
  return await zatcaRequest(endpoint, "POST", payload, headers);
};

const clearSingleInvoice = async (
  invoiceHash,
  invoiceBase64,
  uuid,
  credentials,
) => {
  const endpoint = "/invoices/clearance/single";
  const authString = Buffer.from(
    `${credentials.binarySecurityToken}:${credentials.secret}`,
  ).toString("base64");
  const payload = { invoiceHash, uuid, invoice: invoiceBase64 };
  const headers = {
    Authorization: `Basic ${authString}`,
    "Clearance-Status": "1",
  };
  return await zatcaRequest(endpoint, "POST", payload, headers);
};

const onboardDevice = async (otp, salonData) => {
  try {
    console.log(
      `🚀 [ZATCA CORE] بدء عملية الربط لصالون: ${salonData.salonName}`,
    );

    const { csr, privateKey } = await generateZatcaCSR(salonData);

    console.log("🔑 [ZATCA CORE] جاري طلب شهادة الامتثال المبدئية...");
    const complianceResponse = await getComplianceCSID(otp, csr);

    console.log("📜 [ZATCA CORE] جاري طلب شهادة الإنتاج النهائية...");
    const productionResponse = await getProductionCSID(
      complianceResponse.requestID,
      complianceResponse.binarySecurityToken,
      complianceResponse.secret,
    );

    console.log("✅ [ZATCA CORE] تمت عملية الربط وإصدار الشهادة بنجاح!");

    return {
      binarySecurityToken: productionResponse.binarySecurityToken,
      secret: productionResponse.secret,
      privateKey: privateKey,
    };
  } catch (error) {
    console.error("❌ [ZATCA CORE] فشل عملية الربط:", error);
    throw error;
  }
};

module.exports = {
  zatcaRequest,
  generateZatcaCSR,
  getComplianceCSID,
  checkComplianceInvoice,
  getProductionCSID,
  renewProductionCSID,
  reportSingleInvoice,
  clearSingleInvoice,
  onboardDevice,
};
