import { FileText, Languages, Upload } from "lucide-react";
import { useMemo } from "react";
import { Metric } from "../components/Metric";
import { useLanguage } from "../i18n/LanguageContext";
import { parsePhraseCsv, parseVocabularyText } from "../utils/importParsers";

const importModes = [
  { value: "vocabulary", labelKey: "categoryVocabulary", label: "Vocabulary" },
  { value: "phrases", labelKey: "categoryPhrases", label: "Short phrases" },
];

export function ImportView({
  importJob,
  onCancelImport,
  onStartImport,
  onUpdateImportJob,
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
  } = importJob;

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
  const attentionResults = useMemo(
    () => results.filter((result) => result.status !== "added"),
    [results]
  );
  const isPhraseMode = importMode === "phrases";
  const fileAccept = isPhraseMode ? ".csv,text/csv" : ".txt,text/plain";
  const readyCopy = isPhraseMode
    ? t("importPhrasesReady", "{count} phrases ready to import.", {
        count: importItems.length,
      })
    : t("importReady", "{count} words ready to import.", {
        count: importItems.length,
      });

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    onUpdateImportJob({
      error: "",
      fileName: file?.name ?? "",
      importItems: [],
      results: [],
    });

    if (!file) return;
    const lowerFileName = file.name.toLowerCase();
    if (isPhraseMode ? !lowerFileName.endsWith(".csv") : !lowerFileName.endsWith(".txt")) {
      onUpdateImportJob({
        error: isPhraseMode
          ? t("importCsvOnly", "Please choose a .csv file.")
          : t("importTxtOnly", "Please choose a .txt file."),
      });
      return;
    }

    try {
      const text = await file.text();
      const parsedItems = isPhraseMode
        ? parsePhraseCsv(text)
        : parseVocabularyText(text);
      onUpdateImportJob({ importItems: parsedItems });
      if (parsedItems.length === 0) {
        onUpdateImportJob({
          error: isPhraseMode
            ? t("importNoPhrases", "No phrase rows were found in this CSV.")
            : t("importNoWords", "No semicolon-separated words were found."),
        });
      }
    } catch {
      onUpdateImportJob({
        error: t("importReadFailed", "Could not read this file."),
      });
    }
  }

  function retryFailed() {
    const failedItems = failedResults.map((result) => result.item ?? result.word);
    if (failedItems.length === 0) return;
    onUpdateImportJob({ importItems: failedItems });
    onStartImport(failedItems);
  }

  function changeImportMode(nextMode) {
    if (isImporting || nextMode === importMode) return;
    onUpdateImportJob({
      error: "",
      fileName: "",
      importItems: [],
      importMode: nextMode,
      progress: { current: 0, total: 0 },
      results: [],
    });
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                : t("importTitle", "Import vocabulary from a text file")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {isPhraseMode
                ? t(
                    "importPhraseCopy",
                    "Upload a .csv file with French in the first column and translation in the second. An optional third column is saved as tags."
                  )
                : t(
                    "importCopy",
                    "Upload a .txt file with French vocabulary separated by semicolons. Each new word will use the same AI auto-fill flow as Add note."
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
                onClick={() => changeImportMode(mode.value)}
                type="button"
              >
                {t(mode.labelKey, mode.label)}
              </button>
            ))}
          </div>

          <label className="grid gap-2 rounded-xl border border-dashed border-frenchBlue/30 bg-sky/35 p-5 text-sm font-bold">
            <span className="flex items-center gap-2">
              <FileText size={18} className="text-frenchBlue" />
              {isPhraseMode ? t("importCsvFile", "CSV file") : t("importFile", "Text file")}
            </span>
            <input
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

          {importItems.length > 0 && (
            <div className="rounded-xl bg-sky p-3 text-sm font-semibold text-frenchBlue">
              {readyCopy}
            </div>
          )}

          {isPhraseMode && importItems.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px] gap-3 border-b border-line bg-sky/45 px-3 py-2 text-xs font-black uppercase text-slate-500">
                  <span>{t("french", "French")}</span>
                  <span>{t("translation", "Translation")}</span>
                  <span>{t("tags", "Tags")}</span>
                </div>
                {importItems.slice(0, 5).map((item, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px] gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0"
                    key={`${item.french}-${index}`}
                  >
                    <span className="min-w-0 truncate font-bold">{item.french || "-"}</span>
                    <span className="min-w-0 truncate text-slate-700">{item.english || "-"}</span>
                    <span className="min-w-0 truncate text-slate-500">
                      {(item.tags ?? []).join(", ") || "-"}
                    </span>
                  </div>
                ))}
                {importItems.length > 5 && (
                  <p className="bg-sky/25 px-3 py-2 text-xs font-bold text-slate-500">
                    {t("importPreviewMore", "Showing first 5 rows. {count} more will also be imported.", {
                      count: importItems.length - 5,
                    })}
                  </p>
                )}
              </div>
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
                onClick={onCancelImport}
                type="button"
              >
                {t("importCancel", "Cancel import")}
              </button>
            )}
            <button
              className="primary-action h-10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isImporting || importItems.length === 0}
              onClick={() => onStartImport()}
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
          <h3 className="font-black">
            {t("importNeedsAttention", "Items not imported")}
          </h3>
          {attentionResults.length === 0 ? (
            <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-bold text-sage">
              {t("importAllImported", "All parsed items were imported.")}
            </p>
          ) : (
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
