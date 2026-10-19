import assert from "node:assert/strict";
import test from "node:test";

import { normalizeStudyState, shouldDelayLearningMount } from "./studyState.js";

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

test("Quiz and Study wait for daily state, notes, and settings to hydrate", () => {
  const ready = { dailyStateLoaded: true, notesLoaded: true, learningSettingsLoaded: true, isDemo: false };
  for (const activeSection of ["review", "quiz"]) {
    assert.equal(shouldDelayLearningMount({ ...ready, activeSection }), false);
    for (const flag of ["dailyStateLoaded", "notesLoaded", "learningSettingsLoaded"]) {
      assert.equal(shouldDelayLearningMount({ ...ready, activeSection, [flag]: false }), true);
    }
    assert.equal(shouldDelayLearningMount({ activeSection, isDemo: true }), false);
  }
  assert.equal(shouldDelayLearningMount({ activeSection: "today", isDemo: false }), false);
});
