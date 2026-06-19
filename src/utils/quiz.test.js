import assert from "node:assert/strict";
import test from "node:test";
import {
  createDailyQuizState,
  getEligibleVocabulary,
  isGenderCorrect,
  isMeaningCorrect,
  MAX_CONFIDENCE,
  uniqueLearningItems,
} from "./quiz.js";

test("meaning answers accept Chinese punctuation and exact normalized matches", () => {
  assert.equal(isMeaningCorrect("学校", "学校，学院"), true);
  assert.equal(isMeaningCorrect("college", "school, college"), true);
  assert.equal(isMeaningCorrect("office", "school, college"), false);
});

test("noun gender answers accept dropdown values and Chinese labels", () => {
  assert.equal(isGenderCorrect("masculine", "masculine"), true);
  assert.equal(isGenderCorrect("阴性", "feminine"), true);
  assert.equal(isGenderCorrect("feminine", "masculine"), false);
});

test("eligible quiz vocabulary excludes mastered and non-vocabulary notes", () => {
  const items = [
    { id: "1", category: "vocabulary", confidence: 1, french: "aller" },
    { id: "2", category: "vocabulary", confidence: MAX_CONFIDENCE, french: "être" },
    { id: "3", category: "phrases", confidence: 1, french: "bonjour" },
  ];

  assert.deepEqual(
    getEligibleVocabulary(items).map((item) => item.id),
    ["1"]
  );
});

test("eligible vocabulary deduplicates repeated words", () => {
  const items = [
    { id: "1", category: "vocabulary", confidence: 1, french: "aller" },
    { id: "2", category: "vocabulary", confidence: 1, french: "Aller" },
    { id: "3", category: "vocabulary", confidence: 1, french: "venir" },
  ];

  assert.deepEqual(
    getEligibleVocabulary(items).map((item) => item.id),
    ["1", "3"]
  );
});

test("new quiz queues exclude words that already appeared", () => {
  const items = [
    { id: "1", category: "vocabulary", confidence: 1, french: "aller" },
    { id: "2", category: "vocabulary", confidence: 1, french: "venir" },
    { id: "3", category: "vocabulary", confidence: 1, french: "faire" },
  ];

  const state = createDailyQuizState(items, "2026-06-19", ["1", "2"]);

  assert.deepEqual(state.queueIds, ["3"]);
  assert.deepEqual(state.seenIds, ["1", "2", "3"]);
});

test("study queues can share the same item de-duplication helper", () => {
  const items = [
    { id: "1", french: "bonjour" },
    { id: "1", french: "bonjour" },
    { id: "2", french: "Bonjour" },
    { id: "3", french: "merci" },
  ];

  assert.deepEqual(
    uniqueLearningItems(items).map((item) => item.id),
    ["1", "3"]
  );
});
