import { useEffect, useRef, useState } from "react";
import { createEmptyWordDetails } from "../data/wordFields";
import { importVocabularyRecords } from "../utils/vocabularyImport";

const emptyImportJob = {
  error: "",
  fileName: "",
  importItems: [],
  importMode: "vocabulary",
  isImporting: false,
  progress: { current: 0, total: 0 },
  results: [],
};

export function useImportJob({
  createImportedNote,
  isDemo,
  items,
  onNotesAdded,
  t,
  user,
}) {
  const [importJob, setImportJob] = useState(emptyImportJob);
  const cancelImportRef = useRef(false);

  useEffect(() => {
    cancelImportRef.current = true;
    setImportJob(emptyImportJob);
  }, [isDemo, user?.id]);

  function updateImportJob(patch) {
    setImportJob((current) => ({ ...current, ...patch }));
  }

  async function importVocabularyRows(rows, onProgress, shouldCancel) {
    const reasonFor = (code, value) => {
      const reasons = {
        added: t("importReasonAdded", "Added successfully."),
        duplicateFile: t("importReasonDuplicateFile", "Duplicate in this file."),
        duplicateExisting: t(
          "importReasonDuplicate",
          "Already exists in Vocabulary."
        ),
        missingFrench: t("importReasonMissingFrench", "French is required."),
        missingChinese: t(
          "importReasonMissingChinese",
          "Chinese meaning is required."
        ),
        missingPartOfSpeech: t(
          "importReasonMissingPartOfSpeech",
          "Part of speech is required."
        ),
        invalidPartOfSpeech: t(
          "importReasonInvalidPartOfSpeech",
          'Unsupported part of speech: "{value}".',
          { value }
        ),
        invalidGender: t(
          "importReasonInvalidGender",
          'Unsupported noun gender: "{value}".',
          { value }
        ),
      };
      return reasons[code] ?? t("importReasonInvalidRow", "Invalid CSV row.");
    };

    return importVocabularyRecords({
      records: rows,
      existingItems: items,
      saveNote: createImportedNote,
      onProgress,
      shouldCancel,
      reasonFor,
    });
  }

  async function importPhraseRows(rows, onProgress, shouldCancel) {
    const results = [];
    const seenInFile = new Set();
    const knownPhrases = new Set(
      items
        .filter((item) => item.category === "phrases")
        .map((item) => item.french.trim().toLocaleLowerCase("fr"))
    );

    for (const [index, row] of rows.entries()) {
      if (shouldCancel?.()) break;

      const french = row.french.trim();
      const english = row.english.trim();
      const normalizedFrench = french.toLocaleLowerCase("fr");
      onProgress?.(index + 1, rows.length);

      if (!french || !english) {
        results.push({
          word: french || english || t("unknown", "Unknown"),
          item: row,
          status: "skipped",
          reason: t(
            "importReasonMissingPhraseColumns",
            "Missing French phrase or translation."
          ),
        });
        continue;
      }

      if (seenInFile.has(normalizedFrench)) {
        results.push({
          word: french,
          item: row,
          status: "skipped",
          reason: t("importReasonDuplicateFile", "Duplicate in this file."),
        });
        continue;
      }
      seenInFile.add(normalizedFrench);

      if (knownPhrases.has(normalizedFrench)) {
        results.push({
          word: french,
          item: row,
          status: "skipped",
          reason: t(
            "importReasonDuplicatePhrase",
            "Already exists in Short phrases."
          ),
        });
        continue;
      }

      try {
        const savedItem = await createImportedNote({
          category: "phrases",
          french,
          english,
          example: "",
          notes: "",
          tags: row.tags ?? [],
          confidence: 1,
          lastReviewed: "Not reviewed",
          ...createEmptyWordDetails(),
        });

        knownPhrases.add(savedItem.french.trim().toLocaleLowerCase("fr"));
        results.push({
          word: french,
          item: row,
          status: "added",
          reason: t("importReasonAdded", "Added successfully."),
        });
      } catch (error) {
        results.push({
          word: french,
          item: row,
          status: "failed",
          reason: error.message,
        });
      }
    }

    return results;
  }

  async function startImportJob(nextItems = importJob.importItems) {
    if (!user || importJob.isImporting || nextItems.length === 0) return;

    if (isDemo) {
      updateImportJob({
        error: t("demoImportDisabled", "Import is disabled in the public demo."),
      });
      return;
    }

    const mode = importJob.importMode;
    cancelImportRef.current = false;
    updateImportJob({
      error: "",
      importItems: nextItems,
      isImporting: true,
      progress: { current: 0, total: nextItems.length },
      results: [],
    });

    try {
      const importHandler =
        mode === "phrases" ? importPhraseRows : importVocabularyRows;
      const results = await importHandler(
        nextItems,
        (current, total) => {
          updateImportJob({ progress: { current, total } });
        },
        () => cancelImportRef.current
      );

      if (results.some((result) => result.status === "added")) {
        onNotesAdded();
      }
      updateImportJob({ results });
    } catch (error) {
      updateImportJob({ error: error.message });
    } finally {
      updateImportJob({ isImporting: false });
    }
  }

  function cancelImportJob() {
    cancelImportRef.current = true;
  }

  return {
    cancelImportJob,
    importJob,
    startImportJob,
    updateImportJob,
  };
}
