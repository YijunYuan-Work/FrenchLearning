import { expect, test } from "@playwright/test";
import { ids, sessionFor, setupAccounts, go } from "./fixtures/accounts.js";
import { importCsv, importRow, uploadCsv } from "./fixtures/imports.js";

async function addNote(page, french) {
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("French", { exact: true }).fill(french);
  await editor.getByLabel("English", { exact: true }).fill("temporary meaning");
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
}

test("late initial Auth and account A hydration cannot replace account B", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL }, { delayInitialSession: true });
  const daily = backend.hold(`${ids.A}:daily_learning_state:GET`);
  const notes = backend.hold(`${ids.A}:notes:GET`);
  const language = backend.hold(`${ids.A}:user_preferences:GET:language`);
  const settings = backend.hold(`${ids.A}:user_preferences:GET:quiz_vocabulary_limit,study_vocabulary_limit,study_grammar_limit,study_phrase_limit`);
  backend.accounts[ids.A].preferences.language = "zh";
  const originalB = structuredClone(backend.accounts[ids.B]);
  await page.goto("/");
  await backend.waitFor(`${ids.A}:daily_learning_state:GET`);
  await backend.waitFor(`${ids.A}:notes:GET`);
  await backend.switchTo("B");
  daily.resolve(); notes.resolve(); language.resolve(); settings.resolve();
  await page.waitForFunction(() => typeof globalThis.releaseInitialSession === "function");
  await page.evaluate(() => globalThis.releaseInitialSession());
  await go(page, "Study");
  await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "B-word-2", exact: true })).toBeVisible();
  await go(page, "Quiz");
  await expect(page.getByText("B-word-2", { exact: true })).toBeVisible();
  expect(backend.accounts[ids.B]).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

