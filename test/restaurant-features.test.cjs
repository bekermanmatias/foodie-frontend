const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/restaurant-features.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { moduleEnabled, unavailableRoute } = loaded.exports;

test("no queries should start before bootstrap; current modules remain available on older backend", () => {
  assert.equal(moduleEnabled(null, "notifications"), false);
  assert.equal(moduleEnabled({}, "notifications"), true);
  assert.equal(moduleEnabled({}, "giftCards"), true);
  assert.equal(moduleEnabled({}, "futureFeature"), false);
});
test("module availability applies independently to restaurants and can be re-enabled", () => {
  const first = { features: { giftCards: false, notifications: false } };
  const other = { features: { giftCards: true, notifications: true } };
  assert.ok(unavailableRoute(first, "/gift-cards"));
  assert.ok(unavailableRoute(first, "/gift-cards/orders"));
  assert.equal(unavailableRoute(other, "/gift-cards"), null);
  assert.equal(moduleEnabled(first, "notifications"), false);
  assert.equal(moduleEnabled(other, "notifications"), true);
  first.features.giftCards = true;
  assert.equal(unavailableRoute(first, "/gift-cards"), null);
});
test("demo blocks all chat routes but keeps internal modules available", () => {
  assert.ok(unavailableRoute({ isDemo: true }, "/chat"));
  assert.ok(unavailableRoute({ isDemo: true }, "/chat/modulos/templates"));
  assert.equal(unavailableRoute({ isDemo: true }, "/reservas"), null);
  assert.equal(unavailableRoute({ isDemo: true }, "/gift-cards"), null);
  assert.equal(unavailableRoute({ isDemo: false }, "/chat"), null);
});
