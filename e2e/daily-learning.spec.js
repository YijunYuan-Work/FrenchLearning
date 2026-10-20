import { expect, test } from "@playwright/test";
import { isDeepStrictEqual } from "node:util";

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
    days: {}, saveGate: null, failWrites: false, loseSaveResponse: false,
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
      const requestDate = request.method() === "GET" ? url.searchParams.get("date")?.slice(3) : request.postDataJSON().date;
      const current = requestDate === date ? backend.saved : backend.days[requestDate];
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
        body = current ? [current] : [];
      } else {
        const patch = request.postDataJSON();
        backend.writes.push(patch);
        await backend.saveGate?.promise;
        if (backend.failWrites) return route.fulfill({ status: 400, json: { message: "Daily save unavailable" } });
        // Model PostgREST's field-level JSONB comparison and unique constraint.
        const latest = requestDate === date ? backend.saved : backend.days[requestDate];
        if (request.method() === "PATCH") {
          for (const field of ["quiz_state", "study_state"]) {
            const filter = url.searchParams.get(field);
            if (filter && !isDeepStrictEqual(latest?.[field], JSON.parse(filter.slice(3)))) {
              return route.fulfill({ json: [] });
            }
          }
        } else if (!request.headers().prefer?.includes("resolution=merge-duplicates") && latest) {
          return route.fulfill({ status: 409, json: { code: "23505" } });
        }
        const next = { add_note: false, study: false, quiz: false, quiz_state: {}, study_state: {}, ...latest, ...patch };
        if (requestDate === date) backend.saved = next;
        else backend.days[requestDate] = next;
        if (backend.loseSaveResponse) {
          backend.loseSaveResponse = false;
          return route.fulfill({ status: 400, json: { message: "Response lost after commit" } });
        }
        body = request.method() === "PATCH" ? [next] : next;
      }
    }
    await route.fulfill({ json: body });
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
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
      if (name.startsWith("french-learning-daily-learning-state-v1:") && globalThis.failDailyStorageWrite) throw new Error("Storage write unavailable");
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
  await expect(page.getByRole("status", { name: "Progress not loaded", exact: true })).toBeVisible();
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

for (const keepHistory of [false, true]) {
test(`successfully loaded empty notes ${keepHistory ? "retain completed Quiz history" : "allow an empty Quiz without earning completion"} and allow empty Study`, async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.notes = [];
  if (!keepHistory) backend.saved.quiz_state.answered = {};
  await page.goto("/");
  await openSession(page, "Quiz");
  await expect(page.getByText(keepHistory ? "Today's quiz is complete." : "No vocabulary is due today.", { exact: true })).toBeVisible();
  await expect.poll(() => backend.saved.quiz_state.queueIds).toEqual(keepHistory ? ["one"] : []);
  await expect.poll(() => backend.saved.quiz).toBe(keepHistory);
  await openSession(page, "Study");
  await expect(page.getByText("No study cards are due.", { exact: true })).toBeVisible();
  await expect.poll(() => backend.saved.study_state.cycleIds).toEqual([]);
  expect(backend.saved.add_note).toBe(true);
  expect(backend.saved.study).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
}

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
  expect(backend.writes[0]).toMatchObject({ add_note: true, study: true });
  expect(backend.writes[0]).not.toHaveProperty("quiz");
  expect(backend.saved.quiz_state.answered.one.correct).toBe(true);
  expect(backend.saved.study_state.cardIndex).toBe(1);
});

