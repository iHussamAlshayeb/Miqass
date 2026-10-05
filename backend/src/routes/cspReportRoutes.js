const express = require("express");
const rateLimit = require("../middlewares/rateLimit");

const router = express.Router();

const reportLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const parseReport = express.json({
  limit: "20kb",
  type: ["application/csp-report", "application/reports+json", "application/json"],
});

// نسجّل كل مخالفة مختلفة مرة واحدة (ثم كل 100 تكرار) حتى لا تمتلئ السجلات
const seen = new Map();
const MAX_TRACKED = 500;

const normalizeReports = (body) => {
  if (Array.isArray(body)) {
    // Reporting API: [{ type: "csp-violation", body: {...} }]
    return body
      .filter((item) => item?.type === "csp-violation" && item.body)
      .map((item) => ({
        directive: item.body.effectiveDirective || item.body.violatedDirective,
        blocked: item.body.blockedURL || item.body.blockedURI,
        page: item.body.documentURL || item.body.documentURI,
        source: item.body.sourceFile,
      }));
  }
  const report = body?.["csp-report"];
  if (!report) return [];
  return [{
    directive: report["effective-directive"] || report["violated-directive"],
    blocked: report["blocked-uri"],
    page: report["document-uri"],
    source: report["source-file"],
  }];
};

router.post("/", reportLimiter, parseReport, (req, res) => {
  for (const report of normalizeReports(req.body)) {
    const blocked = String(report.blocked || "inline").slice(0, 200);
    const directive = String(report.directive || "unknown").slice(0, 60);
    const key = `${directive}|${blocked}`;
    const count = (seen.get(key) || 0) + 1;
    if (seen.size < MAX_TRACKED || seen.has(key)) seen.set(key, count);
    if (count === 1 || count % 100 === 0) {
      console.warn(
        `[CSP] ${directive} منع: ${blocked} | الصفحة: ${String(report.page || "").slice(0, 120)}${count > 1 ? ` (تكرر ${count})` : ""}`,
      );
    }
  }
  res.sendStatus(204);
});

module.exports = router;
