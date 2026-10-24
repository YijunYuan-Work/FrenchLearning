import { expect, test } from "@playwright/test";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { storedNote, aiRequests } from "./helpers/backend-state.js";
import { openDraft } from "./helpers/editor.js";

async function editorCapture(page, testInfo, name) {
  await page.evaluate(() => globalThis.document.fonts.ready);
  if (!name.includes("long-form")) await page.locator(".editor-scroll-body").evaluate((el) => { el.scrollTop = 0; });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath(`editor-${name}.png`) });
  await page.getByRole("dialog").screenshot({ path: testInfo.outputPath(`editor-detail-${name}.png`) });
}

test("creates and edits every Note category with Editor controls and character insertion", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Vocabulary");
  const editor = await openDraft(page, "boulangerie");
  await editor.getByLabel("English", { exact: true }).fill("bakery");
  await editor.getByLabel("Word type", { exact: true }).selectOption("noun");
  await editor.getByRole("radio", { name: "Feminine", exact: true }).check();
  await editorCapture(page, testInfo, "desktop-vocabulary");
  const french = editor.getByLabel("French", { exact: true });
  await french.fill("cafe");
  await french.press("End");
  await french.press("Shift+ArrowLeft");
  await editor.getByRole("button", { name: "é", exact: true }).click();
  await expect(french).toHaveValue("café");
  await expect(french).toBeFocused();
  expect(await editor.locator(".french-character-rows button").count()).toBe(45);
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  await go(page, "Edit café");
  await expect(editor.getByRole("radio", { name: "Feminine", exact: true })).toBeChecked();
  await editor.getByLabel("French", { exact: true }).fill("organiser");
  await editor.getByLabel("English", { exact: true }).fill("to organize");
  await editor.getByLabel("IPA pronunciation", { exact: true }).fill("/ɔʁ.ɡa.ni.ze/");
  await editor.getByLabel("Word type", { exact: true }).selectOption("verb");
  for (const [pronoun, value] of Object.entries({ je: "organise", tu: "organises", "il/elle": "organise", nous: "organisons", vous: "organisez", "ils/elles": "organisent" })) await editor.getByLabel(pronoun, { exact: true }).fill(value);
  await editor.getByLabel("Example", { exact: true }).fill("Je dois organiser mes notes de français.");
  await editor.getByLabel("Notes", { exact: true }).fill("Regular -er verb.");
  await editor.getByLabel("Tags", { exact: true }).fill("work, verbs");
  await editor.getByRole("radio", { name: "Learning", exact: true }).check();
  await editorCapture(page, testInfo, "desktop-verb");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  expect(storedNote(backend, "saved-café")).toMatchObject({ french: "organiser", conjugation: { vous: "organisez" }, confidence: 2 });

  for (const [category, label, title, meaning] of [
    ["phrases", "Phrases", "Il ne faut pas vendre la peau de l’ours avant de l’avoir tué.", "Don't count your chickens before they hatch."],
    ["grammar", "Grammar", "Le subjonctif après « il faut que »", ""],
    ["pronunciation", "Pronunciation Rules", "Le R français", "A French uvular consonant."],
  ]) {
    await go(page, "Add note");
    await editor.getByRole("radio", { name: label, exact: true }).check();
    const titleInput = editor.getByRole("textbox", { name: category === "grammar" ? "Title" : category === "phrases" ? "Original French" : "French", exact: true });
    await titleInput.fill(title);
    if (category === "grammar") {
      const rich = editor.getByRole("textbox", { name: "Grammar note", exact: true });
      await rich.fill("Il faut que is always followed by the subjunctive.");
      await rich.press("ControlOrMeta+a");
      await editor.getByRole("button", { name: "Bold", exact: true }).click();
      await expect(rich.locator("b,strong")).toContainText("Il faut que");
      await rich.press("ControlOrMeta+a");
      await rich.evaluate((element) => {
        const clipboardData = new globalThis.DataTransfer();
        clipboardData.setData("text/html", '<p><strong>Il faut que</strong> is always followed by the subjunctive, because it expresses necessity rather than a fact.</p><p><em>Il faut que tu viennes demain.</em></p><ol><li>Take the ils/elles form of the present tense.</li><li>Drop -ent.</li><li>Add -e, -es, -e, -ions, -iez, -ent.</li></ol>');
        element.dispatchEvent(new globalThis.ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
      });
      await rich.press("ArrowRight");
    } else {
      await editor.getByLabel(category === "phrases" ? "Translation" : "English", { exact: true }).fill(meaning);
      if (category === "pronunciation") await editor.getByLabel("IPA pronunciation", { exact: true }).fill("/ʁ/");
    }
    await editor.getByLabel("Tags", { exact: true }).fill(category === "phrases" ? "proverb" : category === "grammar" ? "subjonctif" : "sounds");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    await go(page, label);
    await go(page, `Edit ${title}`);
    await expect(titleInput).toHaveValue(title);
    if (category === "grammar") await expect(editor.locator(".rich-text-editor b,.rich-text-editor strong")).toContainText("Il faut que");
    await editorCapture(page, testInfo, `desktop-${category}`);
    await editor.getByLabel("Tags", { exact: true }).fill("review");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    expect(backend.accounts[ids.A].notes.find((note) => note.french === title)).toMatchObject({ category, tags: ["review"] });
  }
  expect(aiRequests(backend)).toHaveLength(0);
});

