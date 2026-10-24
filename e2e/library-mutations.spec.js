import { expect, test } from "@playwright/test";
import { libraryRows } from "./fixtures/library-data.js";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { notePatches, storedNote } from "./helpers/backend-state.js";
import { answerQuiz } from "./helpers/quiz.js";

const noteDeletes = (backend, owner = ids.A) => backend.writes(owner).filter((entry) => entry.resource === "notes" && entry.method === "DELETE");

test("preserves cross-page Note selection through library filters, sorting and deletion", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].notes = libraryRows(ids.A);
  await page.goto("/");
  await go(page, "Vocabulary");
  const entries = page.getByRole("article");
  await expect(entries).toHaveCount(10);
  await expect(entries.first().getByRole("heading")).toHaveText("apprendre");
  await page.getByRole("button", { name: /^Noun/ }).click();
  await expect(entries).toHaveCount(5);
  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("radio", { name: "Date added (newest)", exact: true }).check();
  await expect(entries.first().getByRole("heading")).toHaveText("le wifi");
  await expect(page.locator(".library-letter")).toHaveCount(0);
  await page.getByRole("radio", { name: "Alphabetical (A-Z)", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select apprendre", exact: true }).check();
  await go(page, "Next");
  await page.getByRole("checkbox", { name: "Select vachement", exact: true }).check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  const search = page.getByRole("textbox", { name: "Search notes", exact: true });
  await search.fill("xylophone");
  await expect(page.getByText("No notes match this view.", { exact: true })).toBeVisible();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Delete 2 selected notes?");
  expect(noteDeletes(backend)).toEqual([]);
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete selected", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Clear search & filters", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter by tag", exact: true }).selectOption("work");
  await expect(entries).toHaveCount(3);
  await search.fill("/by.ʁo/");
  await expect(entries).toHaveCount(1);
  await expect(entries.getByRole("heading")).toHaveText("le bureau");
  await deleteSelection(page);
  await expect.poll(() => backend.accounts[ids.A].notes.filter((item) => item.category === "vocabulary").length).toBe(12);
  expect(noteDeletes(backend).map((item) => item.noteId).sort()).toEqual(["vocabulary-13", "vocabulary-2"]);
  const noun = libraryRows(ids.A)[0];
  backend.accounts[ids.A].notes = ["École", "œuf", "Œuvre", "organiser"].map((french, index) => ({ ...noun, id: `accent-${index}`, french, part_of_speech: "", adjective_forms: { feminine: "legacy form" } }));
  await page.reload();
  await go(page, "Vocabulary");
  await expect(entries).toHaveCount(4);
  await expect(page.locator(".library-letter > span")).toHaveText(["E", "O"]);
  await expect(entries.getByRole("heading")).toHaveText(["École", "œuf", "Œuvre", "organiser"]);
  await expect(entries.first().locator(".library-word-meta")).toContainText("masculine");
  await expect(entries.first().locator(".library-forms")).toContainText("legacy form");
});

