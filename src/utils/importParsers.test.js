import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePhraseCsv,
  parseVocabularyCsv,
  VOCABULARY_CSV_HEADERS,
} from "./importParsers.js";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function vocabularyCsv(rows, lineEnding = "\n", prefix = "") {
  return `${prefix}${[
    VOCABULARY_CSV_HEADERS.join(","),
    ...rows.map((values) =>
      VOCABULARY_CSV_HEADERS.map((header) => csvCell(values[header])).join(",")
    ),
  ].join(lineEnding)}`;
}

test("vocabulary CSV maps Chinese meaning and common fields", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([
      {
        french: "école",
        chinese: "学校",
        part_of_speech: "noun",
        gender: "feminine",
        ipa: "/e.kɔl/",
        tags: "school;daily",
        example: "Je vais à l'école.",
        notes: "A common noun.",
      },
    ])
  );

  assert.equal(record.english, "学校");
  assert.equal(record.gender, "feminine");
  assert.deepEqual(record.tags, ["school", "daily"]);
  assert.deepEqual(record.validationIssues, []);
});

test("vocabulary CSV accepts a UTF-8 BOM", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv(
      [{ french: "bonjour", chinese: "你好", part_of_speech: "interjection" }],
      "\n",
      "\uFEFF"
    )
  );
  assert.equal(record.french, "bonjour");
});

test("vocabulary CSV accepts CRLF line endings", () => {
  const records = parseVocabularyCsv(
    vocabularyCsv(
      [
        { french: "un", chinese: "一", part_of_speech: "numeral" },
        { french: "deux", chinese: "二", part_of_speech: "numeral" },
      ],
      "\r\n"
    )
  );
  assert.equal(records.length, 2);
});

test("vocabulary CSV preserves quoted commas, apostrophes, accents, and Chinese", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([
      {
        french: "s'émerveiller",
        chinese: "惊叹，感到惊奇",
        part_of_speech: "verb",
        example: "Elle dit, « C'est magnifique ! »",
      },
    ])
  );
  assert.equal(record.french, "s'émerveiller");
  assert.equal(record.english, "惊叹，感到惊奇");
  assert.equal(record.example, "Elle dit, « C'est magnifique ! »");
});

test("vocabulary CSV preserves doubled quotes", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([
      {
        french: "dire",
        chinese: "说",
        part_of_speech: "verb",
        notes: 'Often appears in "direct speech".',
      },
    ])
  );
  assert.equal(record.notes, 'Often appears in "direct speech".');
});

test("vocabulary CSV allows all optional cells to be empty", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([{ french: "vite", chinese: "快地", part_of_speech: "adverb" }])
  );
  assert.equal(record.ipa, "");
  assert.deepEqual(record.tags, []);
  assert.deepEqual(record.validationIssues, []);
});

test("vocabulary CSV maps verb conjugations only for verbs", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([
      {
        french: "parler",
        chinese: "说话",
        part_of_speech: "verb",
        gender: "feminine",
        conjugation_je: "parle",
        conjugation_tu: "parles",
        conjugation_il_elle: "parle",
        conjugation_nous: "parlons",
        conjugation_vous: "parlez",
        conjugation_ils_elles: "parlent",
        adjective_masculine: "ignored",
      },
    ])
  );
  assert.equal(record.gender, "");
  assert.deepEqual(record.conjugation, {
    je: "parle",
    tu: "parles",
    "il/elle": "parle",
    nous: "parlons",
    vous: "parlez",
    "ils/elles": "parlent",
  });
  assert.equal(record.adjectiveForms.masculine, "");
});

test("vocabulary CSV maps adjective forms only for adjectives", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([
      {
        french: "heureux",
        chinese: "快乐的",
        part_of_speech: "adjective",
        conjugation_je: "ignored",
        adjective_masculine: "heureux",
        adjective_feminine: "heureuse",
        adjective_masculine_plural: "heureux",
        adjective_feminine_plural: "heureuses",
      },
    ])
  );
  assert.deepEqual(record.adjectiveForms, {
    masculine: "heureux",
    feminine: "heureuse",
    masculinePlural: "heureux",
    femininePlural: "heureuses",
  });
  assert.equal(record.conjugation.je, "");
});

test("vocabulary CSV reports missing required row values", () => {
  const [record] = parseVocabularyCsv(vocabularyCsv([{ ipa: "/test/" }]));
  assert.deepEqual(
    record.validationIssues.map((issue) => issue.code),
    ["missingFrench", "missingChinese", "missingPartOfSpeech"]
  );
});

test("vocabulary CSV reports unsupported parts of speech", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([{ french: "test", chinese: "测试", part_of_speech: "phrase" }])
  );
  assert.deepEqual(record.validationIssues, [
    { code: "invalidPartOfSpeech", value: "phrase" },
  ]);
});

test("vocabulary CSV validates a supplied noun gender", () => {
  const [record] = parseVocabularyCsv(
    vocabularyCsv([
      { french: "livre", chinese: "书", part_of_speech: "noun", gender: "neutral" },
    ])
  );
  assert.deepEqual(record.validationIssues, [
    { code: "invalidGender", value: "neutral" },
  ]);
});

test("vocabulary CSV requires every exact header", () => {
  const headers = VOCABULARY_CSV_HEADERS.filter((header) => header !== "ipa");
  assert.throws(
    () => parseVocabularyCsv(headers.join(",")),
    (error) =>
      error.code === "VOCABULARY_CSV_MISSING_HEADERS" &&
      error.missingHeaders.includes("ipa")
  );
});

test("phrase import remains compatible with its header format", () => {
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
    { french: "Salut !", english: "Hi!", tags: ["Informal greeting"] },
  ]);
});

test("phrase import supports semicolon-separated tags", () => {
  const csv = [
    "french,translation,tags",
    "Je m'appelle...,我叫……,A1;Unit 1;Core;identity",
  ].join("\n");

  assert.deepEqual(parsePhraseCsv(csv), [
    {
      french: "Je m'appelle...",
      english: "我叫……",
      tags: ["A1", "Unit 1", "Core", "identity"],
    },
  ]);
});

test("phrase import still supports quoted commas and doubled quotes", () => {
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
