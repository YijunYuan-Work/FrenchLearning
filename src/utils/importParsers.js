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
  let state = "start";
  let line = 1;
  let sourceRow = 1;
  let quoteLine = 1;
  let hasRecord = false;
  const input = String(text).replace(/^\uFEFF/, "");

  function finishRow() {
    row.push(cell.trim());
    if (hasRecord) rows.push({ cells: row, sourceRow });
    row = [];
    cell = "";
    state = "start";
    hasRecord = false;
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (state === "quoted") {
      if (character === '"' && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        state = "closed";
      } else {
        cell += character;
        if (character === "\r") {
          if (nextCharacter === "\n") { cell += "\n"; index += 1; }
          line += 1;
        } else if (character === "\n") line += 1;
      }
      continue;
    }

    if (character === '"') {
      if (state !== "start") throw csvError("unexpectedQuote", line, row.length + 1);
      state = "quoted";
      quoteLine = line;
      hasRecord = true;
      cell = "";
      continue;
    }

    if (character === ",") {
      row.push(cell.trim());
      cell = "";
      state = "start";
      hasRecord = true;
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      finishRow();
      line += 1;
      sourceRow = line;
      continue;
    }

    if (state === "closed" && character !== " " && character !== "\t") {
      throw csvError("afterQuote", line, row.length + 1);
    }
    if (character.trim()) {
      hasRecord = true;
      if (state === "start") state = "unquoted";
    }
    cell += character;
  }

  if (state === "quoted") throw csvError("unmatchedQuote", quoteLine, row.length + 1);
  finishRow();
  return rows;
}

function csvError(reason, sourceRow, column, details = {}) {
  const messages = {
    unmatchedQuote: "Quoted field is not closed.",
    unexpectedQuote: "Unexpected quote in an unquoted field. Quote the entire field and double any literal quotes.",
    afterQuote: "Unexpected text after a closing quote. Use a comma or a new row.",
    duplicateHeader: `Duplicate or ambiguous header: "${details.header ?? ""}".`,
    unknownHeader: `Unexpected header: "${details.header ?? ""}".`,
    phraseHeader: "Expected French, Translation (or English/Meaning), and optional Tags (or Usage), in that order.",
    rowWidth: `Expected ${details.expected} columns but found ${details.actual}. Include empty cells and quote commas inside values.`,
  };
  const error = new Error(`CSV row ${sourceRow}, column ${column}: ${messages[reason]}`);
  Object.assign(error, { code: "CSV_STRUCTURE_ERROR", reason, sourceRow, column, detail: messages[reason], ...details });
  return error;
}

function validateHeaders(headers, allowed, sourceRow) {
  const seen = new Set();
  headers.forEach((header, index) => {
    if (seen.has(header)) throw csvError("duplicateHeader", sourceRow, index + 1, { header });
    if (!allowed.includes(header)) throw csvError("unknownHeader", sourceRow, index + 1, { header });
    seen.add(header);
  });
}

function validateRowWidth({ cells, sourceRow }, expected) {
  if (cells.length !== expected) throw csvError("rowWidth", sourceRow, Math.min(cells.length, expected) + 1,
    { expected, actual: cells.length });
}

function createHeaderError(missingHeaders, sourceRow = 1) {
  const error = new Error(`Missing CSV headers: ${missingHeaders.join(", ")}`);
  error.code = "VOCABULARY_CSV_MISSING_HEADERS";
  error.missingHeaders = missingHeaders;
  error.sourceRow = sourceRow;
  error.column = 1;
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

  const normalizedHeaders = rows[0].cells.map((header) => header.trim().toLowerCase());
  validateHeaders(normalizedHeaders, VOCABULARY_CSV_HEADERS, rows[0].sourceRow);
  const headerIndexes = new Map(
    normalizedHeaders.map((header, index) => [header, index])
  );
  const missingHeaders = VOCABULARY_CSV_HEADERS.filter(
    (header) => !headerIndexes.has(header)
  );
  if (missingHeaders.length > 0) throw createHeaderError(missingHeaders, rows[0].sourceRow);

  const dataRows = rows.slice(1);
  dataRows.forEach((row) => validateRowWidth(row, normalizedHeaders.length));
  return dataRows.map(({ cells, sourceRow }) => mapVocabularyRow(cells, headerIndexes, sourceRow));
}

export function parsePhraseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const aliases = new Map([["english", "translation"], ["meaning", "translation"], ["usage", "tags"]]);
  const headers = rows[0].cells.map((cell) => cell.trim().toLowerCase()).map((cell) => aliases.get(cell) ?? cell);
  const hasHeader = headers[0] === "french" || headers[0] === "translation" || headers[1] === "french";
  if (hasHeader) {
    validateHeaders(headers, ["french", "translation", "tags"], rows[0].sourceRow);
    const expected = ["french", "translation", "tags"].slice(0, headers.length);
    const invalidColumn = headers.findIndex((header, index) => header !== expected[index]);
    if (headers.length < 2 || invalidColumn !== -1) throw csvError("phraseHeader", rows[0].sourceRow, Math.max(0, invalidColumn) + 1);
  } else if (![2, 3].includes(rows[0].cells.length)) {
    throw csvError("rowWidth", rows[0].sourceRow, Math.min(rows[0].cells.length, 3) + 1, { expected: "2 or 3", actual: rows[0].cells.length });
  }
  const dataRows = hasHeader ? rows.slice(1) : rows;
  dataRows.forEach((row) => validateRowWidth(row, headers.length));

  return dataRows.map(({ cells: row, sourceRow }) => ({
    french: row[0]?.trim() ?? "",
    english: row[1]?.trim() ?? "",
    tags: normalizeTags((row[2] ?? "").replaceAll(";", ",")),
    sourceRow,
  }));
}
