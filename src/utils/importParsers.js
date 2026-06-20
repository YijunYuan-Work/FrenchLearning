import { normalizeTags } from "./tags.js";

export function parseVocabularyText(text) {
  return text
    .split(";")
    .map((word) => word.trim())
    .filter(Boolean);
}

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
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
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
