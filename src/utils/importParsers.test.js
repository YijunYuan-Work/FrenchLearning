import assert from "node:assert/strict";
import test from "node:test";
import { parsePhraseCsv, parseVocabularyText } from "./importParsers.js";

test("vocabulary import parses semicolon-separated words", () => {
  assert.deepEqual(parseVocabularyText("bonjour; fromage ; ; parler;"), [
    "bonjour",
    "fromage",
    "parler",
  ]);
});

test("phrase import reads French and translation columns with a header", () => {
  const csv = [
    "French,English,Usage",
    "Bonjour !,Hello!,Formal / neutral greeting",
    "Salut !,Hi!,Informal greeting",
  ].join("\n");

  assert.deepEqual(parsePhraseCsv(csv), [
    {
      french: "Bonjour !",
      english: "Hello!",
      tags: ["Formal / neutral greeting"],
    },
    {
      french: "Salut !",
      english: "Hi!",
      tags: ["Informal greeting"],
    },
  ]);
});

test("phrase import supports quoted commas and doubled quotes", () => {
  const csv =
    'French,English,Usage\n"Oui, bien sûr !","Yes, of course!","polite, daily"\n"Il dit ""bonjour"".","He says ""hello"".",speech';

  assert.deepEqual(parsePhraseCsv(csv), [
    {
      french: "Oui, bien sûr !",
      english: "Yes, of course!",
      tags: ["polite", "daily"],
    },
    {
      french: 'Il dit "bonjour".',
      english: 'He says "hello".',
      tags: ["speech"],
    },
  ]);
});