test("preserves manual Editor edits through Auto-fill and Save retries", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Add note");
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeDisabled();
  await go(page, "Save note");
  await expect(editor.getByRole("textbox", { name: "French", exact: true })).toHaveAttribute("aria-invalid", "true");
  await editorCapture(page, testInfo, "desktop-validation");
  await editor.getByLabel("French", { exact: true }).fill("chaleureux");
  const gate = backend.hold(`${ids.A}:ai:POST`);
  backend.transport.aiResult = { category: "vocabulary", word: "chaleureux", english: "warm, welcoming", partOfSpeech: "adjective", ipa: "/ʃa.lø.ʁø/", tags: ["people"], example: "Ils nous ont réservé un accueil chaleureux.", notes: "Used for a welcome or a friendly person.", adjectiveForms: { masculine: "chaleureux", feminine: "chaleureuse", masculinePlural: "chaleureux", femininePlural: "chaleureuses" } };
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  await editorCapture(page, testInfo, "desktop-ai-loading");
  await editor.getByLabel("Notes", { exact: true }).fill("My own explanation.");
  gate.resolve();
  await expect(editor.getByRole("status")).toContainText("Auto-filled.");
  await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue("My own explanation.");
  await expect(editor.getByLabel("Feminine plural", { exact: true })).toHaveValue("chaleureuses");
  await editorCapture(page, testInfo, "desktop-ai-success");
  await expect(editor.locator(".is-autofilled")).toHaveCount(0);
  await editorCapture(page, testInfo, "desktop-adjective");
  backend.transport.aiError = { code: "OPENAI_TIMEOUT", error: "AI auto-fill timed out. Please try again." };
  await go(page, "Auto-fill");
  await expect(editor.getByRole("alert")).toContainText("timed out");
  await editorCapture(page, testInfo, "desktop-ai-error");
  expect(aiRequests(backend)).toHaveLength(2);
  backend.transport.aiError = null;
  await go(page, "Retry auto-fill");
  await expect(editor.getByRole("status")).toContainText("Auto-filled.");
  expect(aiRequests(backend)).toHaveLength(3);
  backend.transport.failNextCreate = true;
  const saveGate = backend.hold(`${ids.A}:notes:POST`);
  await go(page, "Save note");
  await backend.waitFor(`${ids.A}:notes:POST`);
  await expect(editor).toHaveAttribute("aria-busy", "true");
  await editorCapture(page, testInfo, "desktop-save-pending");
  saveGate.resolve();
  await expect(editor.getByRole("alert")).toContainText("Note save failed");
  await editorCapture(page, testInfo, "desktop-save-failure");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  expect(backend.accounts[ids.A].notes.filter((note) => note.french === "chaleureux")).toHaveLength(1);
});

