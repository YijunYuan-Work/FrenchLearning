import { expect, test } from "@playwright/test";

const backendOrigin = "https://daily-learning.supabase.test";
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "learner@demo.supabase.co",
  user_metadata: { name: "Learner", username: "learner" },
};
const notes = [
  ["one", "bonjour", "hello"],
  ["two", "merci", "thank you"],
  ["three", "salut", "hi"],
  ["earlier", "hier", "yesterday"],
].map(([id, french, english]) => ({
  id, french, english, category: "vocabulary", confidence: 1, part_of_speech: "interjection",
}));

function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

async function setupLearning({ page, context, baseURL }, { sync = true, failLocalRead = false } = {}) {
  const date = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const saved = {
    add_note: true, study: true, quiz: false,
    quiz_state: {
      date, limit: 23, queueIds: ["one", "two", "three"],
      answered: { one: { answer: "hello", correct: true } },
      seenIds: ["earlier", "one", "two", "three"],
    },
    study_state: {
      cardIndex: 1, cycleIds: ["one", "three", "two"], date,
      isFlipped: true, isStudyComplete: false, seenIds: ["earlier", "one", "three", "two"],
    },
  };
  const backend = {
    saved, writes: [], noteWrites: [], notes, failDaily: false, failNotes: false, failSettings: false,
    missingDailyTable: false, notesGate: null, settingsGate: null,
    dailyRead: deferred(), notesRead: deferred(), settingsRead: deferred(),
  };

  // Keep the real hooks, API normalization, and Supabase client; only replace configuration/HTTP.
  await page.route("**/src/lib/supabase.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/const supabaseUrl =[^;]*;/, `const supabaseUrl = ${JSON.stringify(backendOrigin)};`)
      .replace(/const supabasePublishableKey =[\s\S]*?;/, 'const supabasePublishableKey = "test-publishable-key";');
    await route.fulfill({ response, body });
  });
  await page.route("**/src/api/dailyLearning.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /const dailyLearningSyncEnabled =[\s\S]*?;/,
      `const dailyLearningSyncEnabled = ${sync};`
    );
    await route.fulfill({ response, body });
  });
  await page.route(`${backendOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body = [];
    if (url.pathname === "/auth/v1/user") body = user;
    if (url.pathname === "/rest/v1/user_preferences") {
      if (url.searchParams.get("select") !== "language") {
        backend.settingsRead.resolve();
        await backend.settingsGate?.promise;
        if (backend.failSettings) return route.fulfill({ status: 500, json: { message: "Settings unavailable" } });
      }
      body = [{ language: "en", quiz_vocabulary_limit: 23 }];
    }
    if (url.pathname === "/rest/v1/notes") {
      if (request.method() === "GET") {
        backend.notesRead.resolve();
        await backend.notesGate?.promise;
        if (backend.failNotes) return route.fulfill({ status: 500, json: { message: "Notes unavailable" } });
        body = backend.notes;
      } else {
        backend.noteWrites.push(request.postDataJSON());
        body = { ...request.postDataJSON(), id: "new-note" };
      }
    }
    if (url.pathname === "/rest/v1/daily_learning_state") {
      if (request.method() === "GET") {
        backend.dailyRead.resolve();
        if (backend.missingDailyTable) return route.fulfill({ status: 404, json: { code: "PGRST205" } });
        if (backend.failDaily) {
          return route.fulfill({
            status: 503,
            headers: { "Retry-After": "0", "Access-Control-Expose-Headers": "Retry-After" },
            json: { message: "daily_learning_state temporarily unavailable" },
          });
        }
        body = [backend.saved];
      } else {
        const patch = request.postDataJSON();
        backend.writes.push(patch);
        backend.saved = { ...backend.saved, ...patch };
        body = backend.saved;
      }
    }
    await route.fulfill({ json: body });
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt, role: "authenticated" })}.test`,
    refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user,
  };
  await context.addCookies([
    { name: "sb-daily-learning-auth-token.chunks", value: "1", url: baseURL },
    { name: "sb-daily-learning-auth-token.0", value: encodeURIComponent(JSON.stringify(session)), url: baseURL },
  ]);

  const key = `french-learning-daily-learning-state-v1:${user.id}:${date}`;
  await page.addInitScript(({ key, saved, failLocalRead }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    globalThis.failDailyStorageRead = failLocalRead;
    globalThis.dailyStorageWrites = [];
    globalThis.readSavedDaily = () => getItem.call(localStorage, key);
    Storage.prototype.getItem = function (name) {
      if (name === key && globalThis.failDailyStorageRead) throw new Error("Storage read unavailable");
      return getItem.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) globalThis.dailyStorageWrites.push(JSON.parse(value));
      return setItem.call(this, name, value);
    };
  }, { key, saved, failLocalRead });
  return backend;
}

async function openSession(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

test("a failed daily read cannot write defaults and Retry restores saved progress", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  const original = structuredClone(backend.saved);
  backend.failDaily = true;
  await page.goto("/");
  const error = page.getByRole("alert").filter({ hasText: "Your saved learning progress could not be loaded." });
  await expect(error).toBeVisible();
  await openSession(page, "Quiz");
  await expect(page.getByText("Retry loading your data to resume your saved session.")).toBeVisible();
  await expect(page.getByText("Vocabulary quiz", { exact: true })).toHaveCount(0);
  expect(backend.writes).toEqual([]);

  backend.failDaily = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("merci", { exact: true })).toBeVisible();
  await expect(page.getByText("1/3", { exact: true })).toBeVisible();
  expect(backend.writes).toEqual([]);
  expect(backend.saved).toEqual(original);

  await page.getByRole("button", { name: "Show correct answer", exact: true }).click();
  await expect.poll(() => backend.writes.length).toBe(1);
  expect(backend.saved.add_note).toBe(true);
  expect(backend.saved.study).toBe(true);
  expect(backend.saved.quiz_state.answered.two.revealedAnswer).toBe(true);
  expect(backend.saved.quiz_state.queueIds).toEqual(["one", "two", "three"]);
  expect(backend.saved.quiz_state.seenIds).toEqual(["earlier", "one", "two", "three"]);
});

