import {
  createEmptyAdjectiveForms,
  createEmptyConjugation,
  genderOptions,
  partOfSpeechOptions,
} from "../data/wordFields.js";
import { normalizeTags } from "./tags.js";

export const VOCABULARY_CSV_HEADERS = [
  "french",
  "chinese",
  "part_of_speech",
  "gender",
  "ipa",
  "tags",
  "example",
  "notes",
  "conjugation_je",
  "conjugation_tu",
  "conjugation_il_elle",
  "conjugation_nous",
  "conjugation_vous",
  "conjugation_ils_elles",
  "adjective_masculine",
  "adjective_feminine",
  "adjective_masculine_plural",
  "adjective_feminine_plural",
];

const validPartsOfSpeech = new Set(
  partOfSpeechOptions.map((option) => option.value).filter(Boolean)
);
const validGenders = new Set(
  genderOptions.map((option) => option.value).filter(Boolean)
);

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let isQuoted = false;
  const input = String(text).replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === '"') {
      if (isQuoted && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
      continue;
    }

    if (character === "," && !isQuoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function createHeaderError(missingHeaders) {
  const error = new Error(`Missing CSV headers: ${missingHeaders.join(", ")}`);
  error.code = "VOCABULARY_CSV_MISSING_HEADERS";
  error.missingHeaders = missingHeaders;
  return error;
}

function getCell(row, headerIndexes, header) {
  return row[headerIndexes.get(header)]?.trim() ?? "";
}

function validateVocabularyRow(record) {
  const issues = [];
  if (!record.french) issues.push({ code: "missingFrench" });
  if (!record.english) issues.push({ code: "missingChinese" });
  if (!record.partOfSpeech) {
    issues.push({ code: "missingPartOfSpeech" });
  } else if (!validPartsOfSpeech.has(record.partOfSpeech)) {
    issues.push({ code: "invalidPartOfSpeech", value: record.partOfSpeech });
  }
  if (
    record.partOfSpeech === "noun" &&
    record.suppliedGender &&
    !validGenders.has(record.suppliedGender)
  ) {
    issues.push({ code: "invalidGender", value: record.suppliedGender });
  }
  return issues;
}

function mapVocabularyRow(row, headerIndexes, sourceRow) {
  const partOfSpeech = getCell(row, headerIndexes, "part_of_speech").toLowerCase();
  const suppliedGender = getCell(row, headerIndexes, "gender").toLowerCase();
  const conjugation = createEmptyConjugation();
  const adjectiveForms = createEmptyAdjectiveForms();

  if (partOfSpeech === "verb") {
    conjugation.je = getCell(row, headerIndexes, "conjugation_je");
    conjugation.tu = getCell(row, headerIndexes, "conjugation_tu");
    conjugation["il/elle"] = getCell(row, headerIndexes, "conjugation_il_elle");
    conjugation.nous = getCell(row, headerIndexes, "conjugation_nous");
    conjugation.vous = getCell(row, headerIndexes, "conjugation_vous");
    conjugation["ils/elles"] = getCell(
      row,
      headerIndexes,
      "conjugation_ils_elles"
    );
  }

  if (partOfSpeech === "adjective") {
    adjectiveForms.masculine = getCell(row, headerIndexes, "adjective_masculine");
    adjectiveForms.feminine = getCell(row, headerIndexes, "adjective_feminine");
    adjectiveForms.masculinePlural = getCell(
      row,
      headerIndexes,
      "adjective_masculine_plural"
    );
    adjectiveForms.femininePlural = getCell(
      row,
      headerIndexes,
      "adjective_feminine_plural"
    );
  }

  const record = {
    french: getCell(row, headerIndexes, "french"),
    english: getCell(row, headerIndexes, "chinese"),
    partOfSpeech,
    gender: partOfSpeech === "noun" ? suppliedGender : "",
    ipa: getCell(row, headerIndexes, "ipa"),
    tags: normalizeTags(
      getCell(row, headerIndexes, "tags").replaceAll(";", ",")
    ),
    example: getCell(row, headerIndexes, "example"),
    notes: getCell(row, headerIndexes, "notes"),
    conjugation,
    adjectiveForms,
    sourceRow,
  };

  record.validationIssues = validateVocabularyRow({
    ...record,
    suppliedGender,
  });
  return record;
}

export function parseVocabularyCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw createHeaderError(VOCABULARY_CSV_HEADERS);

  const normalizedHeaders = rows[0].map((header) => header.trim().toLowerCase());
  const headerIndexes = new Map(
    normalizedHeaders.map((header, index) => [header, index])
  );
  const missingHeaders = VOCABULARY_CSV_HEADERS.filter(
    (header) => !headerIndexes.has(header)
  );
  if (missingHeaders.length > 0) throw createHeaderError(missingHeaders);

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => mapVocabularyRow(row, headerIndexes, index + 2));
}

function hasPhraseHeader(row) {
  const first = row[0]?.trim().toLowerCase();
  const second = row[1]?.trim().toLowerCase();
  return (
    first === "french" &&
    ["english", "translation", "meaning"].includes(second)
  );
}

export function parsePhraseCsv(text) {
  const rows = parseCsvRows(text);
  const dataRows = rows.length > 0 && hasPhraseHeader(rows[0]) ? rows.slice(1) : rows;

  return dataRows.map((row) => ({
    french: row[0]?.trim() ?? "",
    english: row[1]?.trim() ?? "",
    tags: normalizeTags(row[2] ?? ""),
  }));
}