test("keeps the mobile Editor usable with a reduced viewport and restores focus", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 370, height: 736 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "More");
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  const trigger = page.getByRole("button", { name: "添加笔记", exact: true });
  await trigger.click();
  const editor = page.getByRole("dialog");
  const french = editor.getByLabel("法语", { exact: true });
  await expect(french).toBeFocused();
  await french.fill("chaleureu");
  // Browser-emulated keyboard geometry, not a drawn keyboard or production fake.
  await page.evaluate(() => {
    Object.defineProperty(globalThis.visualViewport, "height", { configurable: true, value: 472 });
    globalThis.visualViewport.dispatchEvent(new Event("resize"));
  });
  const footer = editor.locator(".editor-footer");
  const bounds = await footer.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(473);
  await expect(editor.getByRole("button", { name: "保存笔记", exact: true })).toBeVisible();
  await editorCapture(page, testInfo, "mobile-keyboard-zh");
  await french.fill("cafe");
  await french.press("End");
  await french.press("Shift+ArrowLeft");
  await editor.getByRole("button", { name: "é", exact: true }).click();
  await expect(french).toHaveValue("café");
  await expect(french).toBeFocused();
  await french.fill("organiser");
  await page.evaluate(() => {
    delete globalThis.visualViewport.height;
    globalThis.visualViewport.dispatchEvent(new Event("resize"));
  });
  await editor.getByLabel("词性", { exact: true }).selectOption("verb");
  await editor.getByLabel("ils/elles", { exact: true }).fill("organisent");
  await editorCapture(page, testInfo, "mobile-long-form-zh");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 736 });
    expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const header = await editor.locator(".editor-header").boundingBox();
    const actions = await footer.boundingBox();
    expect(header.y).toBeGreaterThanOrEqual(0);
    expect(actions.y + actions.height).toBeLessThanOrEqual(737);
  }
  await page.setViewportSize({ width: 370, height: 736 });
  await editor.locator(".editor-scroll-body").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const cancel = editor.getByRole("button", { name: "取消", exact: true });
  await cancel.focus();
  await cancel.press("Tab");
  await expect(editor.getByRole("button", { name: "保存笔记", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(editor.getByRole("button", { name: "关闭编辑器", exact: true })).toBeFocused();
  expect(await editor.evaluate((el) => globalThis.getComputedStyle(el).animationName)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toHaveLength(0);
});

test("ignores obsolete Auto-fill responses while a newer request is pending", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { ignoreAiCancellation: true });
  const first = backend.hold(`${ids.A}:ai:POST`);
  await page.goto("/");
  const editor = await openDraft(page);
  await editor.getByLabel("English", { exact: true }).fill("keep until the next valid autofill");
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  await editor.getByLabel("French", { exact: true }).fill("merci");
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("keep until the next valid autofill");
  const second = backend.hold(`${ids.A}:ai:POST`);
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  const oldResponse = page.waitForResponse((response) => response.url().includes("/api/autofill-vocabulary") && response.request().postDataJSON().word === "bonjour");
  first.resolve();
  await (await oldResponse).finished();
  await expect(editor.getByLabel("French", { exact: true })).toHaveValue("merci");
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("keep until the next valid autofill");
  await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeDisabled();
  await expect(editor.getByText("Asking AI to build the vocabulary note...", { exact: true })).toBeVisible();
  second.resolve();
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("AI meaning");
  expect(aiRequests(backend).map((entry) => entry.body.word)).toEqual(["bonjour", "merci"]);
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toEqual([]);
});

