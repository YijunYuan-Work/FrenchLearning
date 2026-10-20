import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyAdjectiveForms, createEmptyConjugation } from "../data/wordFields.js";
import { importVocabularyRecords } from "./vocabularyImport.js";
import { summarizeImportResults } from "./importResults.js";

function record(overrides = {}) {
  return {
    french: "bonjour",
    english: "你好",
    partOfSpeech: "interjection",
    gender: "",
    ipa: "/bɔ̃.ʒuʁ/",
    tags: ["greeting"],
    example: "Bonjour, Marie !",
    notes: "A common greeting.",
    conjugation: createEmptyConjugation(),
    adjectiveForms: createEmptyAdjectiveForms(),
    sourceRow: 2,
    validationIssues: [],
    ...overrides,
  };
}

test("vocabulary import persists parsed data directly without invoking AI", async () => {
  let aiCalls = 0;
  const saved = [];
  const result = await importVocabularyRecords({
    records: [record()],
    existingItems: [],
    autoFill: () => {
      aiCalls += 1;
    },
    saveNote: async (note) => {
      saved.push(note);
      return { id: "saved-1", ...note };
    },
  });

  assert.equal(aiCalls, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].english, "你好");
  assert.equal(saved[0].confidence, 1);
  assert.equal(saved[0].lastReviewed, "Not reviewed");
  assert.equal(result[0].status, "added");
});

test("vocabulary import skips duplicates in the file and existing notes", async () => {
  let saves = 0;
  const results = await importVocabularyRecords({
    records: [record(), record({ french: "BONJOUR" }), record({ french: "école" })],
    existingItems: [{ category: "vocabulary", french: "école" }],
    saveNote: async (note) => {
      saves += 1;
      return { id: String(saves), ...note };
    },
  });

  assert.equal(saves, 1);
  assert.deepEqual(
    results.map((result) => result.status),
    ["added", "skipped", "skipped"]
  );
});

test("vocabulary imports share trimmed, case-insensitive NFC duplicate identity with editor saves", async () => {
  let saves = 0;
  const results = await importVocabularyRecords({
    records: [record({ french: " e\u0301cole " }), record({ french: "ÉCOLE" })],
    existingItems: [{ id: "old", category: "vocabulary", french: " ÉCOLE " }],
    saveNote: async () => { saves += 1; },
  });
  assert.equal(saves, 0);
  assert.deepEqual(results.map((result) => result.status), ["skipped", "skipped"]);
});

test("vocabulary import reports invalid rows without saving them", async () => {
  let saves = 0;
  const results = await importVocabularyRecords({
    records: [record({ french: "", validationIssues: [{ code: "missingFrench" }] })],
    existingItems: [],
    saveNote: async () => {
      saves += 1;
    },
  });

  assert.equal(saves, 0);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].reason, /French is required/);
});

test("vocabulary import respects cancellation between rows", async () => {
  let saves = 0;
  const results = await importVocabularyRecords({
    records: [record(), record({ french: "salut" })],
    existingItems: [],
    saveNote: async (note) => {
      saves += 1;
      return { id: String(saves), ...note };
    },
    shouldCancel: () => saves === 1,
  });

  assert.equal(saves, 1);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((result) => result.status), ["added", "unprocessed"]);
});

test("cancellation waits for the active save and reports the untouched remainder", async () => {
  let release;
  let cancelled = false;
  const saved = [];
  const completed = [];
  const run = importVocabularyRecords({
    records: [record(), record({ french: "salut" }), record({ french: "merci" })], existingItems: [],
    saveNote: async (note) => {
      saved.push(note);
      await new Promise((resolve) => { release = resolve; });
      return { id: "saved", ...note };
    },
    shouldCancel: () => cancelled,
    onResult: (result) => completed.push(result),
  });
  cancelled = true;
  release();
  const results = await run;
  assert.equal(saved.length, 1);
  assert.equal(completed.length, 1);
  assert.deepEqual(summarizeImportResults(results), { added: 1, skipped: 0, failed: 0, unprocessed: 2 });
  assert.equal(results[1].item.french, "salut");
});

test("cancel before processing leaves every row resumable and makes no save", async () => {
  const results = await importVocabularyRecords({ records: [record()], existingItems: [],
    shouldCancel: () => true, saveNote: () => assert.fail("cancelled batch must not save") });
  assert.deepEqual(summarizeImportResults(results), { added: 0, skipped: 0, failed: 0, unprocessed: 1 });
});
