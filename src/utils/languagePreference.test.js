import assert from "node:assert/strict";
import test from "node:test";
import { createLanguagePreferenceSync, isSupportedLanguage } from "./languagePreference.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}
function setup(overrides = {}) {
  const languages = [];
  const statuses = [];
  const writes = [];
  const sync = createLanguagePreferenceSync({
    load: async () => "en", save: async (value) => { writes.push(value); },
    isCurrent: () => true, onLanguage: (value) => languages.push(value),
    onStatus: (status) => statuses.push(status), ...overrides,
  });
  return { sync, languages, statuses, writes };
}

test("initial hydration is shared across effect replay and is not a write", async () => {
  const gate = deferred();
  let reads = 0;
  const { sync, languages, writes } = setup({ load: () => { reads++; return gate.promise; } });
  sync.activate();
  sync.deactivate();
  sync.activate();
  gate.resolve("zh");
  await tick();
  sync.activate();
  sync.select("en");
  await tick();
  assert.equal(reads, 1);
  assert.deepEqual(languages, ["zh", "en"]);
  assert.deepEqual(writes, ["en"]);
});

test("a user selection made before hydration wins over the delayed saved value", async () => {
  const gate = deferred();
  const { sync, languages, writes } = setup({ load: () => gate.promise });
  sync.activate();
  sync.select("zh");
  assert.deepEqual(writes, []);
  gate.resolve("en");
  await tick();
  assert.deepEqual(languages, ["zh"]);
  assert.deepEqual(writes, ["zh"]);
});

test("rapid toggles serialize saves and coalesce superseded choices", async () => {
  const gate = deferred();
  const writes = [];
  let persisted = "en";
  const { sync, languages } = setup({ save: async (value) => {
    writes.push(value);
    if (writes.length === 1) await gate.promise;
    persisted = value;
  } });
  sync.activate();
  await tick();
  sync.select("zh");
  sync.select("en");
  sync.select("zh");
  sync.select("en");
  assert.deepEqual(writes, ["zh"]);
  gate.resolve();
  await tick();
  assert.deepEqual(writes, ["zh", "en"]);
  assert.equal(persisted, languages.at(-1));
});

test("a failed read never enables a default write and retries without losing user intent", async () => {
  let fail = true;
  const { sync, languages, statuses, writes } = setup({ load: async () => {
    if (fail) throw new Error("Offline");
    return "en";
  } });
  sync.activate();
  await tick();
  sync.select("zh");
  assert.equal(statuses.at(-1).error, "load");
  assert.deepEqual(writes, []);
  fail = false;
  sync.retry();
  await tick();
  assert.deepEqual(languages, ["zh"]);
  assert.deepEqual(writes, ["zh"]);
  assert.equal(statuses.at(-1).error, null);
});

test("an uncertain failed save retries the latest choice even if it matches the original", async () => {
  let fail = true;
  let persisted = "en";
  const { sync, statuses } = setup({ save: async (value) => {
    persisted = value;
    if (fail) throw new Error("Response lost after commit");
  } });
  sync.activate();
  await tick();
  sync.select("zh");
  await tick();
  sync.select("en");
  assert.equal(persisted, "zh");
  assert.equal(statuses.at(-1).error, "save");
  fail = false;
  sync.retry();
  await tick();
  assert.equal(persisted, "en");
  assert.equal(statuses.at(-1).error, null);
});

test("account invalidation discards late reads and stops queued saves and callbacks", async () => {
  const read = deferred();
  let current = true;
  const first = setup({ load: () => read.promise, isCurrent: () => current });
  first.sync.activate();
  first.sync.select("zh");
  current = false;
  read.resolve("en");
  await tick();
  assert.deepEqual(first.languages, ["zh"]);
  assert.deepEqual(first.writes, []);

  current = true;
  const write = deferred();
  const writes = [];
  const second = setup({ isCurrent: () => current, save: (value) => { writes.push(value); return write.promise; } });
  second.sync.activate();
  await tick();
  second.sync.select("zh");
  second.sync.select("en");
  const statusCount = second.statuses.length;
  current = false;
  second.sync.deactivate();
  write.resolve();
  await tick();
  assert.deepEqual(writes, ["zh"]);
  assert.equal(second.statuses.length, statusCount);
});

test("only supported languages are accepted; missing preferences default to English", async () => {
  const { sync, languages, writes } = setup({ load: async () => null });
  sync.activate();
  await tick();
  sync.select("fr");
  assert.deepEqual(languages, ["en"]);
  assert.deepEqual(writes, []);
  assert.equal(isSupportedLanguage("zh"), true);
  assert.equal(isSupportedLanguage("en"), true);
  assert.equal(isSupportedLanguage("fr"), false);
});
