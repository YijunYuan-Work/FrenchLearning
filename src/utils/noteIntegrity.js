import { createEmptyAdjectiveForms, createEmptyConjugation, createEmptyWordDetails, genderOptions, partOfSpeechOptions } from "../data/wordFields.js";
import { isRichTextEmpty, richTextDisplayHtml } from "./richText.js";

const noteCategories = new Set(["vocabulary", "phrases", "grammar", "pronunciation"]);
const partsOfSpeech = new Set(partOfSpeechOptions.map((option) => option.value));
const genders = new Set(genderOptions.map((option) => option.value));
const textFields = ["french", "english", "example", "notes", "ipa", "lastReviewed"];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasText = (value) => typeof value === "string" && Boolean(value.replace(/\p{Cf}/gu, "").trim());

export function noteTitleKey(value) {
  return typeof value === "string" ? value.trim().normalize("NFC").toLocaleLowerCase("fr") : "";
}

function invalid(field, message) {
  const error = new Error(message);
  Object.assign(error, { code: "NOTE_INVALID", field });
  throw error;
}

function normalizeForms(value, empty, field) {
  if (!isObject(value) || Object.entries(value).some(([key, text]) => !Object.hasOwn(empty, key) || typeof text !== "string")) {
    invalid(field, `Check the ${field === "conjugation" ? "conjugation" : "adjective forms"}. Each supported form must be text.`);
  }
  return { ...empty, ...value };
}

// Partial writes validate only their owned columns; full writes enforce the
// category contract. Neither path coerces arbitrary objects to learner text.
export function normalizeNoteInput(input, { partial = false, category = input?.category, tagText = false } = {}) {
  if (!isObject(input)) invalid("note", "The note is invalid. Reopen it and try again.");
  const next = { ...input };
  if ((!partial || Object.hasOwn(input, "category")) && !noteCategories.has(input.category)) invalid("category", "Choose a supported note category.");
  for (const field of textFields) {
    if (partial && !Object.hasOwn(input, field)) continue;
    const value = input[field] === undefined ? "" : input[field];
    if (typeof value !== "string") invalid(field, "Note text fields must contain text.");
    next[field] = field === "french" ? value.trim().normalize("NFC") : field === "english" ? value.trim() : value;
  }
  if ((!partial || Object.hasOwn(input, "french")) && !hasText(next.french)) invalid("french", "Enter a French word, phrase, or title, not just spaces.");
  if (category !== "grammar" && (!partial || Object.hasOwn(input, "english")) && !hasText(next.english)) invalid("english", "Enter a meaning or translation, not just spaces.");
  if (!partial || Object.hasOwn(input, "confidence")) {
    const value = input.confidence === undefined ? 1 : input.confidence;
    if ((typeof value !== "number" && typeof value !== "string") || !/^[1-4]$/.test(String(value))) invalid("confidence", "Choose a confidence level from 1 to 4.");
    next.confidence = Number(value);
  }
  if (!partial || Object.hasOwn(input, "tags")) {
    const tags = tagText && typeof input.tags === "string" ? input.tags.split(",") : input.tags === undefined ? [] : input.tags;
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) invalid("tags", "Tags must be a list of text labels.");
    next.tags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  }
  for (const [field, values] of [["partOfSpeech", partsOfSpeech], ["gender", genders]]) {
    if (partial && !Object.hasOwn(input, field)) continue;
    const value = input[field] === undefined ? "" : input[field];
    if (typeof value !== "string" || !values.has(value.trim().toLowerCase())) invalid(field, field === "gender" ? "Choose a supported noun gender or Unknown." : "Choose a supported word type or leave it unselected.");
    next[field] = value.trim().toLowerCase();
  }
  for (const [field, empty] of [["conjugation", createEmptyConjugation()], ["adjectiveForms", createEmptyAdjectiveForms()]]) {
    if (!partial || Object.hasOwn(input, field)) next[field] = normalizeForms(input[field] === undefined ? {} : input[field], empty, field);
  }
  if (category === "grammar" && (!partial || Object.hasOwn(input, "notes"))) {
    next.notes = richTextDisplayHtml(next.notes);
    if (isRichTextEmpty(next.notes)) invalid("grammarNotes", "Enter the grammar rule or explanation, not just empty formatting.");
  }
  if (!partial && ["grammar", "phrases"].includes(category)) {
    Object.assign(next, createEmptyWordDetails(), { example: "" });
    if (category === "grammar") next.english = "";
    else next.notes = "";
  }
  return next;
}

