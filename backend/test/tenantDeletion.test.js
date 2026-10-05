const test = require("node:test");
const assert = require("node:assert/strict");

const Tenant = require("../src/models/Tenant");
const Campaign = require("../src/models/Campaign");
const Appointment = require("../src/models/Appointment");
const {
  RETENTION_DAYS,
  softDeleteTenant,
  restoreTenant,
  purgeTenant,
  purgeExpiredTenants,
} = require("../src/services/tenantDeletionService");

const tenantId = "507f1f77bcf86cd799439011";
const lean = (value) => ({ select() { return this; }, async lean() { return value; } });

const stub = (overrides) => {
  const originals = Object.entries(overrides).map(([path]) => {
    const [model, key] = path.split(".");
    const target = { Tenant, Campaign, Appointment }[model];
    return [target, key, target[key]];
  });
  for (const [path, impl] of Object.entries(overrides)) {
    const [model, key] = path.split(".");
    ({ Tenant, Campaign, Appointment })[model][key] = impl;
  }
  return () => originals.forEach(([target, key, impl]) => { target[key] = impl; });
};

test("soft delete requires typing the salon slug and never deletes data", async () => {
  const calls = { updates: [], campaignUpdates: [], deletes: 0 };
  const restore = stub({
    "Tenant.findById": () => lean({ _id: tenantId, slug: "balloon", salonName: "بالون", subscription: { status: "Active" }, whatsappSettings: { isEnabled: true }, deletedAt: null }),
    "Tenant.updateOne": async (filter, update) => { calls.updates.push({ filter, update }); return { modifiedCount: 1 }; },
    "Tenant.deleteOne": async () => { calls.deletes++; },
    "Campaign.find": () => lean([{ _id: "c1" }]),
    "Campaign.updateMany": async (filter, update) => { calls.campaignUpdates.push(update); },
    "Appointment.deleteMany": async () => { calls.deletes++; },
  });
  try {
    await assert.rejects(softDeleteTenant(tenantId, "wrong"), /غير مطابق/);
    await assert.rejects(softDeleteTenant(tenantId, undefined), /غير مطابق/);
    assert.equal(calls.updates.length, 0);

    const result = await softDeleteTenant(tenantId, " Balloon ");
    const set = calls.updates[0].update.$set;
    assert.ok(set.deletedAt instanceof Date);
    assert.equal(set["subscription.status"], "Inactive");
    assert.equal(set["whatsappSettings.isEnabled"], false);
    assert.equal(set.deletionInfo.previousStatus, "Active");
    assert.equal(set.deletionInfo.previousWhatsappEnabled, true);
    assert.deepEqual(set.deletionInfo.pausedCampaignIds, ["c1"]);
    const days = (result.purgeAfter - set.deletedAt) / 86400000;
    assert.equal(Math.round(days), RETENTION_DAYS);
    assert.equal(calls.campaignUpdates[0].$set.status, "Paused");
    assert.equal(calls.deletes, 0, "soft delete must not remove anything");
  } finally {
    restore();
  }
});

test("restore brings back the previous status, WhatsApp and paused campaigns", async () => {
  const calls = {};
  const restore = stub({
    "Tenant.findById": () => lean({ _id: tenantId, slug: "balloon", salonName: "بالون", deletedAt: new Date(), deletionInfo: { previousStatus: "Active", previousWhatsappEnabled: true, pausedCampaignIds: ["c1"] } }),
    "Tenant.updateOne": async (_f, update) => { calls.tenant = update; },
    "Campaign.updateMany": async (filter, update) => { calls.campaign = { filter, update }; },
  });
  try {
    await restoreTenant(tenantId);
    assert.equal(calls.tenant.$set["subscription.status"], "Active");
    assert.equal(calls.tenant.$set["whatsappSettings.isEnabled"], true);
    assert.equal(calls.tenant.$set.deletedAt, null);
    assert.equal(calls.campaign.update.$set.status, "Pending");
  } finally {
    restore();
  }
});

test("purge only touches soft-deleted tenants past their retention date", async () => {
  let purgeFilter;
  const restore = stub({
    "Tenant.find": (filter) => { purgeFilter = filter; return lean([]); },
    "Tenant.findOne": (filter) => lean(filter.deletedAt ? null : { _id: tenantId }),
  });
  try {
    assert.equal(await purgeExpiredTenants(new Date("2026-11-05")), 0);
    assert.deepEqual(purgeFilter.deletedAt, { $ne: null });
    assert.ok(purgeFilter["deletionInfo.purgeAfter"].$lte instanceof Date);
    assert.equal(await purgeTenant(tenantId), false, "an active tenant can never be purged");
  } finally {
    restore();
  }
});