test("preserves grammar HTML through reader navigation and confidence changes", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].notes = libraryRows(ids.A);
  await page.goto("/");
  await go(page, "Grammar");
  await page.locator(".library-contents-link").filter({ hasText: "Le subjonctif" }).click();
  const reader = page.locator(".library-grammar-reader");
  await expect(reader.getByRole("heading", { name: "Le subjonctif après « il faut que »", exact: true })).toBeFocused();
  await expect(reader.locator(".rich-text-content ol > li")).toHaveCount(3);
  await expect(reader.locator(".rich-text-content strong").first()).toHaveText("Il faut que");
  const original = storedNote(backend, "grammar-2").notes;
  await reader.getByRole("button", { name: "I know this", exact: true }).click();
  await expect.poll(() => storedNote(backend, "grammar-2").confidence).toBe(2);
  expect(storedNote(backend, "grammar-2").notes).toBe(original);
  expect(notePatches(backend, "grammar-2")[0].body).toEqual({ confidence: 2, last_reviewed: "Today" });
  await page.getByRole("textbox", { name: "Search notes", exact: true }).fill("pronoms");
  await expect(reader.getByRole("heading", { name: "En ou y ?", exact: true })).toBeVisible();
  await go(page, "Delete En ou y ?");
  await expect(reader.getByRole("heading", { name: "Les pronoms relatifs : qui, que, dont, où", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search notes", exact: true }).fill("not-a-rule");
  await expect(reader).toHaveCount(0);
  await go(page, "Clear search & filters");
  await expect(reader.getByRole("heading", { name: "Accord du participe passé avec avoir", exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].notes.some((note) => note.id === "grammar-3")).toBe(false);
});

test("cancels Note deletion on Escape or account change before any write", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Vocabulary");
  await page.getByRole("button", { name: "Delete A-word-1", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete A-word-1", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Delete A-word-1", exact: true }).click();
  await backend.switchTo("B");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(noteDeletes(backend)).toEqual([]);
  expect(noteDeletes(backend, ids.B)).toEqual([]);
});

test("keeps mobile Notes filters, actions and reader navigation usable in Chinese", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].notes = libraryRows(ids.A);
  backend.accounts[ids.A].preferences.language = "zh";
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  async function visit(name) {
    await page.getByRole("button", { name: "笔记", exact: true }).click();
    await page.getByRole("dialog", { name: "笔记", exact: true }).getByRole("button", { name, exact: true }).click();
  }
  await visit("短语");
  await expect(page.getByRole("heading", { name: "Il ne faut pas vendre la peau de l'ours avant de l'avoir tué.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "筛选与排序", exact: true }).click();
  const filter = page.getByRole("dialog", { name: "筛选与排序", exact: true });
  await filter.getByRole("radio", { name: "#idiom", exact: true }).check();
  await filter.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "avoir le cafard 的操作", exact: true }).click();
  const actions = page.getByRole("dialog");
  await actions.getByRole("button", { name: "我会了", exact: true }).click();
  await expect.poll(() => storedNote(backend, "phrases-1").confidence).toBe(3);
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "选择 avoir le cafard", exact: true }).check();
  const selection = await page.getByRole("region", { name: "已选笔记", exact: true }).boundingBox();
  const bottom = await page.locator(".cahier-mobile-nav").boundingBox();
  expect(selection.y + selection.height).toBeLessThanOrEqual(bottom.y);
  await page.getByRole("button", { name: "清除选择", exact: true }).click();
  await visit("语法");
  const contents = page.getByRole("navigation", { name: "语法目录", exact: true });
  await expect(contents).toBeVisible();
  await contents.getByRole("checkbox").first().check();
  await page.locator(".library-contents-link").filter({ hasText: "Le subjonctif" }).click();
  await expect(contents).toBeHidden();
  await expect(page.getByRole("region", { name: "已选笔记", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清除选择", exact: true }).click();
  await expect(page.locator(".library-grammar-reader")).toBeVisible();
  await page.getByRole("button", { name: "返回目录", exact: true }).click();
  await expect(contents).toBeVisible();
  await expect(page.locator(".library-contents-link").filter({ hasText: "Le subjonctif" })).toBeFocused();
  await visit("发音规则");
  await expect(page.getByRole("heading", { name: "eau · au · o", exact: true })).toBeVisible();
  await visit("词汇");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBe(0);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  }
  expect(await page.getByRole("article").first().evaluate((element) => globalThis.getComputedStyle(element).transitionDuration)).toMatch(/^(0s|0.001s)(, (0s|0.001s))*$/);
});

async function deleteSelection(page) {
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm deletion", exact: true }).click();
}