test("pending A progress, Quiz, and Study writes remain owned by A", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const originalB = structuredClone(backend.accounts[ids.B].daily);
  const writeGate = backend.hold(`${ids.A}:daily_learning_state:POST`);
  const sessionGate = backend.hold(`${ids.A}:daily_learning_state:PATCH`);
  await page.goto("/");
  await go(page, "Quiz");
  await page.getByRole("button", { name: "Show correct answer", exact: true }).click();
  await go(page, "Study");
  await page.getByRole("button", { name: "Show front", exact: true }).click();
  await addNote(page, "A-added");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state").length).toBe(3);
  await backend.switchTo("B");
  writeGate.resolve();
  sessionGate.resolve();
  await go(page, "Study");
  await expect(page.getByRole("heading", { name: "B-word-2", exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.add_note).toBe(true);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].revealedAnswer).toBe(true);
  expect(backend.accounts[ids.A].daily.study_state.isFlipped).toBe(false);
  expect(backend.accounts[ids.B].daily).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

test("queued A Study changes are not sent after an account switch", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const originalB = structuredClone(backend.accounts[ids.B].daily);
  const gate = backend.hold(`${ids.A}:daily_learning_state:PATCH`);
  await page.goto("/");
  await go(page, "Study");
  await page.getByRole("button", { name: "Show front", exact: true }).click();
  await backend.waitFor(`${ids.A}:daily_learning_state:PATCH`);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Card 1 of 3", { exact: true })).toBeVisible();
  await backend.switchTo("B");
  gate.resolve();
  await go(page, "Study");
  await expect(page.getByRole("heading", { name: "B-word-2", exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.study_state.isFlipped).toBe(false);
  expect(backend.accounts[ids.A].daily.study_state.cardIndex).toBe(1);
  expect(backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state")).toHaveLength(1);
  expect(backend.accounts[ids.B].daily).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

for (const fail of [false, true]) {
  test(`a late A editor save ${fail ? "failure" : "success"} cannot affect B's editor or progress`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL }, { sync: false });
    const gate = backend.hold(`${ids.A}:notes:POST`);
    if (fail) backend.failures.add(`${ids.A}:notes:POST`);
    const originalB = structuredClone(backend.accounts[ids.B]);
    await page.goto("/");
    await addNote(page, "A-late-note");
    await backend.waitFor(`${ids.A}:notes:POST`);
    await backend.switchTo("B");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page.getByRole("dialog").getByLabel("French", { exact: true }).fill("B-draft");
    const response = page.waitForResponse((response) => response.url().includes("/rest/v1/notes") &&
      response.request().method() === "POST" && response.request().postDataJSON().user_id === ids.A);
    gate.resolve();
    await (await response).finished();
    await page.getByRole("dialog").getByLabel("English", { exact: true }).fill("B-draft-meaning");
    await expect(page.getByRole("dialog").getByLabel("French", { exact: true })).toHaveValue("B-draft");
    await goAfterClosingEditor(page);
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("French", { exact: true })).toHaveValue("");
    await expect(page.getByText("Late account A failure", { exact: true })).toHaveCount(0);
    await goAfterClosingEditor(page);
    await go(page, "Vocabulary");
    await expect(page.getByRole("heading", { name: "A-late-note", exact: true })).toHaveCount(0);
    expect(backend.accounts[ids.B]).toEqual(originalB);
    const localB = await page.evaluate(({ id, date }) => JSON.parse(localStorage.getItem(`french-learning-daily-learning-state-v1:${id}:${date}`)), { id: ids.B, date: backend.date });
    expect(localB).toEqual(originalB.daily);
    if (!fail) await expect.poll(() => backend.accounts[ids.A].notes.some((note) => note.french === "A-late-note")).toBe(true);
  });
}

async function goAfterClosingEditor(page) {
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await go(page, "Today");
}

test("a late A confidence failure cannot roll back B's notes or show A's error", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH`);
  backend.failures.add(`${ids.A}:notes:PATCH`);
  const originalB = structuredClone(backend.accounts[ids.B].notes);
  await page.goto("/");
  await go(page, "Quiz");
  await page.getByLabel("Your answer", { exact: true }).fill("A-meaning-2");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await backend.waitFor(`${ids.A}:notes:PATCH`);
  await backend.switchTo("B");
  const response = page.waitForResponse((response) => response.url().includes("/rest/v1/notes") && response.request().method() === "PATCH");
  gate.resolve();
  await (await response).finished();
  await go(page, "Vocabulary");
  await expect(page.getByRole("heading", { name: "B-word-2", exact: true })).toBeVisible();
  await expect(page.getByText("Late account A failure", { exact: true })).toHaveCount(0);
  expect(backend.accounts[ids.B].notes).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

for (const [destination, mode] of [["B", "phrases"], ["A", "phrases"], ["B", "vocabulary"]]) {
  test(`an old ${mode} import stops on account change and cannot finish a new ${destination} import`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const oldGate = backend.hold(`${ids.A}:notes:POST`);
    await page.goto("/");
    await go(page, "Import");
    if (mode === "phrases") await page.getByRole("button", { name: "Short phrases", exact: true }).click();
    await uploadCsv(page, importCsv(mode, [importRow("old-first"), importRow("old-second")]), "old.csv");
    await page.getByRole("button", { name: "Start import", exact: true }).click();
    await backend.waitFor(`${ids.A}:notes:POST`);
    await backend.switchTo("B");
    if (destination === "A") await backend.switchTo("A");
    const nextGate = backend.hold(`${ids[destination]}:notes:POST`);
    // The in-flight old row keeps its original gate; new requests use the new one.
    await go(page, "Import");
    await expect(page.getByText("old.csv", { exact: true })).toHaveCount(0);
    if (mode === "phrases") await page.getByRole("button", { name: "Short phrases", exact: true }).click();
    await uploadCsv(page, importCsv(mode, [importRow("new-only")]), "new.csv");
    await page.getByRole("button", { name: "Start import", exact: true }).click();
    await expect.poll(() => backend.ledger.filter((entry) => entry.resource === "notes" && entry.method === "POST").length).toBe(2);
    oldGate.resolve();
    await expect.poll(() => backend.accounts[ids.A].notes.some((note) => note.french === "old-first")).toBe(true);
    await expect(page.getByRole("button", { name: "Cancel import", exact: true })).toBeVisible();
    expect(backend.ledger.some((entry) => entry.body?.french === "old-second")).toBe(false);
    nextGate.resolve();
    await expect.poll(() => backend.accounts[ids[destination]].notes.some((note) => note.french === "new-only")).toBe(true);
    await expect(page.getByRole("button", { name: "Cancel import", exact: true })).toHaveCount(0);
    if (destination === "B") expect(backend.accounts[ids.B].notes.some((note) => note.french.startsWith("old-"))).toBe(false);
  });
}

test("late A auto-fill cannot replace B's draft or use B's token", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:ai:POST`);
  await page.goto("/");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByRole("dialog").getByLabel("French", { exact: true }).fill("bonjour");
  await page.getByRole("button", { name: "Auto-fill", exact: true }).click();
  await backend.waitFor(`${ids.A}:ai:POST`);
  await backend.switchTo("B");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("French", { exact: true }).fill("B-draft");
  gate.resolve();
  await expect(editor.getByLabel("French", { exact: true })).toHaveValue("B-draft");
  await expect(editor.getByLabel("English", { exact: true })).toHaveValue("");
  expect(backend.ledger.filter((entry) => entry.resource === "ai").map((entry) => entry.id)).toEqual([ids.A]);
});

