import { expect, test } from "@playwright/test";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { noteCreates } from "./fixtures/imports.js";
import { openDraft } from "./helpers/editor.js";
import { aiRequests } from "./helpers/backend-state.js";

for (const demo of [false, true]) {
  test(`preserves ${demo ? "Demo" : "authenticated"} Editor drafts after invalid or duplicate Notes`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    await page.goto(demo ? "/#/demo" : "/");
    const editor = await openDraft(page, "   ");
    await editor.getByLabel("English", { exact: true }).fill("   ");
    await editor.getByRole("textbox", { name: "Notes", exact: true }).fill("keep my draft");
    await go(page, "Save note");
    await expect(editor.getByText("Enter a French word, phrase, or title, not just spaces.", { exact: true })).toBeVisible();
    await editor.getByLabel("French", { exact: true }).fill("  intégrité  ");
    await go(page, "Save note");
    await expect(editor.getByText("Enter a meaning or translation, not just spaces.", { exact: true })).toBeVisible();
    await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("keep my draft");
    expect(noteCreates(backend)).toHaveLength(0);
    await editor.getByLabel("English", { exact: true }).fill("integrity");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    await openDraft(page, " INTÉGRITÉ ");
    await editor.getByLabel("English", { exact: true }).fill("duplicate draft");
    await go(page, "Save note");
    await expect(editor.getByText(/already exists in this category/)).toBeVisible();
    await expect(editor.getByLabel("English", { exact: true })).toHaveValue("duplicate draft");
    await editor.locator('input[name="editor-category"][value="phrases"]').check();
    await editor.getByRole("textbox", { name: "Translation", exact: true }).fill("   ");
    await go(page, "Save note");
    await expect(editor.getByText("Enter a meaning or translation, not just spaces.", { exact: true })).toBeVisible();
    await editor.getByRole("textbox", { name: "Translation", exact: true }).fill("a phrase translation");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    await go(page, "Add note");
    await editor.locator('input[name="editor-category"][value="grammar"]').check();
    await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Grammar integrity");
    await go(page, "Save note");
    await expect(editor.getByText("Enter the grammar rule or explanation, not just empty formatting.", { exact: true })).toBeVisible();
    await editor.getByRole("textbox", { name: "Grammar note", exact: true }).fill("Use à before a city.");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    await page.getByRole("navigation").getByRole("button", { name: "Grammar", exact: true }).click();
    await expect(page.getByText("Use à before a city.", { exact: true })).toBeVisible();
    expect(aiRequests(backend)).toHaveLength(0);
    expect(noteCreates(backend)).toHaveLength(demo ? 0 : 3);
  });
}

test("preserves safe grammar formatting through paste, save, refresh and edit", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await go(page, "Add note");
  const editor = page.getByRole("dialog");
  await editor.locator('input[name="editor-category"][value="grammar"]').check();
  await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Pasted grammar");
  const rich = editor.getByRole("textbox", { name: "Grammar note", exact: true });
  await rich.focus();
  await rich.evaluate((element) => {
    const clipboardData = new globalThis.DataTransfer();
    clipboardData.setData("text/html", '<h2 onclick="globalThis.__injected=1">Accord</h2><p><strong>un</strong> <em>chat</em> &amp; une chatte</p><p>un\n<span style="font-weight:700">chien</span></p><ul><li>à Paris</li><li><u>en France</u></li></ul><table><tr><td>petit</td><td>petite</td></tr></table><p>&lt;img src=x onerror=alert(1)&gt;</p><script>globalThis.__injected=1</script><img src=x onerror="globalThis.__injected=1"><a href="javascript:globalThis.__injected=1">safe link</a>');
    element.dispatchEvent(new globalThis.ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(rich).toContainText("un chat & une chatte");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  const stored = backend.accounts[ids.A].notes.find((note) => note.french === "Pasted grammar");
  expect(stored.notes).toContain("<strong>un</strong> <em>chat</em>");
  expect(stored.notes).toContain("petit | petite");
  expect(stored.notes).not.toMatch(/<(script|img|a)\b|onclick=|href=/);
  await page.reload();
  await go(page, "Grammar");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Pasted grammar", exact: true }) });
  await expect(card).toContainText("un chat & une chatte");
  await expect(card).toContainText("un chien");
  await expect(card.getByRole("listitem")).toHaveCount(2);
  await expect(card.locator("u")).toHaveText("en France");
  await go(page, "Edit Pasted grammar");
  await expect(rich).toContainText("un chat & une chatte");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  expect(backend.accounts[ids.A].notes.find((note) => note.id === stored.id).notes).toBe(stored.notes);
  expect(await page.evaluate(() => globalThis.__injected)).toBeUndefined();
  expect(failures).toEqual([]);
});

test("isolates malformed legacy Notes without writes or workspace crashes", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].notes.push(
    { id: "bad-category", user_id: ids.A, category: "unknown", french: "unknown-category", english: "meaning" },
    { id: "bad-title", user_id: ids.A, category: "vocabulary", french: {}, english: "meaning" },
    { id: "bad-shapes", user_id: ids.A, category: "vocabulary", french: "réparer", english: "repair", tags: { bad: true }, confidence: 99, part_of_speech: "verb", conjugation: { je: {}, tu: "répares" }, adjective_forms: [], notes: { bad: true } },
  );
  const before = structuredClone(backend.accounts[ids.A].notes);
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await expect(page.getByText(/3 saved notes have invalid data/)).toBeVisible();
  await go(page, "Vocabulary");
  await expect(page.getByRole("heading", { name: "réparer", exact: true })).toBeVisible();
  await go(page, "Edit réparer");
  const editor = page.getByRole("dialog");
  await expect(editor.locator('input[name="editor-confidence"][value="1"]')).toBeChecked();
  await expect(editor.getByRole("textbox", { name: "Tags", exact: true })).toHaveValue("");
  await go(page, "Cancel");
  await go(page, "Study");
  await expect(page.getByRole("heading", { name: "Flashcards", exact: true })).toBeVisible();
  await go(page, "Quiz");
  await expect(page.getByText("Vocabulary quiz", { exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].notes).toEqual(before);
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toHaveLength(0);
  expect(failures).toEqual([]);
});

test("rejects invalid Note API writes and keeps confidence updates narrow", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Bonjour, Account A/ })).toBeVisible();
  const outcomes = await page.evaluate(async (userId) => {
    const api = await import("/src/api/notes.js");
    const errors = [];
    for (const changes of [{ french: " " }, { english: " " }, { category: "unknown" }, { confidence: 7 }, { tags: {} }, { conjugation: [] }]) {
      try { await api.createNote({ category: "vocabulary", french: "new-word", english: "meaning", ...changes }, userId); }
      catch (error) { errors.push(error.code); }
    }
    try { await api.updateNote("A-1", { english: "   " }, userId, { category: "vocabulary" }); }
    catch (error) { errors.push(error.code); }
    await api.updateNote("A-1", { confidence: 2, lastReviewed: "Today" }, userId);
    return errors;
  }, ids.A);
  expect(outcomes).toEqual(Array(7).fill("NOTE_INVALID"));
  const writes = backend.writes(ids.A).filter((entry) => entry.resource === "notes");
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toEqual({ confidence: 2, last_reviewed: "Today" });
  expect(backend.accounts[ids.A].notes.find((note) => note.id === "A-1").confidence).toBe(2);
});
