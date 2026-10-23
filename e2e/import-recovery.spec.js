import { expect, test } from "@playwright/test";
import { VOCABULARY_CSV_HEADERS } from "../src/utils/importParsers.js";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { importCsv, importRow, uploadCsv, expectBatch, noteCreates } from "./fixtures/imports.js";
import { aiRequests } from "./helpers/backend-state.js";

for (const mode of ["vocabulary", "phrases"]) {
  test(`${mode} import rejects case, whitespace and decomposed-accent duplicates against saved notes`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    backend.accounts[ids.A].notes[0] = { ...backend.accounts[ids.A].notes[0], category: mode, french: " ÉCOLE " };
    await page.goto("/");
    await go(page, "Import");
    if (mode === "phrases") await go(page, "Short phrases");
    await uploadCsv(page, importCsv(mode, [" e\u0301cole ", "ÉCOLE", "nouveau"].map((french) => importRow(french))));
    await go(page, "Start import");
    await expectBatch(page, 1, 2, 0, 0);
    expect(noteCreates(backend).map((entry) => entry.body.french)).toEqual(["nouveau"]);
    expect(backend.accounts[ids.A].notes.filter((note) => note.category === mode)).toHaveLength(mode === "vocabulary" ? 4 : 2);
  });
}

for (const mode of ["vocabulary", "phrases"]) {
  test(`${mode} cancel and repeated resume preserve the original batch and never resubmit successes`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    if (mode === "phrases") backend.accounts[ids.A].notes.push({ ...backend.accounts[ids.A].notes[0], id: "A-existing-phrase", category: "phrases" });
    const rows = ["import-un", "import-deux", "import-trois", "import-quatre", "import-cinq", "IMPORT-UN", "A-word-1"].map((word) => importRow(word));
    const first = backend.hold(`${ids.A}:notes:POST:import-un`);
    await page.goto("/");
    await go(page, "Import");
    if (mode === "phrases") await go(page, "Short phrases");
    await uploadCsv(page, importCsv(mode, rows));
    await page.getByRole("button", { name: "Start import", exact: true }).evaluate((button) => { button.click(); button.click(); });
    await backend.waitFor(`${ids.A}:notes:POST:import-un`);
    expect(noteCreates(backend)).toHaveLength(1);
    await go(page, "Cancel import");
    await expect(page.getByText("Cancelling after the current row finishes...", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel import", exact: true })).toBeDisabled();
    await page.getByRole("navigation").getByRole("button", { name: "Vocabulary", exact: true }).click();
    await go(page, "Import");
    first.resolve();
    await expectBatch(page, 1, 0, 0, 6);
    await expect(page.getByText("Import cancelled.", { exact: true })).toBeVisible();
    await expect(page.getByText("All parsed items were imported.", { exact: true })).toHaveCount(0);
    const third = backend.hold(`${ids.A}:notes:POST:import-trois`);
    await go(page, "Resume unprocessed rows");
    await backend.waitFor(`${ids.A}:notes:POST:import-trois`);
    expect(backend.accounts[ids.A].notes.some((note) => note.french === "import-deux")).toBe(true);
    await go(page, "Cancel import");
    third.resolve();
    await expectBatch(page, 3, 0, 0, 4);
    await go(page, "Resume unprocessed rows");
    await expectBatch(page, 5, 2, 0, 0);
    await expect(page.getByText("Import complete.", { exact: true })).toBeVisible();
    expect(noteCreates(backend).map((entry) => entry.body.french)).toEqual(["import-un", "import-deux", "import-trois", "import-quatre", "import-cinq"]);
    expect(backend.accounts[ids.A].notes.filter((note) => note.french.startsWith("import-") && note.category === mode)).toHaveLength(5);
    expect(backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state" && entry.body?.add_note)).toHaveLength(1);
    expect(aiRequests(backend)).toEqual([]);
    await expect(page.getByRole("button", { name: "Resume unprocessed rows", exact: true })).toHaveCount(0);
  });

  test(`${mode} retries failed rows independently and retains untouched failures if retry is cancelled`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    backend.failedCreates.add("retry-deux");
    backend.failedCreates.add("retry-trois");
    const third = backend.hold(`${ids.A}:notes:POST:retry-trois`);
    await page.goto("/");
    await go(page, "Import");
    if (mode === "phrases") await go(page, "Short phrases");
    await uploadCsv(page, importCsv(mode, ["retry-un", "retry-deux", "retry-trois", "retry-quatre"].map((word) => importRow(word))));
    await go(page, "Start import");
    await backend.waitFor(`${ids.A}:notes:POST:retry-trois`);
    await go(page, "Cancel import");
    third.resolve();
    await expectBatch(page, 1, 0, 2, 1);
    const retry = backend.hold(`${ids.A}:notes:POST:retry-deux`);
    backend.failedCreates.clear();
    await go(page, "Retry failed only");
    await backend.waitFor(`${ids.A}:notes:POST:retry-deux`);
    await go(page, "Cancel import");
    retry.resolve();
    await expectBatch(page, 2, 0, 1, 1);
    await go(page, "Retry failed only");
    await expectBatch(page, 3, 0, 0, 1);
    await expect(page.getByText("Import incomplete.", { exact: true })).toBeVisible();
    expect(noteCreates(backend).some((entry) => entry.body.french === "retry-quatre")).toBe(false);
    await go(page, "Resume unprocessed rows");
    await expectBatch(page, 4, 0, 0, 0);
    await expect(page.getByText("All parsed items were imported.", { exact: true })).toBeVisible();
    expect(noteCreates(backend).map((entry) => entry.body.french)).toEqual(["retry-un", "retry-deux", "retry-trois", "retry-deux", "retry-trois", "retry-quatre"]);
    expect(backend.accounts[ids.A].notes.filter((note) => note.french.startsWith("retry-") && note.category === mode)).toHaveLength(4);
    expect(backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state" && entry.body?.add_note)).toHaveLength(1);
  });

  test(`${mode} rejects malformed structure before writes and clears previously uploaded rows`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    await page.goto("/");
    await go(page, "Import");
    if (mode === "phrases") await go(page, "Short phrases");
    const valid = importCsv(mode, [importRow("previous-file-word")]);
    await uploadCsv(page, valid, "valid.csv");
    await expect(page.getByText("previous-file-word", { exact: true })).toBeVisible();
    const header = mode === "vocabulary" ? VOCABULARY_CSV_HEADERS.join(",") : "french,translation,tags";
    for (const [index, malformed] of [
      `${valid}\n"not closed`, `${header}\nword`, `${valid},extra`,
      `${header},${mode === "vocabulary" ? "FRENCH" : "usage"}`,
    ].entries()) {
      await uploadCsv(page, malformed, `invalid-${index}.csv`);
      await expect(page.getByRole("alert")).toContainText(/CSV row \d+, column \d+:/);
      await expect(page.getByText("previous-file-word", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Start import", exact: true })).toBeDisabled();
      expect(noteCreates(backend)).toEqual([]);
    }
    await uploadCsv(page, valid, "fixed.csv");
    await go(page, "Start import");
    await expectBatch(page, 1, 0, 0, 0);
    expect(noteCreates(backend)).toHaveLength(1);
  });

  test(`${mode} supports quoted multiline Unicode data and retains physical rows for semantic failures`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await go(page, "Import");
    if (mode === "phrases") await go(page, "Short phrases");
    const text = importCsv(mode, [
      importRow("école,\r\nbonjour", { notes: '第一行\r\n第二行 "引用"', translation: "你好，\r\n世界！", tags: "school;A1,daily" }),
      importRow("invalid-semantic-row", { chinese: "", translation: "" }),
    ], "\r\n", "\uFEFF\r\n");
    await uploadCsv(page, text);
    await go(page, "Start import");
    await expectBatch(page, 1, mode === "phrases" ? 1 : 0, mode === "vocabulary" ? 1 : 0, 0);
    const saved = backend.accounts[ids.A].notes.find((note) => note.french.startsWith("école,"));
    expect(saved.tags).toEqual(["school", "A1", "daily"]);
    expect(saved.french).toBe("école,\r\nbonjour");
    if (mode === "phrases") expect(saved.english).toBe("你好，\r\n世界！");
    else expect(saved.notes).toBe('第一行\r\n第二行 "引用"');
    await expect(page.getByText("Source row 6", { exact: true })).toBeVisible();
    expect(noteCreates(backend)).toHaveLength(1);
    expect(aiRequests(backend)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("a delayed old file read cannot restore rows after a newer malformed upload or a mode change", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Import");
  await go(page, "Short phrases");
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function () {
      const text = await original.call(this);
      if (this.name === "slow.csv") await new Promise((resolve) => { globalThis.releaseImportRead = resolve; });
      return text;
    };
  });
  await uploadCsv(page, "french,translation\nstale-file-word,old meaning", "slow.csv");
  await page.waitForFunction(() => typeof globalThis.releaseImportRead === "function");
  await uploadCsv(page, 'french,translation\n"not closed,broken', "broken.csv");
  await expect(page.getByRole("alert")).toContainText("Quoted field is not closed.");
  await page.evaluate(() => globalThis.releaseImportRead());
  await expect(page.getByText("stale-file-word", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start import", exact: true })).toBeDisabled();
  await uploadCsv(page, "french,translation\nstale-file-word,old meaning", "slow.csv");
  await expect(page.getByText("Reading CSV...", { exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Vocabulary", exact: true }).click();
  await page.evaluate(() => globalThis.releaseImportRead());
  await expect(page.getByText("stale-file-word", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start import", exact: true })).toBeDisabled();
  expect(noteCreates(backend)).toEqual([]);
});

test("demo import preview cannot start a write in either mode", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const original = structuredClone(backend.accounts);
  await page.goto("/#/demo");
  await go(page, "Import");
  for (const mode of ["vocabulary", "phrases"]) {
    if (mode === "phrases") await go(page, "Short phrases");
    await uploadCsv(page, importCsv(mode, [importRow("demo-upload")]));
    await expect(page.getByText("demo-upload", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start import", exact: true })).toBeDisabled();
    await expect(page.getByText("Import is disabled in the public demo.", { exact: true })).toBeVisible();
  }
  expect(backend.accounts).toEqual(original);
  expect(backend.ledger).toEqual([]);
});

test("resuming an import on the next local day earns its Add Note goal without per-row goal writes", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { sessionLifetimeSeconds: 7 * 24 * 3600 });
  await page.clock.install({ time: new Date(`${backend.date}T12:00:00`) });
  const first = backend.hold(`${ids.A}:notes:POST:overnight-first`);
  await page.goto("/");
  await go(page, "Import");
  await go(page, "Short phrases");
  await uploadCsv(page, importCsv("phrases", ["overnight-first", "overnight-second", "overnight-third"].map((word) => importRow(word))));
  await go(page, "Start import");
  await backend.waitFor(`${ids.A}:notes:POST:overnight-first`);
  await go(page, "Cancel import");
  first.resolve();
  await expectBatch(page, 1, 0, 0, 2);
  await expect.poll(() => backend.accounts[ids.A].daily.add_note).toBe(true);
  const nextDay = new Date(`${backend.date}T12:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  backend.accounts[ids.A].daily = { add_note: false, study: false, quiz: false, quiz_state: null, study_state: null };
  await page.clock.setSystemTime(nextDay);
  await page.evaluate(() => globalThis.dispatchEvent(new Event("pageshow")));
  await go(page, "Today");
  await expect(page.getByRole("status", { name: "0 of 3 tasks done", exact: true })).toBeVisible();
  await go(page, "Import");
  await go(page, "Resume unprocessed rows");
  await expectBatch(page, 3, 0, 0, 0);
  await expect.poll(() => backend.accounts[ids.A].daily.add_note).toBe(true);
  const goals = backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state" && entry.body?.add_note);
  expect(goals).toHaveLength(2);
  expect(new Set(goals.map((entry) => entry.body.date)).size).toBe(2);
  expect(noteCreates(backend)).toHaveLength(3);
});