test("local midnight resets Today, Quiz and Study without rewriting yesterday", async ({ page, context, baseURL }) => {
  const beforeMidnight = new Date();
  beforeMidnight.setHours(23, 59, 0, 0);
  await page.clock.install({ time: beforeMidnight });
  const backend = await setupLearning({ page, context, baseURL }, { sync: false });
  const yesterday = structuredClone(backend.saved);
  await page.goto("/");
  await openSession(page, "Study");
  await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByText("Card 1 of 4", { exact: true })).toBeVisible();
  await openSession(page, "Quiz");
  await expect(page.getByText("0/4", { exact: true })).toBeVisible();
  await openSession(page, "Today");
  await expect(page.getByRole("status", { name: "0 of 3 tasks done", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(globalThis.readSavedDaily()))).toEqual(yesterday);
  const today = await page.evaluate(async (id) => {
    const { getTodayKey } = await import("/src/utils/quiz.js");
    return JSON.parse(localStorage.getItem(`french-learning-daily-learning-state-v1:${id}:${getTodayKey()}`));
  }, user.id);
  expect(today.quiz_state.answered).toEqual({});
  expect(today.study_state.cardIndex).toBe(0);
  expect(today.study_state.date).not.toBe(yesterday.study_state.date);
  expect(backend.writes).toEqual([]);
});

for (const event of ["visibilitychange", "pageshow"]) {
  test(`overnight resume via ${event} hydrates the new day and preserves a pending old-day save`, async ({ page, context, baseURL }) => {
    await page.clock.install();
    const backend = await setupLearning({ page, context, baseURL });
    backend.saveGate = deferred();
    await page.goto("/");
    await openSession(page, "Study");
    await page.getByRole("button", { name: "Show front", exact: true }).click();
    await expect.poll(() => backend.writes.length).toBe(1);
    const tomorrow = await page.evaluate(() => { const date = new Date(); date.setDate(date.getDate() + 1); return date.getTime(); });
    await page.clock.setSystemTime(tomorrow);
    await page.evaluate((event) => (event === "visibilitychange" ? globalThis.document : globalThis).dispatchEvent(new Event(event)), event);
    await expect(page.getByText("Card 1 of 4", { exact: true })).toBeVisible();
    backend.saveGate.resolve();
    await expect.poll(() => backend.saved.study_state.isFlipped).toBe(false);
    expect(backend.saved.study_state.cardIndex).toBe(1);
    expect(backend.saved.study_state.date).toBe(backend.writes[0].date);
    await expect.poll(() => Object.values(backend.days).length).toBe(1);
    const [today] = Object.values(backend.days);
    expect(today.study_state.cardIndex).toBe(0);
    expect(today.study_state.date).not.toBe(backend.saved.study_state.date);
    await openSession(page, "Today");
    await expect(page.getByRole("status", { name: "0 of 3 tasks done", exact: true })).toBeVisible();
  });
}

for (const name of ["Quiz", "Study"]) {
  test(`${name} coalesces newer state behind a delayed save instead of racing it`, async ({ page, context, baseURL }) => {
    const backend = await setupLearning({ page, context, baseURL });
    backend.saveGate = deferred();
    await page.goto("/");
    await openSession(page, name);
    if (name === "Study") {
      await page.getByRole("button", { name: "Show front", exact: true }).click();
      await expect.poll(() => backend.writes.length).toBe(1);
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByText("Card 3 of 3", { exact: true })).toBeVisible();
    } else {
      await page.getByRole("button", { name: "Show correct answer", exact: true }).click();
      await expect.poll(() => backend.writes.length).toBe(1);
      await page.getByRole("button", { name: "Next word", exact: true }).click();
      await page.getByRole("button", { name: "Show correct answer", exact: true }).click();
      await expect(page.getByText("3/3", { exact: true })).toBeVisible();
    }
    expect(backend.writes).toHaveLength(1);
    backend.saveGate.resolve();
    await expect.poll(() => backend.writes.length).toBe(2);
    await expect.poll(() => name === "Study" ? backend.saved.study_state.cardIndex : Object.keys(backend.saved.quiz_state.answered).length).toBe(name === "Study" ? 2 : 3);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

for (const failure of ["read", "write"]) {
  test(`local storage ${failure} failure during saving is observable and retries the latest state`, async ({ page, context, baseURL }) => {
    const backend = await setupLearning({ page, context, baseURL }, { sync: false });
    await page.goto("/");
    await openSession(page, "Study");
    await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
    await page.evaluate((failure) => { globalThis[failure === "read" ? "failDailyStorageRead" : "failDailyStorageWrite"] = true; }, failure);
    await page.getByRole("button", { name: "Show front", exact: true }).click();
    const error = page.getByRole("alert").filter({ hasText: "Some learning progress is not saved." });
    await expect(error).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(globalThis.readSavedDaily()))).toEqual(backend.saved);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.evaluate(() => { globalThis.failDailyStorageRead = false; globalThis.failDailyStorageWrite = false; });
    await error.getByRole("button", { name: "Retry saving", exact: true }).click();
    await expect(error).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(globalThis.readSavedDaily()).study_state.cardIndex)).toBe(2);
  });
}

