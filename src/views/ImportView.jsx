import { CheckCircle2, CircleAlert, Download, FileText, Info, LoaderCircle, Play, RotateCw } from "lucide-react";
import { useMemo } from "react";
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

  const hasRun = !["idle", "reading", "ready", "error"].includes(status);
  const hasResults = results.length > 0 && hasRun && !isImporting;
  const counters = [
    ["added", t("importAdded", "Added")], ["skipped", t("importSkipped", "Skipped")],
    ["failed", t("importFailed", "Failed")], ["unprocessed", t("importUnprocessed", "Unprocessed")],
  ];
  const columns = [
    ["sourceRow", t("importRow", "Row")], ["french", t("french", "French")],
    ["english", isPhraseMode ? t("translation", "Translation") : t("importChinese", "Chinese")],
    ...(!isPhraseMode ? [["partOfSpeech", t("wordType", "Part of speech")], ["ipa", t("ipa", "IPA")]] : []),
    ["tags", t("tags", "Tags")],
  ];
  const resultTitle = status === "cancelled" ? t("importCancelled", "Import cancelled.")
    : status === "incomplete" ? t("importIncomplete", "Import incomplete.")
      : summary.failed > 0 ? t("importCompletedFailures", "Import complete with failures.")
        : t("importCompleted", "Import complete.");

  return (
    <div className="bureau-import">
      <div className="import-intro">
        <p>{isPhraseMode
          ? t("importPhraseCopy", "Upload a .csv file with French in the first column and translation in the second. An optional third column is saved as tags.")
          : t("importCopy", "Upload a prepared vocabulary CSV. Its meanings and learning details are saved directly without AI or Wiktionary calls.")}</p>
        <div className="import-modes" role="group" aria-label={t("importMode", "Import mode")}>
          {importModes.map((mode) => <button className="focus-ring" aria-pressed={importMode === mode.value}
            disabled={isImporting} key={mode.value} onClick={() => { if (mode.value !== importMode) onChangeImportMode(mode.value); }} type="button">
            {t(mode.labelKey, mode.label)}
          </button>)}
        </div>
      </div>

      <ol className="import-steps">
        <li className={importItems.length ? "is-complete" : "is-active"}>
          <span className="import-numeral" aria-hidden="true">I.</span>
          <div className="import-format">
            <div><h3>{isPhraseMode ? t("importPhraseTitle", "Import short phrases from a CSV") : t("importVocabularyFormat", "Prepared vocabulary CSV")}</h3>
              <p>{isPhraseMode ? t("importPhraseColumns", "French, translation, and optional tags.")
                : t("importVocabularyRequired", "French, Chinese, and part of speech are required. Keep the remaining headers even when their cells are empty.")}</p></div>
            {!isPhraseMode && <button className="secondary-action" onClick={downloadVocabularyTemplate} type="button">
              <Download size={16} aria-hidden="true" />{t("importDownloadTemplate", "Download template")}
            </button>}
          </div>
        </li>
        <li className={importItems.length ? "is-complete" : "is-active"}>
          <span className="import-numeral" aria-hidden="true">II.</span>
          <div className="import-step-body">
            <h3>{t("importChooseFile", "Choose a CSV file")}</h3>
            <label className="import-file">
              <span className="import-file-icon"><FileText size={24} aria-hidden="true" /></span>
              <span className="import-file-detail"><span id="import-selected-file">{fileName || t("importCsvFile", "CSV file")}</span>
                <input key={importMode} accept={fileAccept} aria-label={t("importCsvFile", "CSV file")}
                  aria-describedby="import-selected-file"
                  disabled={isImporting} onChange={handleFileChange} type="file" /></span>
            </label>
            {status === "reading" && <p role="status"><LoaderCircle className="bureau-spin" size={16} aria-hidden="true" />{t("importReading", "Reading CSV...")}</p>}
            {isDemo && <p className="bureau-notice"><Info size={16} aria-hidden="true" />{t("demoImportDisabled", "Import is disabled in the public demo.")}</p>}
            {error && <div className="bureau-feedback is-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></div>}
          </div>
        </li>

        {importItems.length > 0 && <li className={hasRun ? "is-complete" : "is-active"}>
          <span className="import-numeral" aria-hidden="true">III.</span>
          <div className="import-step-body">
            <div className="bureau-section-line"><h3>{t("importPreview", "Preview")}</h3><p>{readyCopy}</p></div>
            <table className="import-preview">
              <caption className="sr-only">{t("importPreview", "Preview")}</caption>
              <thead><tr>{columns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
              <tbody>{importItems.slice(0, 5).map((item, index) => <tr key={index} className={item.validationIssues?.length ? "needs-attention" : ""}>
                {columns.map(([key, label]) => <td key={key} data-label={label} lang={key === "french" ? "fr" : undefined}>
                  <span>{key === "tags" ? (item.tags ?? []).join(", ") || "-" : key === "sourceRow" ? item.sourceRow ?? index + 2 : item[key] || "-"}</span>
                </td>)}
              </tr>)}</tbody>
            </table>
            {importItems.length > 5 && <p className="import-caption">{t("importPreviewCount", "Showing the first 5 of {count} rows.", { count: importItems.length })}</p>}
          </div>
        </li>}

        {hasRun && <li className="is-active">
          <span className="import-numeral" aria-hidden="true">IV.</span>
          <div className="import-step-body">
            <div className="bureau-section-line"><h3>{isImporting ? t("importWorking", "Importing...") : t("importRun", "Import")}</h3>
              {hasRun && <p role={isImporting ? "status" : undefined}>{isImporting && status === "cancelling" && <span>{t("importCancelling", "Cancelling after the current row finishes...")} </span>}
                {t("importRunProgress", "Processed {current} of {total} rows in this run.", { current: progress.current, total: progress.total })}</p>}
            </div>
            {hasRun && <>
              <div className="import-progress" role="progressbar" aria-label={t("importRun", "Import")} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.current}>
                <span style={{ width: `${progress.total ? Math.min(100, progress.current / progress.total * 100) : 0}%` }} />
              </div>
              <dl className="import-counters">
                <div><dt>{isPhraseMode ? t("importParsedPhrases", "Parsed phrases") : t("importParsed", "Parsed words")}</dt><dd>{importItems.length}</dd></div>
                {counters.map(([key, label]) => <div className={`is-${key}`} key={key}><dt>{label}</dt><dd>{summary[key]}</dd></div>)}
              </dl>
            </>}
          </div>
        </li>}

        {hasResults && <li className={summary.failed || summary.unprocessed ? "is-active" : "is-complete"}>
          <span className="import-numeral" aria-hidden="true">V.</span>
          <div className="import-step-body">
            <h3 className={`import-result-title ${summary.failed || summary.unprocessed ? "is-warning" : ""}`}>
              {summary.failed || summary.unprocessed ? <CircleAlert size={26} aria-hidden="true" /> : <CheckCircle2 size={26} aria-hidden="true" />}
              {resultTitle}
            </h3>
            <p role="status">{t("importBatchSummary", "Batch: {total}. Added: {added}. Skipped: {skipped}. Failed: {failed}. Unprocessed: {unprocessed}.", { total: importItems.length, ...summary })}</p>
            {summary.added === importItems.length && status === "completed" && <p className="import-all-added">{t("importAllImported", "All parsed items were imported.")}</p>}
            {attentionResults.length > 0 && <div className="import-attention">
              <h4>{t("importNeedsAttention", "Items not imported")}</h4>
              {attentionResults.map((result, index) => <div className="import-result-row" key={index}>
                <span className="import-source">{result.item?.sourceRow && t("importSourceRow", "Source row {row}", { row: result.item.sourceRow })}</span>
                <span className="import-result-word" lang="fr">{result.word}</span>
                <p>{result.reason}</p>
                <span className={`import-status is-${result.status}`}>{t(`importStatus_${result.status}`, result.status)}</span>
              </div>)}
            </div>}
          </div>
        </li>}
      </ol>
      <div className="import-actions">
        {isImporting && <button className="secondary-action" disabled={status === "cancelling"} onClick={onCancelImport} type="button">{t("importCancel", "Cancel import")}</button>}
        {!isImporting && summary.unprocessed > 0 && ["cancelled", "incomplete"].includes(status) && <button className="primary-action" disabled={isDemo} onClick={() => onStartImport("remaining")} type="button"><Play size={16} aria-hidden="true" />{t("importResume", "Resume unprocessed rows")}</button>}
        {failedResults.length > 0 && <button className="secondary-action" disabled={isDemo || isImporting} onClick={() => onStartImport("failed")} type="button"><RotateCw size={16} aria-hidden="true" />{t("importRetryFailed", "Retry failed only")}</button>}
        {(status === "ready" || isImporting || importItems.length === 0) && <button className="primary-action" disabled={isDemo || isImporting || status !== "ready" || importItems.length === 0} onClick={() => onStartImport()} type="button">
          {isImporting && <LoaderCircle size={16} className="bureau-spin" aria-hidden="true" />}
          {isImporting ? t("importWorking", "Importing...") : t("importStart", "Start import")}
        </button>}
      </div>
    </div>
  );
}
