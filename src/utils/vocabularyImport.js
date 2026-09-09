import {
  createEmptyAdjectiveForms,
  createEmptyConjugation,
} from "../data/wordFields.js";

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
  shouldCancel,
  reasonFor = (code) => defaultReasons[code] ?? "Invalid row.",
}) {
  const results = [];
  const seenInFile = new Set();
  const knownWords = new Set(
    existingItems
      .filter((item) => item.category === "vocabulary")
      .map((item) => item.french.trim().toLocaleLowerCase("fr"))
  );

  for (const [index, record] of records.entries()) {
    if (shouldCancel?.()) break;

    const word = record.french?.trim() ?? "";
    const normalizedWord = word.toLocaleLowerCase("fr");
    onProgress?.(index + 1, records.length);

    if (record.validationIssues?.length > 0) {
      results.push({
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
      results.push({
        word,
        item: record,
        status: "skipped",
        reason: reasonFor("duplicateFile"),
      });
      continue;
    }
    seenInFile.add(normalizedWord);

    if (knownWords.has(normalizedWord)) {
      results.push({
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
      knownWords.add(savedItem.french.trim().toLocaleLowerCase("fr"));
      onSaved?.(savedItem);
      results.push({
        word,
        item: record,
        status: "added",
        reason: reasonFor("added"),
      });
    } catch (error) {
      results.push({
        word,
        item: record,
        status: "failed",
        reason: error.message,
      });
    }
  }

  return results;
}