test("cloud save failure retains pending changes and recovers explicitly", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.failWrites = true;
  await page.goto("/");
  await openSession(page, "Study");
  await page.getByRole("button", { name: "Show front", exact: true }).click();
  const error = page.getByRole("alert").filter({ hasText: "Some learning progress is not saved." });
  await expect(error).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  expect(backend.writes).toHaveLength(1);
  backend.failWrites = false;
  await error.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect.poll(() => backend.saved.study_state.cardIndex).toBe(2);
});

test("rapid independent task completions merge in cloud storage", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.saved.add_note = false;
  backend.saved.study = false;
  await page.goto("/");
  await expect(page.getByRole("status", { name: "0 of 3 tasks done", exact: true })).toBeVisible();
  await page.evaluate(async ({ id, date }) => {
    const { updateDailyProgress } = await import("/src/api/dailyLearning.js");
    await Promise.all(["addNote", "study", "quiz"].map((task) => updateDailyProgress(id, { date, [task]: true })));
  }, { id: user.id, date: backend.saved.quiz_state.date });
  expect(backend.saved).toMatchObject({ add_note: true, study: true, quiz: true });
  expect(backend.writes.every((patch) => !Object.values(patch).includes(false))).toBe(true);
});

test("two local tabs preserve independent goals and reject a stale session overwrite", async ({ page, context, baseURL }) => {
  await setupLearning({ page, context, baseURL }, { sync: false });
  const other = await context.newPage();
  await setupLearning({ page: other, context, baseURL }, { sync: false });
  await page.goto("/");
  await other.goto("/");
  await openSession(page, "Study");
  await openSession(other, "Study");
  await expect(other.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(globalThis.readSavedDaily()).study_state.cardIndex)).toBe(2);
  await other.getByRole("button", { name: "Show front", exact: true }).click();
  const error = other.getByRole("alert").filter({ hasText: "This session changed in another tab or device." });
  await expect(error).toBeVisible();
  expect(await other.evaluate(() => JSON.parse(globalThis.readSavedDaily()).study_state.cardIndex)).toBe(2);
  await Promise.all([page, other].map((tab, index) => tab.evaluate(async ({ id, task }) => {
    const { getTodayKey } = await import("/src/utils/quiz.js");
    const { updateDailyProgress } = await import("/src/api/dailyLearning.js");
    await updateDailyProgress(id, { date: getTodayKey(), [task]: true });
  }, { id: user.id, task: index ? "quiz" : "addNote" })));
  expect(await page.evaluate(() => JSON.parse(globalThis.readSavedDaily()))).toMatchObject({ add_note: true, quiz: true });
  other.on("dialog", (dialog) => dialog.accept());
  await error.getByRole("button", { name: "Reload saved progress", exact: true }).click();
  await openSession(other, "Study");
  await expect(other.getByText("Card 3 of 3", { exact: true })).toBeVisible();
  await expect(other.getByRole("alert")).toHaveCount(0);
});

