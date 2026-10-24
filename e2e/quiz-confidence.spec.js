import { expect, test } from "@playwright/test";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { notePatches, storedNote } from "./helpers/backend-state.js";
import { answerQuiz } from "./helpers/quiz.js";

async function changeQuizNoteCategory(page, french, category) {
  await go(page, "Vocabulary");
  await go(page, `Edit ${french}`);
  const editor = page.getByRole("dialog");
  await editor.locator(`input[name="editor-category"][value="${category}"]`).check();
  if (category === "grammar") await editor.getByRole("textbox", { name: "Grammar note", exact: true }).fill("A grammar explanation.");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
}

for (const category of ["phrases", "grammar", "pronunciation"]) {
  test(`removes Notes moved to ${category} from saved Quiz queues without reshuffling`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    await page.goto("/");
    await go(page, "Quiz");
    await expect(page.getByText("A-word-2", { exact: true })).toBeVisible();
    await changeQuizNoteCategory(page, "A-word-2", category);
    await go(page, "Quiz");
    await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
    await expect(page.getByText("1/2", { exact: true })).toBeVisible();
    await expect(page.getByText("A-word-2", { exact: true })).toHaveCount(0);
    await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1", "A-3"]);
    expect(backend.accounts[ids.A].daily.quiz_state.seenIds).toEqual(["A-1", "A-2", "A-3"]);
    expect(storedNote(backend, "A-2").confidence).toBe(1);
    await page.reload();
    await go(page, "Quiz");
    await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
    await go(page, "Show correct answer");
    await go(page, "Next word");
    await expect(page.getByRole("heading", { name: "Today's quiz is complete.", exact: true })).toBeVisible();
    await expect(page.getByText("You tested 2 words.", { exact: true })).toBeVisible();
    await expect.poll(() => backend.accounts[ids.A].daily.quiz).toBe(true);
    expect(notePatches(backend, "A-2")).toHaveLength(1);
    expect(notePatches(backend, "A-3")).toHaveLength(0);
  });
}

