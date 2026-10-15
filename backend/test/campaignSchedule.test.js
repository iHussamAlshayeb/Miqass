const test = require("node:test");
const assert = require("node:assert/strict");
const { getCampaignDayKey, getNextCampaignDayStart } = require("../src/utils/campaignSchedule");

// الأوقات بتوقيت الرياض (UTC+3)
const riyadh = (iso) => new Date(`${iso}+03:00`);

test("the campaign day starts at 12:00 noon Riyadh time", () => {
  assert.equal(getCampaignDayKey(riyadh("2026-10-15T11:59:59")), "2026-10-14");
  assert.equal(getCampaignDayKey(riyadh("2026-10-15T12:00:00")), "2026-10-15");
  assert.equal(getCampaignDayKey(riyadh("2026-10-15T23:30:00")), "2026-10-15");
  assert.equal(getCampaignDayKey(riyadh("2026-10-16T00:30:00")), "2026-10-15");
});

test("after the daily limit, the next batch is the coming noon", () => {
  assert.equal(getNextCampaignDayStart(riyadh("2026-10-15T10:12:00")).toISOString(), "2026-10-15T09:00:00.000Z");
  assert.equal(getNextCampaignDayStart(riyadh("2026-10-15T12:05:00")).toISOString(), "2026-10-16T09:00:00.000Z");
  assert.equal(getNextCampaignDayStart(riyadh("2026-10-16T00:10:00")).toISOString(), "2026-10-16T09:00:00.000Z");
  assert.equal(getNextCampaignDayStart(riyadh("2026-10-31T13:00:00")).toISOString(), "2026-11-01T09:00:00.000Z");
});
