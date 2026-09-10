import assert from "node:assert/strict";
import test from "node:test";

import { normalizeStudyState, shouldDelayStudyMount } from "./studyState.js";

test("same-day study state preserves the current card and cycle", () => {
  const state = {
    cardIndex: 7,
    cycleIds: ["one", "two", "three"],
    date: "2026-09-10",
    isFlipped: true,
    isStudyComplete: false,
    seenIds: ["one", "two", "three", "earlier"],
  };

  assert.deepEqual(normalizeStudyState(state, "2026-09-10"), state);
});

test("study state from a previous day is discarded", () => {
  assert.equal(
    normalizeStudyState(
      {
        cardIndex: 7,
        cycleIds: ["one"],
        date: "2026-09-09",
        seenIds: ["one"],
      },
      "2026-09-10",
    ),
    null,
  );
});

test("signed-in Study waits for hydration before its first mount", () => {
  assert.equal(
    shouldDelayStudyMount({
      activeSection: "review",
      dailyStateLoaded: false,
      isDemo: false,
    }),
    true,
  );
  assert.equal(
    shouldDelayStudyMount({
      activeSection: "review",
      dailyStateLoaded: true,
      isDemo: false,
    }),
    false,
  );
  assert.equal(
    shouldDelayStudyMount({
      activeSection: "review",
      dailyStateLoaded: false,
      isDemo: true,
    }),
    false,
  );
});
