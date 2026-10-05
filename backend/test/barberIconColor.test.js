const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Barber = require("../src/models/Barber");

test("barber icon color accepts a hex color or the default", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const barber = new Barber({ tenantId, name: "Test barber", iconColor: "#12ABef" });

  assert.equal(barber.validateSync(), undefined);
  barber.iconColor = "";
  assert.equal(barber.validateSync(), undefined);
  barber.iconColor = "red; background: black";
  assert.ok(barber.validateSync()?.errors.iconColor);
});
