import assert from "node:assert/strict";
import test from "node:test";
import { assertNoDuplicateNote, normalizeNoteInput, normalizeStoredNotes, noteTitleKey } from "./noteIntegrity.js";

const note = (changes = {}) => ({ category: "vocabulary", french: "école", english: "学校", confidence: 1, ...changes });

test("note saves reject whitespace-only required text and invalid text shapes", () => {
  for (const category of ["vocabulary", "phrases", "pronunciation", "grammar"]) {
    assert.throws(() => normalizeNoteInput(note({ category, french: " \t\n " })), { field: "french" });
    if (category !== "grammar") assert.throws(() => normalizeNoteInput(note({ category, english: " \u00a0 " })), { field: "english" });
  }
  for (const value of [null, [], {}, 12, false]) {
    assert.throws(() => normalizeNoteInput(note({ french: value })));
    assert.throws(() => normalizeNoteInput(note({ english: value })));
  }
});

test("category contracts preserve meaningful content and intentionally clear hidden grammar/phrase fields", () => {
  const grammar = normalizeNoteInput(note({ category: "grammar", english: "", notes: "<p><b>un</b> <i>chat</i></p>", example: "hidden", partOfSpeech: "noun", gender: "feminine" }));
  assert.equal(grammar.notes, "<p><strong>un</strong> <em>chat</em></p>");
  assert.equal(grammar.english, "");
  assert.equal(grammar.example, "");
  assert.equal(grammar.partOfSpeech, "");
  for (const notes of ["", "   ", "<p><br></p>", "<p>&nbsp;&#160;&#x20;</p>", "<script>alert(1)</script>"]) {
    assert.throws(() => normalizeNoteInput(note({ category: "grammar", notes })), { field: "grammarNotes" });
  }
  const phrase = normalizeNoteInput(note({ category: "phrases", french: "  Ça va ?  ", english: "  How are you?  ", notes: "hidden", example: "hidden" }));
  assert.equal(phrase.french, "Ça va ?");
  assert.equal(phrase.english, "How are you?");
  assert.equal(phrase.notes, "");
  const vocab = normalizeNoteInput(note({ french: " e\u0301cole ", notes: "un\nchat  et chien", tags: [" school ", "school", "工作"], confidence: "3" }));
  assert.equal(vocab.french, "école");
  assert.equal(vocab.notes, "un\nchat  et chien");
  assert.deepEqual(vocab.tags, ["school", "工作"]);
  assert.equal(vocab.confidence, 3);
});

test("note metadata rejects malformed confidence, enums, tags and form objects", () => {
  for (const confidence of [0, 5, 1.5, Number.NaN, null, [], {}, true, ""]) assert.throws(() => normalizeNoteInput(note({ confidence })), { field: "confidence" });
  for (const category of ["today", "review", "import", null, {}, "unknown"]) assert.throws(() => normalizeNoteInput(note({ category })), { field: "category" });
  for (const tags of ["school", null, {}, ["school", 1], [[]]]) assert.throws(() => normalizeNoteInput(note({ tags })), { field: "tags" });
  assert.deepEqual(normalizeNoteInput(note({ tags: " school,work,school " }), { tagText: true }).tags, ["school", "work"]);
  assert.throws(() => normalizeNoteInput(note({ partOfSpeech: "unsupported" })), { field: "partOfSpeech" });
  assert.throws(() => normalizeNoteInput(note({ gender: "neutral" })), { field: "gender" });
  for (const value of [null, [], "forms", { unknown: "x" }, { je: {} }]) assert.throws(() => normalizeNoteInput(note({ conjugation: value })), { field: "conjugation" });
  assert.throws(() => normalizeNoteInput(note({ adjectiveForms: { feminine: [] } })), { field: "adjectiveForms" });
  assert.equal(normalizeNoteInput(note({ partOfSpeech: "noun", gender: "" })).gender, "");
  assert.equal(normalizeNoteInput(note()).partOfSpeech, "");
});

test("partial note updates own only their fields and preserve confidence mutation semantics", () => {
  assert.deepEqual(normalizeNoteInput({ confidence: 3, lastReviewed: "Today" }, { partial: true }), { confidence: 3, lastReviewed: "Today" });
  assert.throws(() => normalizeNoteInput({ french: " " }, { partial: true }), { field: "french" });
  assert.throws(() => normalizeNoteInput({ english: " " }, { partial: true, category: "vocabulary" }), { field: "english" });
  assert.deepEqual(normalizeNoteInput({ english: "" }, { partial: true, category: "grammar" }), { english: "" });
});

test("duplicate identity is category-scoped, trimmed, NFC and case-insensitive", () => {
  const existing = [{ id: "one", ...note({ french: "  ÉCOLE " }) }];
  assert.equal(noteTitleKey(" e\u0301cole "), noteTitleKey("ÉCOLE"));
  assert.throws(() => assertNoDuplicateNote(note({ french: " e\u0301cole " }), existing), { code: "NOTE_DUPLICATE" });
  assert.doesNotThrow(() => assertNoDuplicateNote(note({ id: "one" }), existing));
  assert.doesNotThrow(() => assertNoDuplicateNote(note({ category: "phrases" }), existing));
});

test("malformed legacy rows cannot crash a notebook and are never mutated by normalization", () => {
  const rows = [
    null, { id: "bad-category", ...note({ category: "unknown" }) }, { id: "bad-title", ...note({ french: {} }) },
    { id: "valid", ...note(), tags: ["school", {}], confidence: { toString: null, valueOf: null }, part_of_speech: {}, gender: [], conjugation: { je: [], tu: "vas" }, adjective_forms: [] },
    { id: "bad-tags", ...note(), tags: {}, confidence: 99, english: "meaning" },
    { id: "missing-meaning", ...note({ english: {} }) },
    { id: "plain", ...note(), confidence: "4", tags: "school,work", notes: { unsafe: true } },
  ];
  const before = structuredClone(rows);
  const result = normalizeStoredNotes(rows);
  assert.deepEqual(result.notes.map((item) => item.id), ["valid", "bad-tags", "plain"]);
  assert.equal(result.warningCount, 7);
  assert.deepEqual(result.notes[0].tags, ["school"]);
  assert.equal(result.notes[0].confidence, 1);
  assert.equal(result.notes[0].conjugation.je, "");
  assert.equal(result.notes[0].conjugation.tu, "vas");
  assert.equal(result.notes[2].confidence, 4);
  assert.deepEqual(rows, before);
});