export function assertNoDuplicateNote(note, items, exceptId = note.id) {
  if (items.some((item) => item.id !== exceptId && item.category === note.category && noteTitleKey(item.french) === noteTitleKey(note.french))) {
    const error = new Error(`"${note.french}" already exists in this category. Edit the existing note instead.`);
    Object.assign(error, { code: "NOTE_DUPLICATE", field: "duplicate" });
    throw error;
  }
}

export function normalizeStoredNotes(rows) {
  const notes = [];
  let warningCount = 0;
  for (const row of rows) {
    if (!isObject(row) || typeof row.id !== "string" || !row.id.trim() || !noteCategories.has(row.category) || !hasText(row.french)) {
      warningCount += 1;
      continue;
    }
    let warned = false;
    const text = (value, fallback = "") => {
      if (value == null) return fallback;
      if (typeof value === "string") return value;
      warned = true;
      return fallback;
    };
    const enumValue = (value, choices) => {
      if (value == null) return "";
      if (typeof value === "string" && choices.has(value.trim().toLowerCase())) return value.trim().toLowerCase();
      warned = true;
      return "";
    };
    const forms = (value, empty) => {
      if (value == null) return empty;
      if (!isObject(value)) { warned = true; return empty; }
      const result = { ...empty };
      for (const [key, entry] of Object.entries(value)) {
        // Preserve the older demo/import pronoun spellings on read.
        const canonicalKey = key === "il" ? "il/elle" : key === "ils" ? "ils/elles" : key;
        if (Object.hasOwn(result, canonicalKey) && typeof entry === "string") result[canonicalKey] = entry;
        else warned = true;
      }
      return result;
    };
    let tags = row.tags ?? [];
    if (!Array.isArray(tags)) { warned = true; tags = typeof tags === "string" ? tags.split(",") : []; }
    if (tags.some((tag) => typeof tag !== "string")) warned = true;
    tags = [...new Set(tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))];
    const numericConfidence = typeof row.confidence === "number" || typeof row.confidence === "string" || row.confidence == null;
    const confidence = numericConfidence ? Number(row.confidence ?? 1) : Number.NaN;
    const validConfidence = Number.isInteger(confidence) && confidence >= 1 && confidence <= 4;
    if (!validConfidence) warned = true;
    const note = {
      id: row.id, category: row.category, french: row.french.trim().normalize("NFC"),
      english: text(row.english).trim(), example: text(row.example), notes: text(row.notes), tags,
      confidence: validConfidence ? confidence : 1,
      partOfSpeech: enumValue(row.part_of_speech, partsOfSpeech), ipa: text(row.ipa), gender: enumValue(row.gender, genders),
      conjugation: forms(row.conjugation, createEmptyConjugation()), adjectiveForms: forms(row.adjective_forms, createEmptyAdjectiveForms()),
      lastReviewed: text(row.last_reviewed, "Not reviewed"), createdAt: text(row.created_at),
    };
    if (row.category !== "grammar" && !hasText(note.english)) {
      warningCount += 1;
      continue;
    }
    if (row.category === "grammar") {
      try { note.notes = richTextDisplayHtml(note.notes); }
      catch { warningCount += 1; continue; }
    }
    notes.push(note);
    if (warned) warningCount += 1;
  }
  return { notes, warningCount };
}