for (const operation of ["profile", "profile-write", "password"]) {
  test(`pending A ${operation} cannot change credentials or adopt A after B signs in`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    await page.goto("/");
    await go(page, "Settings");
    const key = `${ids.A}:${operation === "password" ? "token:POST" : operation === "profile-write" ? "user:PUT" : "user:GET"}`;
    const gate = backend.hold(key);
    if (operation.startsWith("profile")) {
      await page.getByLabel("Display name", { exact: true }).fill("A-edited-name");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
    } else {
      await page.getByLabel("Current password", { exact: true }).fill("old-password");
      await page.getByLabel("New password", { exact: true }).fill("new-password");
      await page.getByLabel("Confirm new password", { exact: true }).fill("new-password");
      await page.getByRole("button", { name: "Update password", exact: true }).click();
    }
    await backend.waitFor(key);
    await backend.switchTo("B");
    const completed = page.waitForResponse((response) => response.url().includes(operation === "password" ? "/auth/v1/token" : "/auth/v1/user") &&
      response.request().method() === (operation === "profile-write" ? "PUT" : operation === "profile" ? "GET" : "POST"));
    gate.resolve();
    await (await completed).finished();
    await go(page, "Settings");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Account B");
    const currentId = await page.evaluate(async () => {
      const { supabase } = await import("/src/lib/supabase.js");
      return (await supabase.auth.getSession()).data.session.user.id;
    });
    expect(currentId).toBe(ids.B);
    const mutations = backend.ledger.filter((entry) => entry.resource === "user" && entry.method === "PUT");
    expect(mutations.map((entry) => entry.id)).toEqual(operation === "profile-write" ? [ids.A] : []);
    expect(backend.accounts[ids.B].passwordChanged).toBeUndefined();
  });
}

test("same-account refresh preserves study and drafts, and profile saves remain functional", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Study");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Card 3 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByRole("dialog").getByLabel("French", { exact: true }).fill("same-account-draft");
  await page.evaluate(async (session) => {
    const { supabase } = await import("/src/lib/supabase.js");
    await supabase.auth.setSession(session);
  }, sessionFor(backend.accounts[ids.A].user));
  await expect(page.getByRole("dialog").getByLabel("French", { exact: true })).toHaveValue("same-account-draft");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.getByText("Card 3 of 3", { exact: true })).toBeVisible();
  await go(page, "Settings");
  await page.getByLabel("Display name", { exact: true }).fill("A-saved-profile");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile updated.", { exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].user.user_metadata.name).toBe("A-saved-profile");
  await page.getByLabel("Current password", { exact: true }).fill("old-password");
  await page.getByLabel("New password", { exact: true }).fill("new-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("new-password");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByText("Password updated.", { exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].passwordChanged).toBe(true);
  expect(backend.writes(ids.B)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Bonjour, A-saved-profile\./ })).toBeVisible();
});

test("mobile More keeps the real account settings and sign-out reachable", async ({ page, context, baseURL }) => {
  await setupAccounts({ page, context, baseURL });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Bonjour, Account A/ })).toBeVisible();
  await go(page, "More");
  await page.getByRole("dialog", { name: "More", exact: true }).getByRole("button", { name: "Account A", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Account A");
  await go(page, "More");
  await page.getByRole("dialog", { name: "More", exact: true }).getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your workspace.", exact: true })).toBeVisible();
  await expect(page.locator(".cahier-workspace")).toHaveCount(0);
});
