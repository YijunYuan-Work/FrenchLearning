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
  reconcileQuizState,
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

test("pending Quiz answer targets survive a persisted JSON round trip without becoming completed answers", () => {
  const pending = { answer: "hello", genderAnswer: "", correct: false, status: "pending", targetConfidence: 2 };
  const state = normalizeQuizState(JSON.parse(JSON.stringify({
    date: "2026-10-19", limit: 23, queueIds: ["previous", "word"], seenIds: ["previous", "word"],
    answered: { previous: { correct: true }, word: pending },
  })), "2026-10-19");
  assert.deepEqual(state.answered.word, pending);
  assert.equal(state.answered.previous.correct, true);
  assert.deepEqual(state.queueIds, ["previous", "word"]);
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
    { id: "1", category: "vocabulary", confidence: 1, french: "aller", english: "go" },
    { id: "2", category: "vocabulary", confidence: MAX_CONFIDENCE, french: "être", english: "be" },
    { id: "3", category: "phrases", confidence: 1, french: "bonjour" },
  ];

  assert.deepEqual(
    getEligibleVocabulary(items).map((item) => item.id),
    ["1"]
  );
});

test("eligible vocabulary deduplicates repeated words", () => {
  const items = [
    { id: "1", category: "vocabulary", confidence: 1, french: "aller", english: "go" },
    { id: "2", category: "vocabulary", confidence: 1, french: "Aller", english: "go" },
    { id: "3", category: "vocabulary", confidence: 1, french: "venir", english: "come" },
  ];

  assert.deepEqual(
    getEligibleVocabulary(items).map((item) => item.id),
    ["1", "3"]
  );
});

test("new quiz queues exclude words that already appeared", () => {
  const items = [
    { id: "1", category: "vocabulary", confidence: 1, french: "aller", english: "go" },
    { id: "2", category: "vocabulary", confidence: 1, french: "venir", english: "come" },
    { id: "3", category: "vocabulary", confidence: 1, french: "faire", english: "do" },
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
    english: "meaning",
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

const quizNote = (id, changes = {}) => ({ id, french: id, english: `meaning-${id}`, category: "vocabulary", confidence: 1, ...changes });
const session = (changes = {}) => ({ date: "2026-10-19", limit: 23, queueIds: ["a", "b", "c"], seenIds: ["a", "b", "c"], answered: {}, ...changes });

test("saved Quiz reconciliation removes ineligible active notes without reshuffling or replacing the queue", () => {
  const state = session({ queueIds: ["a", "phrase", "grammar", "pronunciation", "missing", "mastered", "b", "broken", "c"] });
  const items = [quizNote("a"), quizNote("b"), quizNote("c"),
    ...["phrases", "grammar", "pronunciation"].map((category, index) => quizNote(["phrase", "grammar", "pronunciation"][index], { category })),
    quizNote("mastered", { confidence: 4 }), quizNote("broken", { english: {} }), null];
  const next = reconcileQuizState(state, items);
  assert.deepEqual(next.queueIds, ["a", "b", "c"]);
  assert.equal(next.limit, 23);
  assert.equal(next.date, state.date);
  assert.ok(next.seenIds.includes("missing"));
  assert.equal(reconcileQuizState(next, items), next);
});

test("completed Quiz outcomes remain history after reclassification, deletion, or mastery", () => {
  const answered = { a: { correct: true, status: "complete" }, b: { correct: false, revealedAnswer: true }, c: { correct: true } };
  const next = reconcileQuizState(session({ answered }), [quizNote("a", { category: "grammar", english: "" }), quizNote("c", { confidence: 4 })]);
  assert.deepEqual(next.queueIds, ["a", "b", "c"]);
  assert.deepEqual(next.answered, answered);
  assert.equal(Object.values(next.answered).filter((result) => result.correct).length, 2);
  const legacy = reconcileQuizState(session({ queueIds: ["a"], answered: { a: { correct: false }, deleted: { correct: true } } }), [quizNote("a")]);
  assert.deepEqual(legacy.queueIds, ["a", "deleted"]);
  assert.equal(legacy.answered.deleted.correct, true);
});

test("pending Quiz outcomes are removed if ineligible, but fixed-target recovery survives a committed mastery update", () => {
  const pending = { status: "pending", correct: false, answer: "meaning", targetConfidence: 4 };
  const next = reconcileQuizState(session({ answered: { a: pending, b: pending, c: pending } }),
    [quizNote("a", { category: "phrases" }), quizNote("c", { confidence: 4 })]);
  assert.deepEqual(next.queueIds, ["c"]);
  assert.deepEqual(next.answered, { c: pending });
  assert.deepEqual(next.seenIds, ["a", "b", "c"]);
  assert.deepEqual(normalizeQuizState(JSON.parse(JSON.stringify(next)), next.date), next);
});

test("reconciliation rejects malformed IDs and answers and never repeats active French words", () => {
  const next = reconcileQuizState(session({ queueIds: [null, "a", "a", "duplicate", "b", "array", "bad", {}], answered: { array: [], b: { status: "pending", targetConfidence: "invalid" }, bad: "invalid" }, seenIds: {} }),
    [quizNote("a", { french: "école" }), quizNote("duplicate", { french: " E\u0301COLE " }), quizNote("b"), quizNote("array"), quizNote("bad", { confidence: Number.NaN })]);
  assert.deepEqual(next.queueIds, ["a"]);
  assert.deepEqual(next.answered, {});
  assert.ok(next.seenIds.includes("duplicate"));
  assert.deepEqual(getEligibleVocabulary([null, quizNote("x", { french: {} }), quizNote("y", { english: " " }), quizNote("z", { confidence: -1 })]), []);
});

test("a reconciled session with only removed questions stays exhausted, not a fresh randomized quiz", () => {
  const next = reconcileQuizState(session(), [quizNote("a", { category: "phrases" }), quizNote("new")]);
  assert.deepEqual(next.queueIds, []);
  assert.deepEqual(next.seenIds, ["a", "b", "c"]);
  assert.deepEqual(next.answered, {});
});
