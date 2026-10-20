export function createImportResults(records) {
  return records.map((item, index) => ({
    item,
    word: item.french?.trim() || `Row ${item.sourceRow ?? index + 2}`,
    status: "unprocessed",
    reason: "",
  }));
}

export function includeUnprocessedResults(records, results) {
  return [...results, ...createImportResults(records).slice(results.length)];
}

export function summarizeImportResults(results) {
  return results.reduce((summary, result) => {
    summary[result.status] += 1;
    return summary;
  }, { added: 0, skipped: 0, failed: 0, unprocessed: 0 });
}