for (const name of ["Quiz", "Study"]) {
  test(`${name} waits for delayed notes, survives note failure, and resumes after refresh`, async ({ page, context, baseURL }) => {
    const backend = await setupLearning({ page, context, baseURL });
    const original = structuredClone(backend.saved);
    backend.notesGate = deferred();
    backend.failNotes = true;
    await page.goto("/");
    await backend.notesRead.promise;
    await backend.dailyRead.promise;
    await openSession(page, name);
    await expect(page.getByText("Loading your saved learning session...", { exact: true })).toBeVisible();
    expect(backend.writes).toEqual([]);
    expect(backend.saved).toEqual(original);

    backend.notesGate.resolve();
    const error = page.getByRole("alert").filter({ hasText: "Your notes could not be loaded." });
    await expect(error).toBeVisible();
    await expect(page.getByText("Retry loading your data to resume your saved session.")).toBeVisible();
    expect(backend.writes).toEqual([]);
    expect(backend.saved).toEqual(original);

    backend.failNotes = false;
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    const assertRestored = async () => {
      if (name === "Quiz") {
        await expect(page.getByText("merci", { exact: true })).toBeVisible();
        await expect(page.getByText("1/3", { exact: true })).toBeVisible();
      } else {
        await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Show front", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "salut", exact: true })).toBeVisible();
      }
      expect(backend.saved).toEqual(original);
      expect(backend.writes).toEqual([]);
    };
    await assertRestored();
    await page.reload();
    await openSession(page, name);
    await assertRestored();
  });
}

test("an unanswered Quiz waits for learning settings instead of regenerating its saved queue", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.saved.quiz_state.answered = {};
  const original = structuredClone(backend.saved);
  backend.settingsGate = deferred();
  backend.failSettings = true;
  await page.goto("/");
  await backend.settingsRead.promise;
  await openSession(page, "Quiz");
  await expect(page.getByText("Loading your saved learning session...", { exact: true })).toBeVisible();
  expect(backend.writes).toEqual([]);
  backend.settingsGate.resolve();
  const error = page.getByRole("alert").filter({ hasText: "Your learning settings could not be loaded." });
  await expect(error).toBeVisible();
  expect(backend.writes).toEqual([]);
  backend.failSettings = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("bonjour", { exact: true })).toBeVisible();
  expect(backend.saved).toEqual(original);
  expect(backend.writes).toEqual([]);
});

test("successfully loaded empty notes allow normal empty Quiz and Study states", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.notes = [];
  await page.goto("/");
  await openSession(page, "Quiz");
  await expect(page.getByText("No vocabulary is due today.", { exact: true })).toBeVisible();
  await expect.poll(() => backend.saved.quiz_state.queueIds).toEqual([]);
  await openSession(page, "Study");
  await expect(page.getByText("No study cards are due.", { exact: true })).toBeVisible();
  await expect.poll(() => backend.saved.study_state.cycleIds).toEqual([]);
  expect(backend.saved.add_note).toBe(true);
  expect(backend.saved.study).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("local storage read failure preserves the saved state and recovers without a write", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL }, { sync: false, failLocalRead: true });
  await page.goto("/");
  const error = page.getByRole("alert").filter({ hasText: "Your saved learning progress could not be loaded." });
  await expect(error).toBeVisible();
  await openSession(page, "Study");
  expect(await page.evaluate(() => JSON.parse(globalThis.readSavedDaily()))).toEqual(backend.saved);
  expect(await page.evaluate(() => globalThis.dailyStorageWrites)).toEqual([]);
  await page.evaluate(() => { globalThis.failDailyStorageRead = false; });
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.dailyStorageWrites)).toEqual([]);
  await page.getByRole("button", { name: "Show front", exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.dailyStorageWrites.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(globalThis.readSavedDaily()));
  expect(saved.quiz_state).toEqual(backend.saved.quiz_state);
  expect(saved.study_state).toEqual({ ...backend.saved.study_state, isFlipped: false });
  expect(backend.writes).toEqual([]);
});

test("a missing cloud table still restores local progress without a cloud write", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.missingDailyTable = true;
  await page.goto("/");
  await openSession(page, "Study");
  await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  expect(backend.writes).toEqual([]);
  expect(await page.evaluate(() => globalThis.dailyStorageWrites)).toEqual([]);
});

test("an Add Note goal earned during a failed read merges with saved progress after retry", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.saved.add_note = false;
  backend.failDaily = true;
  await page.goto("/");
  const error = page.getByRole("alert").filter({ hasText: "Your saved learning progress could not be loaded." });
  await expect(error).toBeVisible();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("French", { exact: true }).fill("demain");
  await editor.getByLabel("English", { exact: true }).fill("tomorrow");
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(backend.noteWrites).toHaveLength(1);
  expect(backend.writes).toEqual([]);
  backend.failDaily = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => backend.writes.length).toBe(1);
  expect(backend.writes[0]).toMatchObject({ add_note: true, study: true, quiz: false });
  expect(backend.saved.quiz_state.answered.one.correct).toBe(true);
  expect(backend.saved.study_state.cardIndex).toBe(1);
});
