import { Download, FileText, Languages, Upload } from "lucide-react";
import { useMemo } from "react";
import { Metric } from "../components/Metric";
import { useLanguage } from "../i18n/LanguageContext";
import { VOCABULARY_CSV_HEADERS } from "../utils/importParsers";
import { summarizeImportResults } from "../utils/importResults";

const importModes = [
  { value: "vocabulary", labelKey: "categoryVocabulary", label: "Vocabulary" },
  { value: "phrases", labelKey: "categoryPhrases", label: "Short phrases" },
];

export function ImportView({
  importJob,
  isDemo,
  onCancelImport,
  onStartImport,
  onSelectImportFile,
  onChangeImportMode,
}) {
  const { t } = useLanguage();
  const {
    error,
    fileName,
    importItems,
    importMode,
    isImporting,
    progress,
    results,
    status,
  } = importJob;

  const summary = useMemo(
    () => summarizeImportResults(results),
    [results]
  );
  const failedResults = useMemo(
    () => results.filter((result) => result.status === "failed"),
    [results]
  );
  const attentionResults = useMemo(
    () => results.filter((result) => ["failed", "skipped"].includes(result.status)),
    [results]
  );
  const isPhraseMode = importMode === "phrases";
  const fileAccept = ".csv,text/csv";
  const readyCopy = isPhraseMode
    ? t("importPhrasesReady", "{count} phrases ready to import.", {
        count: importItems.length,
      })
    : t("importReady", "{count} words ready to import.", {
        count: importItems.length,
      });

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    onSelectImportFile(file);
  }

  function downloadVocabularyTemplate() {
    const csv = `${VOCABULARY_CSV_HEADERS.join(",")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "french-desk-vocabulary-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label={
            isPhraseMode
              ? t("importParsedPhrases", "Parsed phrases")
              : t("importParsed", "Parsed words")
          }
          value={importItems.length}
        />
        <Metric label={t("importAdded", "Added")} value={summary.added} tone="green" />
        <Metric label={t("importSkipped", "Skipped")} value={summary.skipped} tone="blue" />
        <Metric label={t("importFailed", "Failed")} value={summary.failed} tone="red" />
        <Metric label={t("importUnprocessed", "Unprocessed")} value={summary.unprocessed} />
      </div>

      <section className="app-card mt-5 p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-frenchBlue text-white">
            {isPhraseMode ? <Languages size={20} /> : <Upload size={20} />}
          </div>
          <div>
            <p className="text-sm font-bold text-frenchRed">
              {t("categoryImport", "Import")}
            </p>
            <h3 className="text-xl font-black">
              {isPhraseMode
                ? t("importPhraseTitle", "Import short phrases from a CSV")
                : t("importTitle", "Import vocabulary from a CSV")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {isPhraseMode
                ? t(
                    "importPhraseCopy",
                    "Upload a .csv file with French in the first column and translation in the second. An optional third column is saved as tags."
                  )
                : t(
                    "importCopy",
                    "Upload a prepared vocabulary CSV. Its meanings and learning details are saved directly without AI or Wiktionary calls."
                  )}
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2 rounded-xl bg-sky/40 p-2 sm:grid-cols-2">
            {importModes.map((mode) => (
              <button
                className={`focus-ring h-10 rounded-lg text-sm font-black transition ${
                  importMode === mode.value
                    ? "bg-frenchBlue text-white shadow-soft"
                    : "bg-white text-slate-700 hover:text-frenchBlue"
                }`}
                disabled={isImporting}
                key={mode.value}
                onClick={() => { if (mode.value !== importMode) onChangeImportMode(mode.value); }}
                type="button"
              >
                {t(mode.labelKey, mode.label)}
              </button>
            ))}
          </div>

          {!isPhraseMode && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-sky/35 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black">
                  {t("importVocabularyFormat", "Prepared vocabulary CSV")}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {t(
                    "importVocabularyRequired",
                    "French, Chinese, and part of speech are required. Keep the remaining headers even when their cells are empty."
                  )}
                </p>
              </div>
              <button
                className="secondary-action h-10 shrink-0"
                onClick={downloadVocabularyTemplate}
                type="button"
              >
                <Download size={16} />
                {t("importDownloadTemplate", "Download template")}
              </button>
            </div>
          )}

          <label className="grid gap-2 rounded-xl border border-dashed border-frenchBlue/30 bg-sky/35 p-5 text-sm font-bold">
            <span className="flex items-center gap-2">
              <FileText size={18} className="text-frenchBlue" />
              {t("importCsvFile", "CSV file")}
            </span>
            <input
              key={importMode}
              accept={fileAccept}
              className="focus-ring rounded-lg border border-line bg-white px-3 py-2 font-normal shadow-sm"
              disabled={isImporting}
              onChange={handleFileChange}
              type="file"
            />
            {fileName && (
              <span className="text-xs font-normal text-slate-500">{fileName}</span>
            )}
          </label>

          {status === "reading" && <p role="status">{t("importReading", "Reading CSV...")}</p>}
          {isDemo && <p className="text-sm text-slate-600">{t("demoImportDisabled", "Import is disabled in the public demo.")}</p>}
          {status === "ready" && importItems.length > 0 && (
            <div className="rounded-xl bg-sky p-3 text-sm font-semibold text-frenchBlue">
              {readyCopy}
            </div>
          )}

          {importItems.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
              <div className={isPhraseMode ? "min-w-[720px]" : "min-w-[900px]"}>
                <div
                  className={`grid gap-3 border-b border-line bg-sky/45 px-3 py-2 text-xs font-black uppercase text-slate-500 ${
                    isPhraseMode
                      ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]"
                      : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px_minmax(160px,0.7fr)]"
                  }`}
                >
                  <span>{t("french", "French")}</span>
                  <span>
                    {isPhraseMode
                      ? t("translation", "Translation")
                      : t("importChinese", "Chinese")}
                  </span>
                  {isPhraseMode ? (
                    <span>{t("tags", "Tags")}</span>
                  ) : (
                    <>
                      <span>{t("wordType", "Part of speech")}</span>
                      <span>{t("ipa", "IPA")}</span>
                      <span>{t("tags", "Tags")}</span>
                    </>
                  )}
                </div>
                {importItems.slice(0, 5).map((item, index) => (
                  <div
                    className={`grid gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0 ${
                      isPhraseMode
                        ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]"
                        : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px_minmax(160px,0.7fr)]"
                    } ${item.validationIssues?.length ? "bg-blush/40" : ""}`}
                    key={`${item.french}-${index}`}
                  >
                    <span className="min-w-0 truncate font-bold">{item.french || "-"}</span>
                    <span className="min-w-0 truncate text-slate-700">{item.english || "-"}</span>
                    {!isPhraseMode && (
                      <>
                        <span className="min-w-0 truncate text-slate-600">
                          {item.partOfSpeech || "-"}
                        </span>
                        <span className="min-w-0 truncate text-slate-600">
                          {item.ipa || "-"}
                        </span>
                      </>
                    )}
                    <span className="min-w-0 truncate text-slate-500">
                      {(item.tags ?? []).join(", ") || "-"}
                    </span>
                  </div>
                ))}
                {importItems.length > 5 && (
                  <p className="bg-sky/25 px-3 py-2 text-xs font-bold text-slate-500">
                    {t("importPreviewCount", "Showing the first 5 of {count} rows.", {
                      count: importItems.length,
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-blush p-3 text-sm font-bold text-frenchRed" role="alert">
              {error}
            </div>
          )}

          {isImporting && (
            <div className="rounded-xl bg-sky p-3 text-sm font-bold text-frenchBlue" role="status">
              {status === "cancelling" && <p>{t("importCancelling", "Cancelling after the current row finishes...")}</p>}
              {t("importRunProgress", "Processed {current} of {total} rows in this run.", {
                current: progress.current,
                total: progress.total,
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {isImporting && (
              <button
                className="secondary-action h-10"
                disabled={status === "cancelling"}
                onClick={onCancelImport}
                type="button"
              >
                {t("importCancel", "Cancel import")}
              </button>
            )}
            {!isImporting && summary.unprocessed > 0 && ["cancelled", "incomplete"].includes(status) && (
              <button className="primary-action h-10" disabled={isDemo} onClick={() => onStartImport("remaining")} type="button">
                {t("importResume", "Resume unprocessed rows")}
              </button>
            )}
            {failedResults.length > 0 && (
              <button className="secondary-action h-10" disabled={isDemo || isImporting} onClick={() => onStartImport("failed")} type="button">
                {t("importRetryFailed", "Retry failed only")}
              </button>
            )}
            {(status === "ready" || isImporting || importItems.length === 0) && <button
              className="primary-action h-10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDemo || isImporting || status !== "ready" || importItems.length === 0}
              onClick={() => onStartImport()}
              type="button"
            >
              {isImporting
                ? t("importWorking", "Importing...")
                : t("importStart", "Start import")}
            </button>}
          </div>
        </div>
      </section>

      {results.length > 0 && !["ready", "reading"].includes(status) && (
        <section className="app-card mt-5 p-4">
          <h3 className="mb-3 font-black">{t("importResults", "Import results")}</h3>
          {!isImporting && <div className="mb-3 text-sm font-bold" role="status">
            <p>{status === "cancelled" ? t("importCancelled", "Import cancelled.")
              : status === "incomplete" ? t("importIncomplete", "Import incomplete.")
                : summary.failed > 0 ? t("importCompletedFailures", "Import complete with failures.")
                  : t("importCompleted", "Import complete.")}</p>
            <p>{t("importBatchSummary", "Batch: {total}. Added: {added}. Skipped: {skipped}. Failed: {failed}. Unprocessed: {unprocessed}.", { total: importItems.length, ...summary })}</p>
          </div>}
          {attentionResults.length > 0 && <h4 className="font-bold">
            {t("importNeedsAttention", "Items not imported")}
          </h4>}
          {summary.added === importItems.length && status === "completed" ? (
            <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-bold text-sage">
              {t("importAllImported", "All parsed items were imported.")}
            </p>
          ) : attentionResults.length > 0 && (
            <div className="mt-3 grid gap-2">
              {attentionResults.map((result, index) => (
                <div
                  className="rounded-xl border border-line bg-white p-3 text-sm shadow-sm"
                  key={`${result.word}-${index}`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-bold">{result.word}</p>
                    <span
                      className={`w-fit rounded-lg px-2 py-1 text-xs font-bold ${
                        result.status === "failed"
                          ? "bg-blush text-frenchRed"
                          : "bg-sky text-frenchBlue"
                      }`}
                    >
                      {t(`importStatus_${result.status}`, result.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{result.reason}</p>
                  {result.item?.sourceRow && <p className="mt-1 text-xs text-slate-500">{t("importSourceRow", "Source row {row}", { row: result.item.sourceRow })}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
