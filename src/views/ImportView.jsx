import { FileText, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Metric } from "../components/Metric";
import { useLanguage } from "../i18n/LanguageContext";

function parseVocabularyText(text) {
  return text
    .split(";")
    .map((word) => word.trim())
    .filter(Boolean);
}

export function ImportView({ onImportVocabulary }) {
  const { t } = useLanguage();
  const [fileName, setFileName] = useState("");
  const [words, setWords] = useState([]);
  const [results, setResults] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const cancelImportRef = useRef(false);

  const summary = useMemo(
    () => ({
      added: results.filter((result) => result.status === "added").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
    }),
    [results]
  );
  const failedResults = useMemo(
    () => results.filter((result) => result.status === "failed"),
    [results]
  );

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setError("");
    setResults([]);
    setWords([]);
    setFileName(file?.name ?? "");

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError(t("importTxtOnly", "Please choose a .txt file."));
      return;
    }

    try {
      const text = await file.text();
      const parsedWords = parseVocabularyText(text);
      setWords(parsedWords);
      if (parsedWords.length === 0) {
        setError(t("importNoWords", "No semicolon-separated words were found."));
      }
    } catch {
      setError(t("importReadFailed", "Could not read this text file."));
    }
  }

  async function startImport(nextWords = words) {
    cancelImportRef.current = false;
    setIsImporting(true);
    setError("");
    setResults([]);
    setProgress({ current: 0, total: nextWords.length });

    try {
      const importResults = await onImportVocabulary(
        nextWords,
        (current, total) => {
          setProgress({ current, total });
        },
        () => cancelImportRef.current
      );
      setResults(importResults);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setIsImporting(false);
    }
  }

  function cancelImport() {
    cancelImportRef.current = true;
  }

  function retryFailed() {
    const failedWords = failedResults.map((result) => result.word);
    if (failedWords.length === 0) return;
    setWords(failedWords);
    startImport(failedWords);
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("importParsed", "Parsed words")} value={words.length} />
        <Metric label={t("importAdded", "Added")} value={summary.added} tone="green" />
        <Metric label={t("importSkipped", "Skipped")} value={summary.skipped} tone="blue" />
        <Metric label={t("importFailed", "Failed")} value={summary.failed} tone="red" />
      </div>

      <section className="app-card mt-5 p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-frenchBlue text-white">
            <Upload size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-frenchRed">
              {t("categoryImport", "Import")}
            </p>
            <h3 className="text-xl font-black">
              {t("importTitle", "Import vocabulary from a text file")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t(
                "importCopy",
                "Upload a .txt file with French vocabulary separated by semicolons. Each new word will use the same AI auto-fill flow as Add note."
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 rounded-xl border border-dashed border-frenchBlue/30 bg-sky/35 p-5 text-sm font-bold">
            <span className="flex items-center gap-2">
              <FileText size={18} className="text-frenchBlue" />
              {t("importFile", "Text file")}
            </span>
            <input
              accept=".txt,text/plain"
              className="focus-ring rounded-lg border border-line bg-white px-3 py-2 font-normal shadow-sm"
              disabled={isImporting}
              onChange={handleFileChange}
              type="file"
            />
            {fileName && (
              <span className="text-xs font-normal text-slate-500">{fileName}</span>
            )}
          </label>

          {words.length > 0 && (
            <div className="rounded-xl bg-sky p-3 text-sm font-semibold text-frenchBlue">
              {t("importReady", "{count} words ready to import.", {
                count: words.length,
              })}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-blush p-3 text-sm font-bold text-frenchRed">
              {error}
            </div>
          )}

          {isImporting && (
            <div className="rounded-xl bg-sky p-3 text-sm font-bold text-frenchBlue">
              {t("importProgress", "Importing {current} of {total}...", {
                current: progress.current,
                total: progress.total,
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {isImporting && (
              <button
                className="secondary-action h-10"
                onClick={cancelImport}
                type="button"
              >
                {t("importCancel", "Cancel import")}
              </button>
            )}
            <button
              className="primary-action h-10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isImporting || words.length === 0}
              onClick={() => startImport()}
              type="button"
            >
              {isImporting
                ? t("importWorking", "Importing...")
                : t("importStart", "Start import")}
            </button>
          </div>
        </div>
      </section>

      {results.length > 0 && (
        <section className="app-card mt-5 p-4">
          <h3 className="font-black">{t("importFailures", "Failed imports")}</h3>
          {failedResults.length === 0 ? (
            <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-bold text-sage">
              {t("importNoFailures", "No failed imports.")}
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {failedResults.map((result, index) => (
                <div
                  className="rounded-xl border border-line bg-white p-3 text-sm shadow-sm"
                  key={`${result.word}-${index}`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-bold">{result.word}</p>
                    <span className="w-fit rounded-lg bg-blush px-2 py-1 text-xs font-bold text-frenchRed">
                      {t("importStatus_failed", "failed")}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{result.reason}</p>
                </div>
              ))}
            </div>
          )}
          {failedResults.length > 0 && (
            <button
              className="secondary-action mt-3 h-10"
              disabled={isImporting}
              onClick={retryFailed}
              type="button"
            >
              {t("importRetryFailed", "Retry failed only")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