test("preserves manual Auto-fill edits in the Editor and saved Note", async ({ page, context, baseURL }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:ai:POST`);
  await page.goto("/");
  const editor = await openDraft(page);
  await editor.getByLabel("English", { exact: true }).fill("my meaning");
  await editor.getByRole("combobox", { name: "Word type", exact: true }).selectOption("verb");
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  // Returning to the original value is still an intentional manual edit.
  await editor.getByLabel("English", { exact: true }).fill("temporary change");
  await editor.getByLabel("English", { exact: true }).fill("my meaning");
  await editor.getByLabel("Notes", { exact: true }).fill("my own explanation");
  await editor.getByLabel("Tags", { exact: true }).fill("school, work");
  await editor.getByLabel("je", { exact: true }).fill("my conjugation");
  await editor.locator('input[name="editor-confidence"][value="3"]').check();
  gate.resolve();
  await expect(editor.getByText("Auto-filled. Review the details before saving.", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("my meaning");
  await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("my own explanation");
  await expect(editor.getByLabel("Tags", { exact: true })).toHaveValue("school, work");
  await expect(editor.getByLabel("je", { exact: true })).toHaveValue("my conjugation");
  await expect(editor.getByRole("textbox", { name: "Example", exact: true })).toHaveValue("AI example");
  await expect(editor.getByLabel("IPA pronunciation", { exact: true })).toHaveValue("/test/");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  const saved = backend.accounts[ids.A].notes.find((note) => note.french === "bonjour");
  expect(saved).toMatchObject({ english: "my meaning", notes: "my own explanation", tags: ["school", "work"],
    part_of_speech: "verb", conjugation: { je: "my conjugation" }, confidence: 3, example: "AI example" });
  expect(errors).toEqual([]);
});

for (const change of ["word", "category", "language"]) {
  test(`invalidates pending Auto-fill after a ${change} change, even when reverted`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL }, { ignoreAiCancellation: true });
    const gate = backend.hold(`${ids.A}:ai:POST`);
    await page.goto("/");
    const editor = await openDraft(page);
    await editor.getByLabel("English", { exact: true }).fill("untouched draft");
    await go(page, "Auto-fill");
    await backend.waitFor(`${ids.A}:ai:POST`);
    if (change === "word") {
      await editor.getByLabel("French", { exact: true }).fill("merci");
      await editor.getByLabel("French", { exact: true }).fill("bonjour");
    } else if (change === "category") {
      await editor.locator('input[name="editor-category"][value="grammar"]').check();
      await editor.locator('input[name="editor-category"][value="vocabulary"]').check();
    } else {
      await page.getByRole("button", { name: "简体中文", exact: true }).evaluate((button) => button.click());
      await page.getByRole("button", { name: "English", exact: true }).evaluate((button) => button.click());
    }
    const response = page.waitForResponse((response) => response.url().includes("/api/autofill-vocabulary"));
    gate.resolve();
    await (await response).finished();
    await expect(editor.getByLabel("English", { exact: true })).toHaveValue("untouched draft");
    await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue("");
    await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeEnabled();
    await expect(editor.getByText("Auto-filled. Review the details before saving.", { exact: true })).toHaveCount(0);
    expect(aiRequests(backend)).toHaveLength(1);
  });
}

test("discards old Auto-fill errors after reopening the Editor and allows a Chinese retry", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { ignoreAiCancellation: true });
  backend.transport.aiError = { error: "AI daily limit reached", code: "daily_limit_reached" };
  const gate = backend.hold(`${ids.A}:ai:POST`);
  await page.goto("/");
  await openDraft(page);
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  await go(page, "Close editor");
  const editor = await openDraft(page);
  await editor.getByLabel("English", { exact: true }).fill("new editor draft");
  const response = page.waitForResponse((response) => response.url().includes("/api/autofill-vocabulary"));
  gate.resolve();
  await (await response).finished();
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("new editor draft");
  await expect(editor.getByText("AI daily limit reached", { exact: true })).toHaveCount(0);
  backend.transport.aiError = null;
  await page.getByRole("button", { name: "简体中文", exact: true }).evaluate((button) => button.click());
  await editor.getByRole("button", { name: "自动填充", exact: true }).click();
  await expect(editor.getByLabel("中文释义", { exact: true })).toHaveValue("中文释义");
  await expect(editor.getByRole("textbox", { name: "笔记", exact: true })).toHaveValue("中文笔记");
  expect(aiRequests(backend).map((entry) => entry.body.language)).toEqual(["en", "zh"]);
});

test("isolates pending Auto-fill when the Editor switches Notes", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { ignoreAiCancellation: true });
  const gate = backend.hold(`${ids.A}:ai:POST`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Edit A-word-1");
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  // Exercise replacement without first unmounting through the Close button.
  await page.getByRole("button", { name: "Edit A-word-2", exact: true }).evaluate((button) => button.click());
  const editor = page.getByRole("dialog");
  const response = page.waitForResponse((response) => response.url().includes("/api/autofill-vocabulary"));
  gate.resolve();
  await (await response).finished();
  await expect(editor.getByLabel("French", { exact: true })).toHaveValue("A-word-2");
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("A-meaning-2");
  await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeEnabled();
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toEqual([]);
});

for (const editing of [false, true]) {
  test(`saves once during repeated Editor ${editing ? "edit" : "create"} submissions`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const method = editing ? "PATCH" : "POST";
    const gate = backend.hold(`${ids.A}:notes:${method}`);
    await page.goto("/");
    if (editing) {
      await go(page, "Vocabulary");
      await go(page, "Edit A-word-2");
    } else await openDraft(page, "one-create");
    const editor = page.getByRole("dialog");
    await editor.getByLabel("English", { exact: true }).fill("one save");
    await editor.evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
    await backend.waitFor(`${ids.A}:notes:${method}`);
    await expect(editor).toHaveAttribute("aria-busy", "true");
    await expect(editor.getByRole("button", { name: "Saving note...", exact: true })).toBeDisabled();
    await expect(editor.getByLabel("French", { exact: true })).toBeDisabled();
    await expect(editor.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
    await editor.evaluate((form) => form.requestSubmit());
    expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toHaveLength(1);
    gate.resolve();
    await expect(editor).toHaveCount(0);
    if (editing) expect(storedNote(backend, "A-2").english).toBe("one save");
    else expect(backend.accounts[ids.A].notes.filter((note) => note.french === "one-create")).toHaveLength(1);
    expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toHaveLength(1);
  });
}

test("preserves an Editor draft after Save failure and allows retry", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.transport.failNextCreate = true;
  await page.goto("/");
  const editor = await openDraft(page, "retry-create");
  await editor.getByLabel("English", { exact: true }).fill("draft meaning");
  await go(page, "Save note");
  await expect(editor.getByText("Note save failed", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("French", { exact: true })).toBeEnabled();
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("draft meaning");
  expect(backend.accounts[ids.A].notes.some((note) => note.french === "retry-create")).toBe(false);
  await editor.getByLabel("English", { exact: true }).fill("corrected meaning");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  expect(backend.accounts[ids.A].notes.filter((note) => note.french === "retry-create")).toMatchObject([{ english: "corrected meaning" }]);
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toHaveLength(2);
});

for (const fails of [false, true]) {
  test(`protects a new Editor save from a late same-account save ${fails ? "failure" : "success"}`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const oldGate = backend.hold(`${ids.A}:notes:POST`);
    if (fails) backend.failures.add(`${ids.A}:notes:POST`);
    const nextGate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
    await page.goto("/");
    await go(page, "Vocabulary");
    const editor = await openDraft(page, "old-editor-save");
    await editor.getByLabel("English", { exact: true }).fill("old editor meaning");
    await go(page, "Save note");
    await backend.waitFor(`${ids.A}:notes:POST`);
    await go(page, "Close");
    await go(page, "Edit A-word-2");
    await editor.getByLabel("English", { exact: true }).fill("new editor meaning");
    await go(page, "Save note");
    await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
    const response = page.waitForResponse((response) => response.url().includes("/rest/v1/notes") && response.request().method() === "POST");
    oldGate.resolve();
    await (await response).finished();
    await expect(editor).toHaveAttribute("aria-busy", "true");
    await expect(editor.getByLabel("French", { exact: true })).toHaveValue("A-word-2");
    await expect(editor.getByLabel("English", { exact: true })).toHaveValue("new editor meaning");
    await expect(editor.getByText("Late account A failure", { exact: true })).toHaveCount(0);
    await expect(editor.getByRole("button", { name: "Saving note...", exact: true })).toBeDisabled();
    nextGate.resolve();
    await expect(editor).toHaveCount(0);
    expect(storedNote(backend, "A-2").english).toBe("new editor meaning");
    expect(backend.accounts[ids.A].notes.some((note) => note.french === "old-editor-save")).toBe(!fails);
    expect(backend.writes(ids.A).filter((entry) => entry.resource === "notes")).toHaveLength(2);
  });
}

test("cancels pending Auto-fill and saves only the submitted Editor draft", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { ignoreAiCancellation: true });
  const aiGate = backend.hold(`${ids.A}:ai:POST`);
  const saveGate = backend.hold(`${ids.A}:notes:POST`);
  await page.goto("/");
  const editor = await openDraft(page);
  await editor.getByLabel("English", { exact: true }).fill("submitted meaning");
  await go(page, "Auto-fill");
  await backend.waitFor(`${ids.A}:ai:POST`);
  await go(page, "Save note");
  await backend.waitFor(`${ids.A}:notes:POST`);
  const response = page.waitForResponse((response) => response.url().includes("/api/autofill-vocabulary"));
  aiGate.resolve();
  await (await response).finished();
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("submitted meaning");
  await expect(editor).toHaveAttribute("aria-busy", "true");
  saveGate.resolve();
  await expect(editor).toHaveCount(0);
  expect(backend.accounts[ids.A].notes.find((note) => note.french === "bonjour")).toMatchObject({ english: "submitted meaning", notes: "" });
});

test("cancels Auto-fill during authentication preflight without an AI request", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Vocabulary");
  const editor = await openDraft(page);
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const original = supabase.auth.getSession.bind(supabase.auth);
    let first = true;
    supabase.auth.getSession = async (...args) => {
      const result = await original(...args);
      if (first) {
        first = false;
        await new Promise((resolve) => { globalThis.releaseEditorPreflight = resolve; });
      }
      return result;
    };
  });
  await go(page, "Auto-fill");
  await page.waitForFunction(() => typeof globalThis.releaseEditorPreflight === "function");
  await go(page, "Close editor");
  await openDraft(page, "merci");
  await page.evaluate(() => globalThis.releaseEditorPreflight());
  await go(page, "Auto-fill");
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("AI meaning");
  expect(aiRequests(backend).map((entry) => entry.body.word)).toEqual(["merci"]);
});

test("preserves Editor drafts after quota errors without automatic Auto-fill retries", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.transport.aiError = { error: "Daily AI auto-fill limit reached", code: "daily_limit_reached" };
  await page.goto("/");
  const editor = await openDraft(page);
  await editor.getByLabel("English", { exact: true }).fill("manual meaning");
  await go(page, "Auto-fill");
  await expect(editor.getByText("Daily AI auto-fill limit reached", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("manual meaning");
  await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeEnabled();
  expect(aiRequests(backend)).toHaveLength(1);
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
  expect(aiRequests(backend)).toHaveLength(1);
  expect(backend.accounts[ids.A].notes.find((note) => note.french === "bonjour").english).toBe("manual meaning");
});

for (const failure of ["timeout", "invalid-response", "non-json", "null-json", "connection"]) {
  test(`preserves the Editor draft after Auto-fill ${failure} and allows explicit retry`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const timeout = failure === "timeout";
    backend.transport.aiStatus = timeout ? 504 : 502;
    backend.transport.aiError = { error: timeout ? "AI auto-fill timed out. Please try again." : "AI auto-fill returned an incomplete or unreadable response. Please try again.", code: timeout ? "OPENAI_TIMEOUT" : "OPENAI_INVALID_RESPONSE", retryable: true };
    if (failure === "non-json") backend.transport.aiRaw = "<html>Bad Gateway</html>";
    if (failure === "null-json") {
      await page.route("**/api/autofill-vocabulary", (route) => route.fulfill({ status: 502, json: null }), { times: 1 });
    }
    if (failure === "connection") {
      await page.route("**/api/autofill-vocabulary", (route) => route.abort("connectionfailed"), { times: 1 });
    }
    await page.goto("/");
    const editor = await openDraft(page, "cœur");
    await editor.getByLabel("English", { exact: true }).fill("my meaning");
    await editor.getByRole("textbox", { name: "Notes", exact: true }).fill("my notes");
    await go(page, "Auto-fill");
    const message = timeout ? "AI auto-fill timed out." : failure === "connection" ? "Could not connect to AI auto-fill." : failure === "non-json" || failure === "null-json" ? "AI auto-fill is temporarily unavailable." : "AI auto-fill returned an incomplete";
    await expect(editor.getByText(message, { exact: false })).toBeVisible();
    await expect(editor.getByLabel("French", { exact: true })).toHaveValue("cœur");
    await expect(editor.getByLabel("English", { exact: true })).toHaveValue("my meaning");
    await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("my notes");
    await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeEnabled();
    if (failure !== "connection" && failure !== "null-json") expect(aiRequests(backend)).toHaveLength(1);
    backend.transport.aiError = null;
    backend.transport.aiRaw = undefined;
    await go(page, "Auto-fill");
    await expect(editor.getByLabel("English", { exact: true })).toHaveValue("AI meaning");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    expect(backend.accounts[ids.A].notes.find((note) => note.french === "cœur").notes).toBe("AI notes");
    expect(aiRequests(backend)).toHaveLength(failure === "connection" || failure === "null-json" ? 1 : 2);
  });
}

test("localizes Auto-fill timeout feedback in the Chinese Editor and allows retry", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].preferences.language = "zh";
  backend.transport.aiStatus = 504;
  backend.transport.aiError = { code: "OPENAI_TIMEOUT", error: "AI auto-fill timed out. Please try again." };
  await page.goto("/");
  await go(page, "添加笔记");
  const editor = page.getByRole("dialog");
  await editor.getByLabel("法语", { exact: true }).fill("œuf");
  await editor.getByRole("textbox", { name: "中文释义", exact: true }).fill("鸡蛋");
  await go(page, "自动填充");
  await expect(editor.getByText(/AI 自动填充超时/)).toBeVisible();
  await expect(editor.getByText(/本次尝试计入今日 AI 限额/)).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "中文释义", exact: true })).toHaveValue("鸡蛋");
  expect(aiRequests(backend)).toHaveLength(1);
  backend.transport.aiError = null;
  await go(page, "自动填充");
  await expect(editor.getByRole("textbox", { name: "中文释义", exact: true })).toHaveValue("中文释义");
  expect(aiRequests(backend).map((entry) => entry.body.language)).toEqual(["zh", "zh"]);
});