for (const fails of [false, true]) {
  test(`bulk deletion ${fails ? "keeps failed Notes selected for retry" : "removes saved Notes and persists after refresh"}`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    if (fails) for (const note of backend.accounts[ids.A].notes) backend.failedDeletes.add(`${ids.A}:${note.id}`);
    const original = structuredClone(backend.accounts[ids.A].notes);
    await page.goto("/");
    await go(page, "Vocabulary");
    await go(page, "Select page");
    await deleteSelection(page);
    await expect(page.getByRole("status").locator("p")).toHaveText(`Deleted: ${fails ? 0 : 3}. Failed: ${fails ? 3 : 0}.${fails ? " Failed notes remain selected. Check your connection and retry." : ""}`);
    expect(noteDeletes(backend)).toHaveLength(3);
    expect(backend.accounts[ids.A].notes).toEqual(fails ? original : []);
    if (fails) {
      await expect(page.getByText("3 selected", { exact: true })).toBeVisible();
      for (let index = 1; index <= 3; index += 1) await expect(page.getByRole("checkbox", { name: `Unselect A-word-${index}`, exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Retry failed deletions", exact: true })).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Search notes", exact: true })).toBeHidden();
      await go(page, "Add first note");
      await expect(page.getByRole("dialog", { name: "Add learning note", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.reload();
    await go(page, "Vocabulary");
    await expect(page.getByRole("article")).toHaveCount(fails ? 3 : 0);
  });
}

test("reconciles partial Note deletion and retries only failures", async ({ page, context, baseURL }, testInfo) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.setViewportSize({ width: 1280, height: 900 });
  backend.failedDeletes.add(`${ids.A}:A-2`);
  const gate = backend.hold(`${ids.A}:notes:DELETE:A-3`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select page");
  await deleteSelection(page);
  await expect(page.getByRole("heading", { name: "A-word-1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Deleting notes...");
  await page.screenshot({ path: testInfo.outputPath("library-delete-pending.png") });
  gate.resolve();
  await expect(page.getByRole("status")).toContainText("Deleted: 2. Failed: 1.");
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Unselect A-word-2", exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-2"]);
  await page.screenshot({ path: testInfo.outputPath("library-delete-partial.png") });
  backend.failedDeletes.clear();
  page.once("dialog", (dialog) => dialog.accept());
  await go(page, "Retry failed deletions");
  await expect(page.getByRole("status")).toHaveText("Deleted: 1. Failed: 0.");
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(backend.accounts[ids.A].notes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("library-delete-recovered.png") });
  expect(noteDeletes(backend).map((entry) => entry.noteId).sort()).toEqual(["A-1", "A-2", "A-2", "A-3"]);
});

test("starts one bulk deletion and keeps controls locked across navigation", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:DELETE`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select page");
  await page.getByRole("button", { name: "Delete selected", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByRole("alertdialog")).toHaveCount(1);
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm deletion", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => noteDeletes(backend).length).toBe(3);
  for (const name of ["Delete selected", "Clear selection", "Unselect page", "Delete A-word-1", "Unselect A-word-1"]) {
    await expect(page.getByRole("button", { name, exact: true }).or(page.getByRole("checkbox", { name, exact: true }))).toBeDisabled();
  }
  await go(page, "Phrases");
  await go(page, "Vocabulary");
  await expect(page.getByRole("status")).toHaveText("Deleting notes...");
  await expect(page.getByRole("button", { name: "Delete selected", exact: true })).toBeDisabled();
  gate.resolve();
  await expect(page.getByRole("status")).toHaveText("Deleted: 3. Failed: 0.");
  expect(noteDeletes(backend)).toHaveLength(3);
  expect(backend.accounts[ids.A].notes).toEqual([]);
});

test("isolates pending Note deletion across account switches and rehydration", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const originalB = structuredClone(backend.accounts[ids.B]);
  const gate = backend.hold(`${ids.A}:notes:DELETE:A-2`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select A-word-2");
  await deleteSelection(page);
  await backend.waitFor(`${ids.A}:notes:DELETE:A-2`);
  await backend.switchTo("B");
  await go(page, "Vocabulary");
  await go(page, "Select B-word-1");
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(backend.accounts[ids.B]).toEqual(originalB);
  await backend.switchTo("A");
  await go(page, "Quiz");
  await expect(page.getByText("Loading your saved learning session...", { exact: true })).toBeVisible();
  gate.resolve();
  await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
  await go(page, "Vocabulary");
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected notes", exact: true })).toHaveCount(0);
  await expect(page.locator('.library-checkbox input:checked')).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1", "A-3"]);
  expect(backend.accounts[ids.B]).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

test("keeps deleted Notes out of Quiz and Study after pending confidence saves and refresh", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await go(page, "Vocabulary");
  await go(page, "Select A-word-2");
  await go(page, "Select A-word-3");
  await deleteSelection(page);
  await expect(page.getByRole("heading", { name: "A-word-3", exact: true })).toHaveCount(0);
  expect(noteDeletes(backend).map((entry) => entry.noteId)).toEqual(["A-3"]);
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "A-word-2", exact: true }) });
  await expect(card.getByRole("button", { name: "I know this", exact: true })).toBeDisabled();
  gate.resolve();
  await expect(page.getByRole("status")).toHaveText("Deleted: 2. Failed: 0.");
  expect(notePatches(backend, "A-2")).toHaveLength(1);
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1"]);
  await go(page, "Quiz");
  await expect(page.getByRole("heading", { name: "Today's quiz is complete.", exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1"]);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"]).toBeUndefined();
  await go(page, "Study");
  await expect(page.getByText("Card 1 of 1", { exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.study_state.cycleIds).toEqual(["A-1"]);
  await page.reload();
  await go(page, "Study");
  await expect(page.getByText("Card 1 of 1", { exact: true })).toBeVisible();
  await go(page, "Vocabulary");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "A-word-1", exact: true })).toBeVisible();
  expect(notePatches(backend, "A-2")).toHaveLength(1);
});

test("cancels queued Note deletion on account change", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  const originalB = structuredClone(backend.accounts[ids.B]);
  await page.goto("/");
  await go(page, "Vocabulary");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "A-word-2", exact: true }) });
  await card.getByRole("button", { name: "I know this", exact: true }).click();
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await go(page, "Select A-word-2");
  await deleteSelection(page);
  await backend.switchTo("B");
  await go(page, "Vocabulary");
  await go(page, "Select B-word-1");
  gate.resolve();
  await expect.poll(() => storedNote(backend, "A-2").confidence).toBe(2);
  await expect(page.getByRole("checkbox", { name: "Unselect B-word-1", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await backend.switchTo("A");
  await go(page, "Vocabulary");
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toBeVisible();
  expect(noteDeletes(backend)).toEqual([]);
  expect(backend.accounts[ids.B]).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

test("prevents a late Editor response from restoring a deleted Note", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Edit A-word-2");
  await page.getByRole("dialog").getByLabel("English", { exact: true }).fill("edited before deleting");
  await page.getByRole("dialog").getByRole("button", { name: "Save note", exact: true }).click();
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await page.getByRole("dialog").getByRole("button", { name: "Close editor", exact: true }).click();
  await go(page, "Select A-word-2");
  await go(page, "Select A-word-3");
  await deleteSelection(page);
  await expect(page.getByRole("heading", { name: "A-word-3", exact: true })).toHaveCount(0);
  expect(noteDeletes(backend).map((entry) => entry.noteId)).toEqual(["A-3"]);
  gate.resolve();
  await expect(page.getByRole("status")).toHaveText("Deleted: 2. Failed: 0.");
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toHaveCount(0);
  expect(notePatches(backend, "A-2").map((entry) => entry.body)).toEqual([{ english: "edited before deleting" }]);
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1"]);
  await page.reload();
  await go(page, "Vocabulary");
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("reports an uncertain Note deletion and allows idempotent retry", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.lostDeleteResponses.add(`${ids.A}:A-2`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select A-word-2");
  await deleteSelection(page);
  await expect(page.getByRole("status")).toContainText("Deleted: 0. Failed: 1.");
  await expect(page.getByRole("checkbox", { name: "Unselect A-word-2", exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1", "A-3"]);
  page.once("dialog", (dialog) => dialog.accept());
  await go(page, "Retry failed deletions");
  await expect(page.getByRole("status")).toHaveText("Deleted: 1. Failed: 0.");
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toHaveCount(0);
  expect(noteDeletes(backend)).toHaveLength(2);
});

test("keeps Demo bulk deletion temporary and separate from account data", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const original = structuredClone(backend.accounts);
  await page.goto("/#/demo");
  const storage = await page.evaluate(() => ({ ...localStorage }));
  await go(page, "Phrases");
  await expect(page.getByRole("article").first()).toBeVisible();
  const count = await page.getByRole("article").count();
  expect(count).toBeGreaterThan(0);
  await go(page, "Select page");
  await deleteSelection(page);
  await expect(page.getByRole("status")).toHaveText(`Deleted: ${count}. Failed: 0.`);
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(backend.accounts).toEqual(original);
  expect(backend.ledger).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
  await page.reload();
  await go(page, "Phrases");
  await expect(page.getByRole("article")).toHaveCount(count);
});