test("cloud compare-and-set refuses a different device's changed session", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  await page.goto("/");
  await openSession(page, "Study");
  await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  backend.saved.study_state = { ...backend.saved.study_state, cardIndex: 2, isFlipped: false };
  const remote = structuredClone(backend.saved.study_state);
  await page.getByRole("button", { name: "Show front", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This session changed in another tab or device." })).toBeVisible();
  expect(backend.saved.study_state).toEqual(remote);
});

test("a lost cloud response is acknowledged before retrying newer Study changes", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.loseSaveResponse = true;
  await page.goto("/");
  await openSession(page, "Study");
  await page.getByRole("button", { name: "Show front", exact: true }).click();
  const error = page.getByRole("alert").filter({ hasText: "Some learning progress is not saved." });
  await expect(error).toBeVisible();
  expect(backend.saved.study_state.isFlipped).toBe(false);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await error.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect.poll(() => backend.saved.study_state.cardIndex).toBe(2);
});

test("concurrent creation of a cloud day preserves goals and both session fields", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  const initial = structuredClone(backend.saved);
  backend.saved = null;
  await page.goto("/");
  await expect(page.getByRole("status", { name: "0 of 3 tasks done", exact: true })).toBeVisible();
  await page.evaluate(async ({ id, initial }) => {
    const { updateDailyProgress, updateDailyQuizState, updateDailyStudyState } = await import("/src/api/dailyLearning.js");
    const options = { expected: {}, exists: false };
    await Promise.all([
      updateDailyQuizState(id, initial.quiz_state, options),
      updateDailyStudyState(id, initial.study_state, options),
      updateDailyProgress(id, { date: initial.quiz_state.date, addNote: true }),
    ]);
  }, { id: user.id, initial });
  expect(backend.saved).toMatchObject({ add_note: true, quiz_state: initial.quiz_state, study_state: initial.study_state });
});

test("Today distinguishes pending or failed notes from an empty notebook and recovers its task rows", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.saved.add_note = false;
  backend.saved.study = false;
  backend.notesGate = deferred();
  backend.failNotes = true;
  await page.goto("/");
  await backend.notesRead.promise;
  const study = page.getByRole("button", { name: /^Complete daily study Review/ });
  const quiz = page.getByRole("button", { name: /^Complete daily quiz Check/ });
  await expect(study).toBeDisabled();
  await expect(quiz).toBeDisabled();
  await expect(study).toContainText("Loading your notes and settings...");
  await expect(page.locator(".today-empty")).toHaveCount(0);
  backend.notesGate.resolve();
  const error = page.getByRole("alert").filter({ hasText: "Your notes could not be loaded." });
  await expect(error).toBeVisible();
  await expect(study).toContainText("Data unavailable");
  await expect(page.locator(".today-empty")).toHaveCount(0);
  backend.failNotes = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(study).toBeEnabled();
  await expect(quiz).toBeEnabled();
  await expect(study).toContainText("4 cards ready");
  expect(backend.writes).toEqual([]);
});

test("Today renders a genuinely empty notebook and completed goals from saved state without inventing progress", async ({ page, context, baseURL }) => {
  const backend = await setupLearning({ page, context, baseURL });
  backend.notes = [];
  backend.saved.add_note = false;
  backend.saved.study = false;
  await page.goto("/");
  await expect(page.getByRole("status", { name: "0 of 3 tasks done", exact: true })).toBeVisible();
  await expect(page.locator(".today-empty")).toContainText("Your notebook is still empty.");
  await expect(page.getByRole("button", { name: /^Complete daily study Review/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Complete daily quiz Check/ })).toBeDisabled();
  expect(backend.writes).toEqual([]);
  backend.saved.add_note = true;
  backend.saved.study = true;
  backend.saved.quiz = true;
  await page.reload();
  await expect(page.getByRole("status", { name: "3 of 3 tasks done", exact: true })).toBeVisible();
  await expect(page.getByText("Tout est fait.", { exact: true })).toBeVisible();
  expect(backend.writes).toEqual([]);
});
