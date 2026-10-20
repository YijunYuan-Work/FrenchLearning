import { useEffect, useRef, useState } from "react";
import { createEmptyWordDetails } from "../data/wordFields";
import { importVocabularyRecords } from "../utils/vocabularyImport";
import { parsePhraseCsv, parseVocabularyCsv } from "../utils/importParsers";
import { createImportResults, includeUnprocessedResults, summarizeImportResults } from "../utils/importResults";
import { getTodayKey } from "../utils/quiz";

const emptyImportJob = {
  error: "",
  fileName: "",
  importItems: [],
  importMode: "vocabulary",
  isImporting: false,
  progress: { current: 0, total: 0 },
  results: [],
  status: "idle",
  goalMarkedDay: "",
};

export function useImportJob({
  createImportedNote,
  isDemo,
  isCurrentAccount,
  items,
  onNotesAdded,
  t,
  user,
}) {
  const [importJob, setImportJob] = useState(emptyImportJob);
  const stateRef = useRef(emptyImportJob);
  const activeJobRef = useRef(null);
  const fileReadRef = useRef(null);

  useEffect(() => {
    setImportJob(emptyImportJob);
    stateRef.current = emptyImportJob;
    return () => {
      if (activeJobRef.current) activeJobRef.current.cancelled = true;
      activeJobRef.current = null;
      fileReadRef.current = null;
    };
  }, [isDemo, user?.id]);

  function updateImportJob(patch) {
    if (!isCurrentAccount()) return;
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setImportJob(next);
  }

  async function selectImportFile(file) {
    if (!isCurrentAccount() || activeJobRef.current) return;
    const read = {};
    fileReadRef.current = read;
    const mode = stateRef.current.importMode;
    updateImportJob({ ...emptyImportJob, importMode: mode, fileName: file?.name ?? "", status: file ? "reading" : "idle" });
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      updateImportJob({ error: t("importCsvOnly", "Please choose a .csv file."), status: "error" });
      return;
    }
    const ownsRead = () => isCurrentAccount() && fileReadRef.current === read;
    try {
      const text = await file.text();
      if (!ownsRead()) return;
      const records = mode === "phrases" ? parsePhraseCsv(text) : parseVocabularyCsv(text);
      updateImportJob({ importItems: records, results: createImportResults(records), status: records.length ? "ready" : "error",
        error: records.length ? "" : mode === "phrases"
          ? t("importNoPhrases", "No phrase rows were found in this CSV.")
          : t("importNoWords", "No vocabulary rows were found in this CSV.") });
    } catch (error) {
      if (!ownsRead()) return;
      let message = t("importReadFailed", "Could not read this CSV file.");
      if (error.code === "VOCABULARY_CSV_MISSING_HEADERS") {
        message = t("importMissingHeaders", "Missing required CSV headers: {headers}", { headers: error.missingHeaders.join(", ") });
      } else if (error.code === "CSV_STRUCTURE_ERROR") {
        message = t(`importCsv_${error.reason}`, error.detail, error);
      }
      if (error.sourceRow) message = t("importCsvLocation", "CSV row {row}, column {column}: {detail}",
        { row: error.sourceRow, column: error.column, detail: message });
      updateImportJob({ error: message, importItems: [], results: [], status: "error" });
    }
  }

  function changeImportMode(mode) {
    if (!isCurrentAccount() || activeJobRef.current || !["vocabulary", "phrases"].includes(mode)) return;
    fileReadRef.current = null;
    updateImportJob({ ...emptyImportJob, importMode: mode });
  }

  async function importVocabularyRows(rows, onResult, shouldCancel) {
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
      onResult,
      shouldCancel,
      reasonFor,
    });
  }

  async function importPhraseRows(rows, onResult, shouldCancel) {
    const results = [];
    function recordResult(result) {
      results.push(result);
      onResult?.(result, results.length - 1);
    }
    const seenInFile = new Set();
    const knownPhrases = new Set(
      items
        .filter((item) => item.category === "phrases")
        .map((item) => item.french.trim().toLocaleLowerCase("fr"))
    );

    for (const row of rows) {
      if (shouldCancel?.()) break;

      const french = row.french.trim();
      const english = row.english.trim();
      const normalizedFrench = french.toLocaleLowerCase("fr");

      if (!french || !english) {
        recordResult({
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
        recordResult({
          word: french,
          item: row,
          status: "skipped",
          reason: t("importReasonDuplicateFile", "Duplicate in this file."),
        });
        continue;
      }
      seenInFile.add(normalizedFrench);

      if (knownPhrases.has(normalizedFrench)) {
        recordResult({
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
        recordResult({
          word: french,
          item: row,
          status: "added",
          reason: t("importReasonAdded", "Added successfully."),
        });
      } catch (error) {
        recordResult({
          word: french,
          item: row,
          status: "failed",
          reason: error.message,
        });
      }
    }

    return includeUnprocessedResults(rows, results);
  }

  async function startImportJob(recovery = "remaining") {
    const batch = stateRef.current;
    if (!user || !isCurrentAccount() || activeJobRef.current || !["ready", "cancelled", "incomplete", "completed"].includes(batch.status)) return;

    if (isDemo) {
      updateImportJob({
        error: t("demoImportDisabled", "Import is disabled in the public demo."),
      });
      return;
    }

    const wantedStatus = recovery === "failed" ? "failed" : "unprocessed";
    const indices = batch.results.flatMap((result, index) => result.status === wantedStatus ? [index] : []);
    if (!indices.length) return;
    const nextItems = indices.map((index) => batch.importItems[index]);
    const mode = batch.importMode;
    const job = { cancelled: false };
    activeJobRef.current = job;
    const ownsJob = () => isCurrentAccount() && activeJobRef.current === job;
    updateImportJob({
      error: "",
      isImporting: true,
      status: "running",
      progress: { current: 0, total: nextItems.length },
    });

    try {
      const importHandler =
        mode === "phrases" ? importPhraseRows : importVocabularyRows;
      await importHandler(
        nextItems,
        (result, index) => {
          if (!ownsJob()) return;
          const results = [...stateRef.current.results];
          results[indices[index]] = result;
          updateImportJob({ results, progress: { current: index + 1, total: nextItems.length } });
          const today = getTodayKey();
          if (result.status === "added" && stateRef.current.goalMarkedDay !== today) {
            updateImportJob({ goalMarkedDay: today });
            onNotesAdded();
          }
        },
        () => job.cancelled || !ownsJob()
      );

      if (!ownsJob()) return;
      const summary = summarizeImportResults(stateRef.current.results);
      updateImportJob({ status: job.cancelled ? "cancelled" : summary.unprocessed > 0 ? "incomplete" : "completed" });
    } catch (error) {
      if (ownsJob()) updateImportJob({ error: error.message, status: job.cancelled ? "cancelled" : "incomplete" });
    } finally {
      if (ownsJob()) {
        updateImportJob({ isImporting: false });
        activeJobRef.current = null;
      }
    }
  }

  function cancelImportJob() {
    if (!isCurrentAccount() || !activeJobRef.current) return;
    activeJobRef.current.cancelled = true;
    updateImportJob({ status: "cancelling" });
  }

  return {
    cancelImportJob,
    importJob,
    startImportJob,
    selectImportFile,
    changeImportMode,
  };
}
