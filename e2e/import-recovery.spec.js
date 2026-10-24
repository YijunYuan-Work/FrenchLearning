import { expect, test } from "@playwright/test";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { importCsv, importRow, uploadCsv, expectBatch, noteCreates } from "./fixtures/imports.js";
import { VOCABULARY_CSV_HEADERS } from "../src/utils/importParsers.js";
import { aiRequests } from "./helpers/backend-state.js";
import { capturePage } from "./helpers/screenshots.js";

test("shows Import previews, progress and recovery states for both CSV modes", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Import");
  await capturePage(page, testInfo, "import-initial", true);
  for (const mode of ["vocabulary", "phrases"]) {
    if (mode === "phrases") await page.getByRole("main").getByRole("button", { name: "Short phrases", exact: true }).click();
    const firstWord = `${mode}-premier`;
    const badWord = `${mode}-reessayer`;
    const thirdWord = `${mode}-troisieme`;
    await capturePage(page, testInfo, `import-${mode}-mode`, true);
    await uploadCsv(page, 'french,translation\n"not closed,broken', "malformed.csv");
    await expect(page.getByRole("alert")).toBeVisible();
    await capturePage(page, testInfo, `import-${mode}-malformed`, true);
    await uploadCsv(page, importCsv(mode, [firstWord, badWord, thirdWord, `${mode}-quatre`, `${mode}-cinq`, firstWord].map((word) => importRow(word, { tags: "A1;école,日常" }))));
    await expect(page.locator(".import-preview tbody tr")).toHaveCount(5);
    await expect(page.locator(".import-preview tbody tr").first()).toContainText("A1, école, 日常");
    await capturePage(page, testInfo, `import-${mode}-preview`, true);
    backend.failedCreates.add(badWord);
    const first = backend.hold(`${ids.A}:notes:POST:${firstWord}`);
    await go(page, "Start import");
    await backend.waitFor(`${ids.A}:notes:POST:${firstWord}`);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "6");
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    await expect(page.getByRole("main").getByRole("button", { name: "Short phrases", exact: true })).toBeDisabled();
    await capturePage(page, testInfo, `import-${mode}-running`, true);
    if (mode === "vocabulary") {
      await go(page, "简体中文");
      await page.setViewportSize({ width: 370, height: 736 });
      await page.getByRole("progressbar").scrollIntoViewIfNeeded();
      await capturePage(page, testInfo, "import-mobile-running-zh", true);
      await page.setViewportSize({ width: 1280, height: 900 });
      await go(page, "English");
    }
    await go(page, "Cancel import");
    await capturePage(page, testInfo, `import-${mode}-cancelling`, true);
    first.resolve();
    await expectBatch(page, 1, 0, 0, 5);
    await capturePage(page, testInfo, `import-${mode}-partial`, true);
    const third = backend.hold(`${ids.A}:notes:POST:${thirdWord}`);
    await go(page, "Resume unprocessed rows");
    await backend.waitFor(`${ids.A}:notes:POST:${thirdWord}`);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
    await capturePage(page, testInfo, `import-${mode}-resume`, true);
    third.resolve();
    await expectBatch(page, 4, 1, 1, 0);
    await capturePage(page, testInfo, `import-${mode}-failures`, true);
    if (mode === "vocabulary") {
      await page.setViewportSize({ width: 370, height: 736 });
      await page.locator(".import-result-title").scrollIntoViewIfNeeded();
      await capturePage(page, testInfo, "import-mobile-results-en", true);
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    const retry = backend.hold(`${ids.A}:notes:POST:${badWord}`);
    backend.failedCreates.delete(badWord);
    await go(page, "Retry failed only");
    await backend.waitFor(`${ids.A}:notes:POST:${badWord}`);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "1");
    await capturePage(page, testInfo, `import-${mode}-retry`, true);
    retry.resolve();
    await expectBatch(page, 5, 1, 0, 0);
    await capturePage(page, testInfo, `import-${mode}-complete`, true);
    expect(noteCreates(backend).filter((entry) => entry.body.french === firstWord)).toHaveLength(1);
    expect(backend.accounts[ids.A].notes.filter((note) => note.category === mode && note.french.startsWith(mode))).toHaveLength(5);
  }
});

for (const mode of ["vocabulary", "phrases"]) {
  test(`skips ${mode} Import duplicates differing by case, whitespace or accents`, async ({ page, context, baseURL }) => {
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
  test(`preserves the ${mode} Import batch across repeated cancel and resume`, async ({ page, context, baseURL }) => {
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

  test(`retries only failed ${mode} Import rows and preserves failures after cancellation`, async ({ page, context, baseURL }) => {
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

  test(`rejects malformed ${mode} CSV before writes and clears the previous upload`, async ({ page, context, baseURL }) => {
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

  test(`preserves multiline Unicode ${mode} CSV data and semantic-error row numbers`, async ({ page, context, baseURL }) => {
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

test("ignores an old CSV read after a newer invalid upload or Import mode change", async ({ page, context, baseURL }) => {
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

test("allows Demo Import previews without saving either CSV mode", async ({ page, context, baseURL }) => {
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

test("completes the new day's Add Note goal when Import resumes overnight", async ({ page, context, baseURL }) => {
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