test("preserves answered Quiz history while pruning invalid or deleted questions", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].daily.quiz_state.queueIds.push("missing", "broken", "mastered", "A-2");
  backend.accounts[ids.A].notes.push(
    { id: "broken", category: "vocabulary", french: "broken", english: {}, confidence: 1 },
    { id: "mastered", category: "vocabulary", french: "mastered", english: "known", confidence: 4 },
  );
  await page.goto("/");
  await go(page, "Quiz");
  await expect(page.getByText("1/3", { exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1", "A-2", "A-3"]);
  await answerQuiz(page, "A-meaning-2");
  await go(page, "Next word");
  await changeQuizNoteCategory(page, "A-word-2", "grammar");
  for (const french of ["A-word-1", "A-word-3"]) {
    page.once("dialog", (dialog) => dialog.accept());
    await go(page, `Delete ${french}`);
    await expect(page.getByRole("heading", { name: french, exact: true })).toHaveCount(0);
  }
  await go(page, "Quiz");
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
  await expect(page.getByText("You tested 2 words.", { exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.quiz).toBe(true);
  const state = backend.accounts[ids.A].daily.quiz_state;
  expect(state.queueIds).toEqual(["A-1", "A-2"]);
  expect(Object.values(state.answered).filter((result) => result.correct)).toHaveLength(2);
  expect(state.seenIds).toContain("missing");
  expect(storedNote(backend, "A-2").category).toBe("grammar");
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  await page.reload();
  await go(page, "Quiz");
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toHaveCount(0);
  expect(backend.accounts[ids.A].daily.quiz_state.answered).toEqual(state.answered);
});

test("prevents Quiz confidence writes after a category change during answer persistence", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:daily_learning_state:PATCH`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await backend.waitFor(`${ids.A}:daily_learning_state:PATCH`);
  await changeQuizNoteCategory(page, "A-word-2", "phrases");
  await go(page, "Quiz");
  await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
  await answerQuiz(page, "A-meaning-3");
  gate.resolve();
  await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1", "A-3"]);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"]).toBeUndefined();
  expect(storedNote(backend, "A-2").confidence).toBe(1);
  expect(storedNote(backend, "A-3").confidence).toBe(2);
  expect(notePatches(backend, "A-2").every((entry) => entry.body.confidence === undefined)).toBe(true);
  expect(backend.accounts[ids.A].daily.quiz).toBe(false);
});

test("rejects a Quiz answer queued behind a Note category change", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Edit A-word-2");
  const editor = page.getByRole("dialog");
  await editor.locator('input[name="editor-category"][value="phrases"]').check();
  await go(page, "Save note");
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await go(page, "Close editor");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.answered["A-2"]?.status).toBe("pending");
  gate.resolve();
  await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1", "A-3"]);
  expect(storedNote(backend, "A-2").category).toBe("phrases");
  expect(storedNote(backend, "A-2").confidence).toBe(1);
  expect(notePatches(backend, "A-2")).toHaveLength(1);
  expect(notePatches(backend, "A-2")[0].body.confidence).toBeUndefined();
  await answerQuiz(page, "A-meaning-3");
  await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
});

for (const switchAccount of [false, true]) {
  test(`rejects confidence updates to remotely reclassified Notes${switchAccount ? " after switching accounts" : " during Quiz submission"}`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
    const originalB = structuredClone(backend.accounts[ids.B]);
    await page.goto("/");
    await go(page, "Quiz");
    await answerQuiz(page, "A-meaning-2");
    await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
    // Simulate another device committing a category change before this PATCH.
    storedNote(backend, "A-2").category = "phrases";
    if (switchAccount) {
      await backend.switchTo("B");
      await go(page, "Quiz");
      await expect(page.getByText("B-word-2", { exact: true })).toBeVisible();
    }
    gate.resolve();
    if (switchAccount) {
      await expect.poll(() => notePatches(backend, "A-2").length).toBe(1);
      await backend.switchTo("A");
      await go(page, "Quiz");
    }
    await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
    await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1", "A-3"]);
    expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"]).toBeUndefined();
    expect(storedNote(backend, "A-2").confidence).toBe(1);
    expect(notePatches(backend, "A-2")).toHaveLength(1);
    expect(notePatches(backend, "A-2")[0].categoryFilter).toBe("eq.vocabulary");
    expect(backend.accounts[ids.B]).toEqual(originalB);
    expect(backend.writes(ids.B)).toEqual([]);
  });
}

test("reconciles reclassified Demo Quiz Notes without account writes", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const originalA = structuredClone(backend.accounts[ids.A]);
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto("/#/demo");
  await go(page, "Quiz");
  const french = await page.getByTestId("quiz-word").innerText();
  expect(french).toBe("organiser");
  await changeQuizNoteCategory(page, french, "phrases");
  await go(page, "Quiz");
  await expect(page.getByTestId("quiz-word")).not.toHaveText(french);
  const nextFrench = await page.getByTestId("quiz-word").innerText();
  await go(page, "Today");
  await go(page, "Quiz");
  await expect(page.getByTestId("quiz-word")).toHaveText(nextFrench);
  expect(backend.accounts[ids.A]).toEqual(originalA);
  expect(backend.writes(ids.A)).toEqual([]);
});

for (const manual of [false, true]) {
  test(`retries ${manual ? "manually corrected" : "correct"} Quiz answers without duplicate confidence gains`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    backend.failures.add(`${ids.A}:notes:PATCH`);
    await page.goto("/");
    await go(page, "Quiz");
    await answerQuiz(page, manual ? "not the meaning" : "A-meaning-2");
    if (manual) await page.getByRole("button", { name: "Mark as correct", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry saving answer", exact: true })).toBeVisible();
    expect(storedNote(backend, "A-2").confidence).toBe(1);
    expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"]).toMatchObject({ status: "pending", correct: false, targetConfidence: 2 });
    expect(backend.accounts[ids.A].daily.quiz_state.answered["A-1"].correct).toBe(true);
    expect(backend.accounts[ids.A].daily.quiz).toBe(false);
    await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next word", exact: true })).toHaveCount(0);
    expect(notePatches(backend, "A-2")[0].body).toEqual({ confidence: 2, last_reviewed: "Today" });
    backend.failures.delete(`${ids.A}:notes:PATCH`);
    await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
    await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
    expect(storedNote(backend, "A-2").confidence).toBe(2);
    expect(notePatches(backend, "A-2").map((entry) => entry.body.confidence)).toEqual([2, 2]);
    expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"]).toMatchObject({ correct: true, status: "complete", confidence: 2 });
    if (manual) expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].manuallyMarkedCorrect).toBe(true);
    await page.reload();
    await go(page, "Quiz");
    await expect(page.getByText("A-word-3", { exact: true })).toBeVisible();
    await expect(page.getByText("2/3", { exact: true })).toBeVisible();
    expect(storedNote(backend, "A-2").confidence).toBe(2);
    expect(notePatches(backend, "A-2")).toHaveLength(2);
  });
}

for (const initialConfidence of [1, 3]) {
test(`restores Quiz confidence target ${initialConfidence + 1} after a committed write loses its response`, async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const target = initialConfidence + 1;
  storedNote(backend, "A-2").confidence = initialConfidence;
  if (target === 4) {
    storedNote(backend, "A-1").confidence = 4;
    storedNote(backend, "A-3").confidence = 4;
  }
  backend.lostNoteResponses.add(`${ids.A}:A-2`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await expect(page.getByRole("button", { name: "Retry saving answer", exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(target);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].status).toBe("pending");
  await page.reload();
  await go(page, "Quiz");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("A-meaning-2");
  await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
  await expect(page.getByText(`Confidence advanced to ${target}.`, { exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(target);
  expect(notePatches(backend, "A-2").map((entry) => entry.body.confidence)).toEqual([target, target]);
});
}

test("advances confidence once per Note during repeated Quiz submissions", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await page.getByLabel("Your answer", { exact: true }).evaluate((input) => { input.form.requestSubmit(); input.form.requestSubmit(); });
  expect(notePatches(backend, "A-2")).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Next word", exact: true })).toHaveCount(0);
  gate.resolve();
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await answerQuiz(page, "A-meaning-3");
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Today's quiz is complete.", exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  expect(storedNote(backend, "A-3").confidence).toBe(2);
  expect(notePatches(backend, "A-2")).toHaveLength(1);
  expect(notePatches(backend, "A-3")).toHaveLength(1);
  await expect.poll(() => backend.accounts[ids.A].daily.quiz).toBe(true);
});

for (const confidenceFirst of [true, false]) {
  test(`preserves newer Note fields when saving ${confidenceFirst ? "confidence before an edit" : "an edit before confidence"}`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
    await page.goto("/");
    if (confidenceFirst) {
      await go(page, "Quiz");
      await answerQuiz(page, "A-meaning-2");
      await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
    }
    await go(page, "Vocabulary");
    await page.getByRole("button", { name: "Edit A-word-2", exact: true }).click();
    const editor = page.getByRole("dialog");
    await editor.getByLabel("English", { exact: true }).fill("newer edited meaning");
    await editor.getByRole("button", { name: "Save note", exact: true }).click();
    if (!confidenceFirst) {
      await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
      await editor.getByRole("button", { name: "Close editor", exact: true }).click();
      await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "A-word-2", exact: true }) })
        .getByRole("button", { name: "I know this", exact: true }).click();
    }
    expect(notePatches(backend, "A-2")).toHaveLength(1);
    gate.resolve();
    await expect.poll(() => storedNote(backend, "A-2").confidence).toBe(2);
    await expect.poll(() => storedNote(backend, "A-2").english).toBe("newer edited meaning");
    await expect(editor).toHaveCount(0);
    const patches = notePatches(backend, "A-2");
    expect(patches).toHaveLength(2);
    expect(patches.find((entry) => entry.body.english)?.body).toEqual({ english: "newer edited meaning" });
    expect(patches.find((entry) => entry.body.confidence)?.body).toEqual({ confidence: 2, last_reviewed: "Today" });
    await page.getByRole("button", { name: "Edit A-word-2", exact: true }).click();
    await expect(page.getByRole("dialog").locator('input[name="editor-confidence"][value="2"]')).toBeChecked();
    await expect(page.getByRole("dialog").getByLabel("English", { exact: true })).toHaveValue("newer edited meaning");
    await page.getByRole("button", { name: "Close editor", exact: true }).click();
    if (confidenceFirst) {
      await go(page, "Quiz");
      await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
      await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
      expect(storedNote(backend, "A-2").confidence).toBe(2);
      expect(storedNote(backend, "A-2").english).toBe("newer edited meaning");
    }
  });
}

test("preserves confidence changes when different Note responses arrive out of order", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-1`);
  await page.goto("/");
  await go(page, "Vocabulary");
  const card = (word) => page.getByRole("article").filter({ has: page.getByRole("heading", { name: word, exact: true }) });
  await card("A-word-1").getByRole("button", { name: "I know this", exact: true }).click();
  await backend.waitFor(`${ids.A}:notes:PATCH:A-1`);
  await card("A-word-2").getByRole("button", { name: "I know this", exact: true }).click();
  await expect.poll(() => storedNote(backend, "A-2").confidence).toBe(2);
  expect(storedNote(backend, "A-1").confidence).toBe(1);
  gate.resolve();
  await expect.poll(() => storedNote(backend, "A-1").confidence).toBe(2);
  await expect(card("A-word-1").getByText("Learning", { exact: true })).toBeVisible();
  await expect(card("A-word-2").getByText("Learning", { exact: true })).toBeVisible();
});

test("preserves a queued Note edit after a failed confidence update", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  backend.failNoteOnce.add(`${ids.A}:A-2`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await go(page, "Vocabulary");
  await page.getByRole("button", { name: "Edit A-word-2", exact: true }).click();
  await page.getByRole("dialog").getByLabel("English", { exact: true }).fill("edit survives failed confidence");
  await page.getByRole("dialog").getByRole("button", { name: "Save note", exact: true }).click();
  gate.resolve();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("edit survives failed confidence", { exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(1);
  expect(storedNote(backend, "A-2").english).toBe("edit survives failed confidence");
  await go(page, "Quiz");
  await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
  await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").english).toBe("edit survives failed confidence");
});

test("cancels queued edits on account switch while preserving pending Quiz targets", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const originalB = structuredClone(backend.accounts[ids.B]);
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await backend.waitFor(`${ids.A}:notes:PATCH:A-2`);
  await go(page, "Vocabulary");
  await page.getByRole("button", { name: "Edit A-word-2", exact: true }).click();
  await page.getByRole("dialog").getByLabel("English", { exact: true }).fill("cancel this queued edit");
  await page.getByRole("dialog").getByRole("button", { name: "Save note", exact: true }).click();
  await backend.switchTo("B");
  await go(page, "Vocabulary");
  await expect(page.getByRole("heading", { name: "B-word-2", exact: true })).toBeVisible();
  expect(backend.accounts[ids.B]).toEqual(originalB);
  await backend.switchTo("A");
  await go(page, "Quiz");
  await expect(page.getByText("Loading your saved learning session...", { exact: true })).toBeVisible();
  gate.resolve();
  await expect.poll(() => storedNote(backend, "A-2").confidence).toBe(2);
  expect(notePatches(backend, "A-2")).toHaveLength(1);
  expect(storedNote(backend, "A-2").english).toBe("A-meaning-2");
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].status).toBe("pending");
  await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
  await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  expect(backend.accounts[ids.B]).toEqual(originalB);
});

