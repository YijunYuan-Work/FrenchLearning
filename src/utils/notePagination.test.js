import assert from "node:assert/strict";
import test from "node:test";

import { collectPaginatedRows } from "./notePagination.js";

test("collectPaginatedRows returns every row beyond the first Supabase page", async () => {
  const source = Array.from({ length: 2005 }, (_, index) => ({ id: index }));
  const ranges = [];

  const rows = await collectPaginatedRows(async (from, to) => {
    ranges.push([from, to]);
    return source.slice(from, to + 1);
  });

  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  assert.deepEqual(rows, source);
  assert.equal(new Set(rows.map((row) => row.id)).size, source.length);
});

test("collectPaginatedRows checks for another page after an exact page boundary", async () => {
  const source = Array.from({ length: 2000 }, (_, index) => ({ id: index }));
  let calls = 0;

  const rows = await collectPaginatedRows(async (from, to) => {
    calls += 1;
    return source.slice(from, to + 1);
  });

  assert.equal(calls, 3);
  assert.deepEqual(rows, source);
});
