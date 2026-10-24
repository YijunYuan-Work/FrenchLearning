import assert from "node:assert/strict";
import test from "node:test";
import { mergeVocabularyAutofill } from "./editorAutofill.js";

const current = {
  category: "vocabulary", french: "bonjour", english: "old meaning", notes: "old note", tags: "old tag",
  confidence: 3, partOfSpeech: "verb", gender: "", conjugation: { je: "manual form" }, adjectiveForms: {},
};
const result = {
  category: "vocabulary", word: "Bonjour", english: "hello", notes: "AI explanation", tags: ["greetings"],
  example: "Bonjour !", partOfSpeech: "interjection", ipa: "/bɔ̃.ʒuʁ/", gender: "",
};

test("explicit Auto-fill replaces generated fields without changing confidence", () => {
  const merged = mergeVocabularyAutofill(current, result, new Set());
  assert.equal(merged.french, "Bonjour");
  assert.equal(merged.english, "hello");
  assert.equal(merged.notes, "AI explanation");
  assert.equal(merged.tags, "greetings");
  assert.equal(merged.confidence, 3);
  assert.equal(merged.conjugation.je, "");
});

test("preserves fields manually edited or cleared during Auto-fill", () => {
  const edited = { ...current, english: "my translation", notes: "", tags: "my topic" };
  const merged = mergeVocabularyAutofill(edited, result, new Set(["english", "notes", "tags"]));
  assert.equal(merged.english, "my translation");
  assert.equal(merged.notes, "");
  assert.equal(merged.tags, "my topic");
  assert.equal(merged.example, "Bonjour !");
  assert.equal(merged.ipa, result.ipa);
});

test("preserves related morphology after manual word type or form edits", () => {
  for (const field of ["partOfSpeech", "gender", "conjugation", "adjectiveForms"]) {
    const merged = mergeVocabularyAutofill(current, result, new Set([field]));
    assert.equal(merged.partOfSpeech, "verb");
    assert.deepEqual(merged.conjugation, current.conjugation);
    assert.deepEqual(merged.adjectiveForms, current.adjectiveForms);
    assert.equal(merged.gender, current.gender);
    assert.equal(merged.english, "hello");
  }
});
