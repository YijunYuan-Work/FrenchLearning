import assert from "node:assert/strict";
import test from "node:test";
import { createDailySaver, sameSnapshot } from "./dailyPersistence.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

for (const field of ["quiz", "study"]) {
  test(`${field} saves are ordered and coalesce pending updates against the acknowledged baseline`, async () => {
    const gate = deferred();
    const writes = [];
    let persisted = 0;
    const saver = createDailySaver({
      initial: 0, expected: 0, isCurrent: () => true, onChange: () => {},
      write: async (value, expected) => {
        writes.push([value, expected]);
        if (value === 1) await gate.promise;
        assert.equal(persisted, expected);
        persisted = value;
        return value;
      },
    });
    saver.submit(0);
    assert.deepEqual(writes, []);
    saver.submit(1);
    await tick();
    saver.submit(2);
    saver.submit(3);
    assert.deepEqual(writes, [[1, 0]]);
    gate.resolve();
    await tick();
    assert.deepEqual(writes, [[1, 0], [3, 1]]);
    assert.equal(persisted, 3);
  });
}

test("write failure remains dirty, retains latest changes, and retries explicitly", async () => {
  let fail = true;
  let attempts = 0;
  let status;
  let persisted = 0;
  const saver = createDailySaver({
    initial: 0, expected: 0, isCurrent: () => true, onChange: (next) => { status = next; },
    write: async (value, expected) => {
      attempts++;
      assert.equal(expected, persisted);
      if (fail) throw new Error("Storage full");
      persisted = value;
      return value;
    },
  });
  saver.submit(1);
  await tick();
  assert.equal(status.dirty, true);
  assert.equal(status.error.message, "Storage full");
  saver.submit(2);
  await tick();
  assert.equal(attempts, 1);
  fail = false;
  saver.retry();
  await tick();
  assert.equal(persisted, 2);
  assert.deepEqual(status, { dirty: false, error: null });
});

test("account invalidation prevents queued writes and late status callbacks", async () => {
  const gate = deferred();
  let current = true;
  const writes = [];
  const statuses = [];
  const saver = createDailySaver({
    initial: 0, expected: 0, isCurrent: () => current, onChange: (status) => statuses.push(status),
    write: async (value) => { writes.push(value); await gate.promise; return value; },
  });
  saver.submit(1);
  await tick();
  saver.submit(2);
  current = false;
  const count = statuses.length;
  gate.resolve();
  await tick();
  saver.retry();
  await tick();
  assert.deepEqual(writes, [1]);
  assert.equal(statuses.length, count);
});

test("snapshot equality ignores JSON object key order, not array order", () => {
  assert.equal(sameSnapshot({ a: [1, 2], b: true }, { b: true, a: [1, 2] }), true);
  assert.equal(sameSnapshot({ a: [1, 2] }, { a: [2, 1] }), false);
});

test("a lost response retries the uncertain write before newer pending changes", async () => {
  let persisted = 0;
  let loseResponse = true;
  const writes = [];
  const saver = createDailySaver({
    initial: 0, expected: 0, isCurrent: () => true, onChange: () => {},
    write: async (value, expected) => {
      writes.push(value);
      assert.ok(persisted === expected || persisted === value);
      persisted = value;
      if (loseResponse) { loseResponse = false; throw new Error("Response lost after commit"); }
      return value;
    },
  });
  saver.submit(1);
  await tick();
  saver.submit(2);
  saver.retry();
  await tick();
  assert.deepEqual(writes, [1, 1, 2]);
  assert.equal(persisted, 2);
});
