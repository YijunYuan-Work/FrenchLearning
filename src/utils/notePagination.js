export const NOTES_PAGE_SIZE = 1000;

export async function collectPaginatedRows(fetchPage, pageSize = NOTES_PAGE_SIZE) {
  const rows = [];
  let from = 0;

  while (true) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }

    from += pageSize;
  }
}
