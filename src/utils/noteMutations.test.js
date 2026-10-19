import assert from "node:assert/strict";
import test from "node:test";
import { changedNoteFields, createNoteMutationQueue } from "./noteMutations.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

test("editor changes exclude unchanged confidence and unrelated identity fields", () => {
  const original = { id: "one", french: "bonjour", english: "hello", confidence: 1, tags: ["greetings"], lastReviewed: "Not reviewed" };
  const next = { ...original, english: "good morning", createdAt: "ignored", user_id: "ignored" };
  assert.deepEqual(changedNoteFields(next, original), { english: "good morning" });
  assert.deepEqual(changedNoteFields({ ...next, confidence: 3 }, original), { english: "good morning", confidence: 3 });
});

test("same-note mutations execute in order and read the latest confirmed fields", async () => {
  const gate = deferred();
  const mutate = createNoteMutationQueue(() => true);
  let note = { confidence: 1, english: "hello" };
  const first = mutate("one", async () => { await gate.promise; note = { ...note, confidence: 2 }; });
  const second = mutate("one", () => { note = { ...note, english: "new meaning" }; });
  await tick();
  assert.deepEqual(note, { confidence: 1, english: "hello" });
  gate.resolve();
  await first;
  await second;
  assert.deepEqual(note, { confidence: 2, english: "new meaning" });
});

test("a failed mutation does not roll back a later edit or prevent its save", async () => {
  const mutate = createNoteMutationQueue(() => true);
  let note = { confidence: 1, english: "hello" };
  const first = mutate("one", () => { throw new Error("Offline"); });
  const rejected = assert.rejects(first, /Offline/);
  const second = mutate("one", () => { note = { ...note, english: "new meaning" }; });
  await rejected;
  await second;
  assert.deepEqual(note, { confidence: 1, english: "new meaning" });
});

test("different notes can finish out of order without blocking each other", async () => {
  const gate = deferred();
  const mutate = createNoteMutationQueue(() => true);
  const completed = [];
  const first = mutate("one", async () => { await gate.promise; completed.push("one"); });
  await mutate("two", () => completed.push("two"));
  assert.deepEqual(completed, ["two"]);
  gate.resolve();
  await first;
  assert.deepEqual(completed, ["two", "one"]);
});

test("account invalidation prevents queued note operations from starting", async () => {
  const gate = deferred();
  let active = true;
  const mutate = createNoteMutationQueue(() => active);
  const first = mutate("one", () => gate.promise);
  const second = mutate("one", () => assert.fail("stale operation ran"));
  const rejected = assert.rejects(second, /account changed/);
  await tick();
  active = false;
  gate.resolve();
  await first;
  await rejected;
});
