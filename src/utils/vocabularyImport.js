import {
  createEmptyAdjectiveForms,
  createEmptyConjugation,
} from "../data/wordFields.js";
import { includeUnprocessedResults } from "./importResults.js";
import { noteTitleKey } from "./noteIntegrity.js";

const defaultReasons = {
  added: "Added successfully.",
  duplicateFile: "Duplicate in this file.",
  duplicateExisting: "Already exists in Vocabulary.",
  invalidGender: "Gender must be masculine, feminine, or masculine or feminine.",
  invalidPartOfSpeech: "Part of speech is not supported.",
  missingChinese: "Chinese meaning is required.",
  missingFrench: "French is required.",
  missingPartOfSpeech: "Part of speech is required.",
};

export async function importVocabularyRecords({
  records,
  existingItems,
  saveNote,
  onSaved,
  onProgress,
  onResult,
  shouldCancel,
  reasonFor = (code) => defaultReasons[code] ?? "Invalid row.",
}) {
  const results = [];
  function recordResult(result) {
    results.push(result);
    onResult?.(result, results.length - 1);
  }
  const seenInFile = new Set();
  const knownWords = new Set(
    existingItems
      .filter((item) => item.category === "vocabulary")
      .map((item) => noteTitleKey(item.french))
  );

  for (const [index, record] of records.entries()) {
    if (shouldCancel?.()) break;

    const word = record.french?.trim() ?? "";
    const normalizedWord = noteTitleKey(word);
    onProgress?.(index + 1, records.length);

    if (record.validationIssues?.length > 0) {
      recordResult({
        word: word || `Row ${record.sourceRow ?? index + 2}`,
        item: record,
        status: "failed",
        reason: record.validationIssues
          .map((issue) => reasonFor(issue.code, issue.value))
          .join(" "),
      });
      continue;
    }

    if (seenInFile.has(normalizedWord)) {
      recordResult({
        word,
        item: record,
        status: "skipped",
        reason: reasonFor("duplicateFile"),
      });
      continue;
    }
    seenInFile.add(normalizedWord);

    if (knownWords.has(normalizedWord)) {
      recordResult({
        word,
        item: record,
        status: "skipped",
        reason: reasonFor("duplicateExisting"),
      });
      continue;
    }

    const nextItem = {
      category: "vocabulary",
      french: word,
      english: record.english.trim(),
      example: record.example ?? "",
      notes: record.notes ?? "",
      tags: record.tags ?? [],
      confidence: 1,
      partOfSpeech: record.partOfSpeech,
      ipa: record.ipa ?? "",
      gender: record.partOfSpeech === "noun" ? record.gender ?? "" : "",
      conjugation:
        record.partOfSpeech === "verb"
          ? record.conjugation
          : createEmptyConjugation(),
      adjectiveForms:
        record.partOfSpeech === "adjective"
          ? record.adjectiveForms
          : createEmptyAdjectiveForms(),
      lastReviewed: "Not reviewed",
    };

    try {
      const savedItem = await saveNote(nextItem);
      knownWords.add(noteTitleKey(savedItem.french));
      onSaved?.(savedItem);
      recordResult({
        word,
        item: record,
        status: "added",
        reason: reasonFor("added"),
      });
    } catch (error) {
      recordResult({
        word,
        item: record,
        status: "failed",
        reason: error.message,
      });
    }
  }

  return includeUnprocessedResults(records, results);
}
