import assert from "node:assert/strict";
import test from "node:test";
import {
  createQuizQueueIds,
  DAILY_QUIZ_LIMIT,
  createDailyQuizState,
  getEligibleVocabulary,
  isGenderCorrect,
  isMeaningCorrect,
  MAX_CONFIDENCE,
  normalizeQuizState,
  uniqueLearningItems,
} from "./quiz.js";

test("daily learning normalization preserves an unanswered quiz limit and queue", () => {
  const savedState = normalizeQuizState(
    {
      date: "2026-09-10",
      limit: 23,
      queueIds: ["word-3", "word-8"],
      answered: {},
      seenIds: ["word-3", "word-8"],
    },
    "2026-09-10"
  );

  assert.equal(savedState.limit, 23);
  assert.deepEqual(savedState.queueIds, ["word-3", "word-8"]);
  assert.deepEqual(savedState.answered, {});
});

test("daily learning normalization safely loads legacy and answered quiz states", () => {
  const legacyState = normalizeQuizState(
    {
      date: "2026-09-10",
      queueIds: ["legacy-word"],
      answered: {},
    },
    "2026-09-10"
  );
  const answeredState = normalizeQuizState(
    {
      date: "2026-09-10",
      limit: 23,
      queueIds: ["answered-word"],
      answered: { "answered-word": { correct: true } },
    },
    "2026-09-10"
  );

  assert.equal(legacyState.limit, undefined);
  assert.deepEqual(legacyState.queueIds, ["legacy-word"]);
  assert.deepEqual(legacyState.seenIds, ["legacy-word"]);
  assert.equal(answeredState.limit, 23);
  assert.deepEqual(answeredState.answered, {
    "answered-word": { correct: true },
  });
});

test("meaning answers accept complete English and Chinese choices", () => {
  for (const meanings of [
    "school, college",
    "school / college",
    "school; college",
    "school or college",
  ]) {
    assert.equal(isMeaningCorrect("school", meanings), true);
    assert.equal(isMeaningCorrect("COLLEGE", meanings), true);
  }

  for (const meanings of ["学校，学院", "学校、学院", "学校；学院", "学校或学院"]) {
    assert.equal(isMeaningCorrect("学校", meanings), true);
    assert.equal(isMeaningCorrect("学院", meanings), true);
  }

  assert.equal(isMeaningCorrect("ECOLE", "école"), true);
  assert.equal(isMeaningCorrect("office", "school, college"), false);
});

test("meaning answers reject arbitrary substrings and partial fragments", () => {
  assert.equal(isMeaningCorrect("cat", "education"), false);
  assert.equal(isMeaningCorrect("cat", "vacation"), false);
  assert.equal(isMeaningCorrect("coll", "college"), false);
  assert.equal(isMeaningCorrect("edu", "education"), false);
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

test("quiz queue defaults to 50 words and accepts a custom limit", () => {
  const items = Array.from({ length: 60 }, (_, index) => ({
    id: String(index + 1),
    category: "vocabulary",
    confidence: 1,
    french: `mot-${index + 1}`,
  }));

  assert.equal(DAILY_QUIZ_LIMIT, 50);
  assert.equal(createQuizQueueIds(items).length, 50);
  assert.equal(createQuizQueueIds(items, [], 12).length, 12);
});

test("learning items de-duplicate French text only within a category", () => {
  const items = [
    { id: "1", category: "vocabulary", french: "aller" },
    { id: "2", category: "vocabulary", french: "Aller" },
    { id: "3", category: "grammar", french: "aller" },
    { id: "4", category: "vocabulary", french: "bonjour" },
    { id: "5", category: "phrases", french: "bonjour" },
  ];

  assert.deepEqual(
    uniqueLearningItems(items).map((item) => item.id),
    ["1", "3", "4", "5"]
  );
});

test("learning items still de-duplicate repeated IDs", () => {
  const items = [
    { id: "1", category: "vocabulary", french: "aller" },
    { id: "1", category: "grammar", french: "venir" },
    { id: "2", category: "grammar", french: "venir" },
  ];

  assert.deepEqual(
    uniqueLearningItems(items).map((item) => item.id),
    ["1", "2"]
  );
});