test("recovers a failed Quiz result save after refresh without another confidence gain", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.transport.failCompletedQuiz = true;
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await expect(page.getByRole("button", { name: "Retry saving answer", exact: true })).toBeVisible();
  await expect(page.getByText("1/3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry saving answer", exact: true })).toBeFocused();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("A-meaning-2");
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].status).toBe("pending");
  expect(backend.accounts[ids.A].daily.quiz).toBe(false);
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  backend.transport.failCompletedQuiz = false;
  await go(page, "Quiz");
  await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
  await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].status).toBe("complete");
});

test("completes keyboard-driven Quiz with save retry, manual correction and answer reveal", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const backend = await setupAccounts({ page, context, baseURL });
  const account = backend.accounts[ids.A];
  const words = [
    ["la boulangerie", "bakery", "noun", "feminine", "/bu.lɑ̃.ʒʁi/"],
    ["souvent", "often", "adverb", "", "/su.vɑ̃/"],
    ["le rendez-vous", "appointment, meeting", "noun", "masculine", "/ʁɑ̃.de.vu/"],
    ["l'épanouissement", "fulfilment, blossoming; personal growth and flourishing", "noun", "masculine", "/e.pa.nwis.mɑ̃/"],
    ["organiser", "to organize", "verb", "", "/ɔʁ.ɡa.ni.ze/"],
    ["la chaise", "chair", "noun", "feminine", "/ʃɛz/"],
  ];
  account.notes = words.map(([french, english, part_of_speech, gender, ipa], index) => ({ id: `A-${index + 1}`, user_id: ids.A, category: "vocabulary", confidence: index === 0 ? 2 : 1, french, english, part_of_speech, gender, ipa }));
  account.preferences.quiz_vocabulary_limit = 6;
  account.daily.quiz_state = { date: backend.date, limit: 6, queueIds: account.notes.map((note) => note.id), answered: {}, seenIds: account.notes.map((note) => note.id) };
  account.notes.push(...Array.from({ length: 12 }, (_, index) => ({ ...account.notes[1], id: `unseen-${index}`, french: `inédit-${index}` })));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shot = async (name) => {
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath(`quiz-${name}.png`), animations: "disabled" });
  };
  await page.goto("/");
  await go(page, "Quiz");
  const answer = page.getByLabel("Your answer", { exact: true });
  await expect(answer).toBeFocused();
  await shot("desktop-question");
  await answer.fill("bakery");
  await page.getByRole("radio", { name: "Masculine", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Feminine", exact: true })).toBeChecked();
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-1`);
  backend.failures.add(`${ids.A}:notes:PATCH`);
  await answer.press("Enter");
  await backend.waitFor(`${ids.A}:notes:PATCH:A-1`);
  await expect(page.getByRole("status").filter({ hasText: "Saving your answer..." })).toBeVisible();
  await expect(answer).toBeDisabled();
  await expect(page.getByText("0/6", { exact: true })).toBeVisible();
  await shot("desktop-saving");
  await page.setViewportSize({ width: 370, height: 736 });
  await shot("mobile-saving");
  await page.setViewportSize({ width: 1280, height: 800 });
  gate.resolve();
  const retry = page.getByRole("button", { name: "Retry saving answer", exact: true });
  await expect(retry).toBeFocused();
  await expect(answer).toHaveValue("bakery");
  await shot("desktop-error");
  await page.setViewportSize({ width: 370, height: 736 });
  await shot("mobile-error");
  await expect(retry).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 800 });
  backend.failures.delete(`${ids.A}:notes:PATCH`);
  await page.keyboard.press("Enter");
  const next = page.getByRole("button", { name: "Next word", exact: true });
  await expect(next).toBeFocused();
  await expect(page.getByText("Confidence advanced to 3.", { exact: true })).toBeVisible();
  expect(notePatches(backend, "A-1").map((entry) => entry.body.confidence)).toEqual([3, 3]);
  await shot("desktop-correct");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("quiz-word")).toHaveText("souvent");
  await expect(answer).toBeFocused();
  await answer.fill("sometimes");
  await answer.press("Enter");
  await expect(next).toBeFocused();
  await page.getByRole("button", { name: "Mark as correct", exact: true }).click();
  await expect(next).toBeFocused();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  await next.press("Enter");
  await expect(answer).toBeFocused();
  await answer.fill("appointment");
  await page.getByRole("radio", { name: "Masculine", exact: true }).check();
  await answer.press("Enter");
  await next.click();
  await expect(page.getByTestId("quiz-word")).toHaveText("l'épanouissement");
  await answer.fill("openness");
  await page.getByRole("radio", { name: "Masculine", exact: true }).check();
  await answer.press("Enter");
  expect(await page.getByTestId("quiz-word").evaluate((element) => element.getBoundingClientRect().height / parseFloat(globalThis.getComputedStyle(element).lineHeight))).toBeLessThan(1.2);
  await shot("desktop-incorrect-long");
  await page.setViewportSize({ width: 370, height: 736 });
  await shot("mobile-incorrect-long");
  await expect(page.getByRole("button", { name: "Next word", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 800 });
  await next.click();
  await expect(answer).toBeFocused();
  await answer.fill("to organize");
  await answer.press("Enter");
  await next.click();
  await page.getByRole("button", { name: "Show correct answer", exact: true }).click();
  await expect(next).toBeFocused();
  expect(notePatches(backend, "A-6")).toEqual([]);
  await next.press("Enter");
  await expect(page.getByRole("heading", { name: "Today's quiz is complete.", exact: true })).toBeFocused();
  await expect.poll(() => account.daily.quiz).toBe(true);
  expect(Object.values(account.daily.quiz_state.answered).filter((entry) => entry.correct)).toHaveLength(4);
  await shot("desktop-complete");
  await expect(page.getByRole("button", { name: "Start a new quiz", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await shot("desktop-complete-zh");
  await page.setViewportSize({ width: 370, height: 736 });
  await shot("mobile-complete-zh");
  await page.getByRole("button", { name: "开始新的测验", exact: true }).click();
  await expect(page.getByTestId("quiz-word")).toContainText("inédit-");
  await expect.poll(() => account.daily.quiz_state.queueIds.every((id) => id.startsWith("unseen-"))).toBe(true);
  expect(errors).toEqual([]);
});

test("keeps mobile Quiz usable with Chinese controls, viewport changes and reduced motion", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 370, height: 736 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const backend = await setupAccounts({ page, context, baseURL });
  const account = backend.accounts[ids.A];
  account.preferences.language = "zh";
  Object.assign(storedNote(backend, "A-2"), { french: "le rendez-vous", english: "约会，会面", part_of_speech: "noun", gender: "masculine", ipa: "/ʁɑ̃.de.vu/" });
  await page.goto("/");
  await go(page, "测验");
  const answer = page.getByLabel("你的答案", { exact: true });
  await expect(answer).toBeFocused();
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("quiz-mobile-question-zh.png") });
  await page.evaluate(() => {
    Object.defineProperties(globalThis.visualViewport, { height: { configurable: true, value: 452 }, offsetTop: { configurable: true, value: 0 } });
    globalThis.visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".quiz-page")).toHaveAttribute("data-keyboard", "true");
  await answer.fill("约会");
  await page.getByRole("radio", { name: "阳性", exact: true }).check();
  await answer.focus();
  const check = page.getByRole("button", { name: "检查答案", exact: true });
  const bounds = await check.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(452);
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("quiz-mobile-keyboard-zh.png"), clip: { x: 0, y: 0, width: 370, height: 452 } });
  await check.click();
  const next = page.getByRole("button", { name: "下一个词", exact: true });
  await expect(next).toBeFocused();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(globalThis.visualViewport, "height", { configurable: true, value: 736 });
    globalThis.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.screenshot({ path: testInfo.outputPath("quiz-mobile-correct-zh.png") });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  }
  expect(await page.locator(".quiz-feedback").evaluate((element) => globalThis.getComputedStyle(element).animationName)).toBe("none");
  await page.setViewportSize({ width: 370, height: 736 });
  await next.click();
  await expect(answer).toBeFocused();
  await page.getByRole("button", { name: "返回今日", exact: true }).click();
  await expect(page.locator(".today-page")).toBeVisible();
  await go(page, "测验");
  await expect(page.getByTestId("quiz-word")).toHaveText("A-word-3");
  await page.getByRole("button", { name: "显示正确答案", exact: true }).click();
  await page.getByRole("button", { name: "下一个词", exact: true }).click();
  await expect(page.getByRole("button", { name: "开始新的测验", exact: true })).toBeDisabled();
  expect(notePatches(backend, "A-2")).toHaveLength(1);
});

test("fits the maximum Quiz question ledger on a narrow viewport", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 736 });
  const backend = await setupAccounts({ page, context, baseURL });
  const account = backend.accounts[ids.A];
  account.notes = Array.from({ length: 200 }, (_, index) => ({ ...account.notes[0], id: `word-${index}`, french: `mot-${index}` }));
  account.preferences.quiz_vocabulary_limit = 200;
  account.daily.quiz_state = { date: backend.date, limit: 200, queueIds: account.notes.map((note) => note.id), answered: {}, seenIds: account.notes.map((note) => note.id) };
  await page.goto("/");
  await go(page, "Quiz");
  await expect(page.getByText("0/200", { exact: true })).toBeVisible();
  await expect(page.locator(".quiz-segments > span")).toHaveCount(200);
  const last = await page.locator(".quiz-segments > span").last().boundingBox();
  expect(last.width).toBeGreaterThan(0);
  expect(last.x + last.width).toBeLessThanOrEqual(300);
});

test("restores pending Quiz intent from local storage after a committed write loses its response", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { sync: false });
  backend.lostNoteResponses.add(`${ids.A}:A-2`);
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await expect(page.getByRole("button", { name: "Retry saving answer", exact: true })).toBeVisible();
  const pending = await page.evaluate(({ id, date }) => JSON.parse(localStorage.getItem(`french-learning-daily-learning-state-v1:${id}:${date}`)), { id: ids.A, date: backend.date });
  expect(pending.quiz_state.answered["A-2"]).toMatchObject({ status: "pending", targetConfidence: 2 });
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  await page.reload();
  await go(page, "Quiz");
  await page.getByRole("button", { name: "Retry saving answer", exact: true }).click();
  await expect(page.getByText("Confidence advanced to 2.", { exact: true })).toBeVisible();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state")).toEqual([]);
});

test("updates only temporary confidence after a correct Demo Quiz answer", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const original = structuredClone(backend.accounts);
  await page.goto("/#/demo");
  const storage = await page.evaluate(() => ({ ...localStorage }));
  await go(page, "Quiz");
  const question = page.getByTestId("quiz-word");
  const french = await question.textContent();
  const note = await page.evaluate(async (french) => {
    const { demoNotes } = await import("/src/data/demoData.js");
    const { getAcceptedMeanings } = await import("/src/utils/quiz.js");
    const note = demoNotes.find((note) => note.french === french);
    return { ...note, acceptedAnswer: getAcceptedMeanings(note.english)[0] };
  }, french);
  await page.getByLabel("Your answer", { exact: true }).fill(note.acceptedAnswer);
  if (note.partOfSpeech === "noun" && note.gender) await page.getByRole("radio", { name: new RegExp(`^${note.gender}$`, "i") }).check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText(`Confidence advanced to ${Math.min(4, note.confidence + 1)}.`, { exact: true })).toBeVisible();
  expect(backend.accounts).toEqual(original);
  expect(backend.ledger).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
});
