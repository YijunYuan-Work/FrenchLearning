import { expect, test } from "@playwright/test";
import { VOCABULARY_CSV_HEADERS } from "../src/utils/importParsers.js";

const origin = "https://account-lifecycle.supabase.test";
const ids = { A: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

function sessionFor(user, expiresIn = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt, role: "authenticated" })}.test`,
    refresh_token: `refresh-${user.id}`, expires_at: expiresAt, expires_in: expiresIn, token_type: "bearer", user,
  };
}

async function setupAccounts({ page, context, baseURL }, { sync = true, delayInitialSession = false, ignoreAiCancellation = false, sessionLifetimeSeconds = 3600 } = {}) {
  const date = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const accounts = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, {
    user: { id, email: `${name.toLowerCase()}@demo.supabase.co`, user_metadata: { username: name.toLowerCase(), name: `Account ${name}` } },
    notes: [1, 2, 3].map((index) => ({
      id: `${name}-${index}`, user_id: id, category: "vocabulary", french: `${name}-word-${index}`,
      english: `${name}-meaning-${index}`, confidence: 1, part_of_speech: "interjection",
    })),
    daily: {
      add_note: false, study: name === "A", quiz: false,
      quiz_state: { date, limit: 23, queueIds: [`${name}-1`, `${name}-2`, `${name}-3`],
        answered: { [`${name}-1`]: { correct: true, answer: `${name}-meaning-1` } }, seenIds: [`${name}-1`, `${name}-2`, `${name}-3`] },
      study_state: { date, cardIndex: 1, cycleIds: [`${name}-1`, `${name}-2`, `${name}-3`],
        seenIds: [`${name}-1`, `${name}-2`, `${name}-3`], isFlipped: true, isStudyComplete: false },
    },
    preferences: { language: "en", quiz_vocabulary_limit: 23 },
  }]));
  const gates = new Map();
  const hits = new Map();
  const ledger = [];
  const waitFor = (key) => {
    if (!hits.has(key)) hits.set(key, deferred());
    return hits.get(key).promise;
  };
  const hold = (key) => {
    const gate = deferred();
    gates.set(key, gate);
    hits.set(key, deferred());
    return gate;
  };
  const failures = new Set();
  const lostNoteResponses = new Set();
  const failNoteOnce = new Set();
  const failedCreates = new Set();
  const failedDeletes = new Set();
  const lostDeleteResponses = new Set();
  const transport = { failCompletedQuiz: false, aiError: null, failNextCreate: false };

  if (ignoreAiCancellation) {
    // Keep real Auth, request and response handling, but simulate a transport
    // that cannot cancel. The editor must still discard obsolete completions.
    await page.route("**/src/components/EditorModal.jsx", async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace("import { autoFillFrenchVocabulary }", "import { autoFillFrenchVocabulary as requestAutoFill }")
        .replace("const inputClass =", "const autoFillFrenchVocabulary = (word, language, options) => requestAutoFill(word, language, { ...options, signal: undefined });\nconst inputClass =");
      await route.fulfill({ response, body });
    });
  }

  await page.route("**/src/lib/supabase.js", async (route) => {
    const response = await route.fetch();
    let body = (await response.text())
      .replace(/const supabaseUrl =[^;]*;/, `const supabaseUrl = ${JSON.stringify(origin)};`)
      .replace(/const supabasePublishableKey =[\s\S]*?;/, 'const supabasePublishableKey = "test-publishable-key";');
    if (delayInitialSession) {
      body += `
        const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
        let firstSession = true;
        supabase.auth.getSession = async (...args) => {
          const delay = firstSession; firstSession = false;
          const result = await originalGetSession(...args);
          if (delay) await new Promise((resolve) => { globalThis.releaseInitialSession = resolve; });
          return result;
        };`;
    }
    await route.fulfill({ response, body });
  });
  await page.route("**/src/api/dailyLearning.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/const dailyLearningSyncEnabled =[\s\S]*?;/,
      `const dailyLearningSyncEnabled = ${sync};`);
    await route.fulfill({ response, body });
  });

  const handle = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const token = request.headers().authorization?.replace(/^Bearer /, "");
    const subject = token?.includes(".") ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : null;
    const body = request.postDataJSON();
    const id = subject ?? Object.values(accounts).find((account) => account.user.email === body?.email)?.user.id;
    const account = accounts[id];
    const resource = url.pathname === "/api/autofill-vocabulary" ? "ai" : url.pathname.split("/").at(-1);
    const column = url.searchParams.get("select");
    const key = `${id}:${resource}:${request.method()}${resource === "user_preferences" ? `:${column}` : ""}`;
    const noteId = resource === "notes" ? url.searchParams.get("id")?.slice(3) : null;
    ledger.push({ id, resource, method: request.method(), body, column, noteId, filter: url.searchParams.get("user_id") });
    if (!hits.has(key)) hits.set(key, deferred());
    hits.get(key).resolve();
    const rowKey = noteId ?? (resource === "notes" && request.method() === "POST" ? body?.french : null);
    if (rowKey) {
      const scoped = `${key}:${rowKey}`;
      if (!hits.has(scoped)) hits.set(scoped, deferred());
      hits.get(scoped).resolve();
      await gates.get(scoped)?.promise;
    }
    await gates.get(key)?.promise;
    if (failures.has(key)) return route.fulfill({
      status: (resource === "user_preferences" && column === "language") || (resource === "notes" && request.method() === "PATCH") ? 400 : 500,
      json: { message: "Late account A failure" },
    });
    if (!account) return route.fulfill({ status: 401, json: { message: "No synthetic account" } });
    if (url.pathname === "/auth/v1/user") {
      if (request.method() === "PUT") {
        if (body.data) account.user.user_metadata = body.data;
        if (body.password) account.passwordChanged = true;
      }
      return route.fulfill({ json: account.user });
    }
    if (url.pathname === "/auth/v1/token") return route.fulfill({ json: sessionFor(account.user) });
    if (resource === "notes") {
      if (request.method() === "GET") return route.fulfill({ json: account.notes });
      if (request.method() === "DELETE") {
        expect(url.searchParams.get("user_id")).toBe(`eq.${id}`);
        if (failedDeletes.has(`${id}:${noteId}`)) return route.fulfill({ status: 400, json: { message: "Delete failed" } });
        account.notes = account.notes.filter((note) => note.id !== noteId);
        if (lostDeleteResponses.delete(`${id}:${noteId}`)) return route.abort("connectionfailed");
        return route.fulfill({ status: 204 });
      }
      if (request.method() === "PATCH") {
        if (failNoteOnce.delete(`${id}:${noteId}`)) return route.fulfill({ status: 400, json: { message: "Confidence save failed" } });
        expect(url.searchParams.get("user_id")).toBe(`eq.${id}`);
        const index = account.notes.findIndex((note) => note.id === noteId);
        if (index < 0) return route.fulfill({ status: 404, json: { message: "Note missing" } });
        account.notes[index] = { ...account.notes[index], ...body };
        if (lostNoteResponses.delete(`${id}:${noteId}`)) {
          return route.fulfill({ status: 400, json: { message: "Response lost after note commit" } });
        }
        return route.fulfill({ json: account.notes[index] });
      }
      expect(body.user_id).toBe(id);
      if (failedCreates.has(body.french)) return route.fulfill({ status: 400, json: { message: "Import row save failed" } });
      if (transport.failNextCreate) {
        transport.failNextCreate = false;
        return route.fulfill({ status: 400, json: { message: "Note save failed" } });
      }
      const note = { ...body, id: `saved-${body.french}` };
      account.notes.push(note);
      return route.fulfill({ json: note });
    }
    if (resource === "daily_learning_state") {
      if (request.method() === "GET") return route.fulfill({ json: [account.daily] });
      if (transport.failCompletedQuiz && Object.values(body.quiz_state?.answered ?? {}).some((result) => result.status === "complete")) {
        return route.fulfill({ status: 400, json: { message: "Quiz result save failed" } });
      }
      expect(body.user_id).toBe(id);
      account.daily = { ...account.daily, ...body };
      return route.fulfill({ json: account.daily });
    }
    if (resource === "user_preferences") {
      if (request.method() !== "GET") {
        expect(body.user_id).toBe(id);
        account.preferences = { ...account.preferences, ...body };
      }
      return route.fulfill({ json: request.method() === "GET" ? [account.preferences] : account.preferences });
    }
    if (resource === "ai") {
      if (transport.aiError) return route.fulfill({ status: 429, json: transport.aiError });
      return route.fulfill({ json: {
        category: "vocabulary", word: body.word, english: body.language === "zh" ? "中文释义" : "AI meaning",
        partOfSpeech: "verb", tags: ["AI topic"], notes: body.language === "zh" ? "中文笔记" : "AI notes",
        ipa: "/test/", example: "AI example", conjugation: { je: "AI form" },
      } });
    }
    return route.fulfill({ json: [] });
  };
  await page.route(`${origin}/**`, handle);
  await page.route("**/api/autofill-vocabulary", handle);

  const session = sessionFor(accounts[ids.A].user, sessionLifetimeSeconds);
  await context.addCookies([
    { name: "sb-account-lifecycle-auth-token.chunks", value: "1", url: baseURL },
    { name: "sb-account-lifecycle-auth-token.0", value: encodeURIComponent(JSON.stringify(session)), url: baseURL },
  ]);
  const initialDaily = Object.fromEntries(Object.entries(accounts).map(([id, account]) => [id, account.daily]));
  await page.addInitScript(({ initialDaily, date }) => {
    for (const [id, daily] of Object.entries(initialDaily)) {
      const key = `french-learning-daily-learning-state-v1:${id}:${date}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(daily));
    }
  }, { initialDaily, date });

  const switchTo = async (name) => {
    await page.evaluate(async (session) => {
      const { supabase } = await import("/src/lib/supabase.js");
      const { error } = await supabase.auth.setSession(session);
      if (error) throw error;
    }, sessionFor(accounts[ids[name]].user));
    await expect(page.getByRole("heading", { name: new RegExp(`Bonjour, Account ${name}\\.`) })).toBeVisible();
  };
  const writes = (id) => ledger.filter((entry) => entry.id === id && entry.method !== "GET" && entry.resource !== "token");
  return { accounts, ledger, hold, waitFor, failures, lostNoteResponses, failNoteOnce, failedCreates, failedDeletes, lostDeleteResponses, transport, switchTo, writes, date };
}

async function addNote(page, french) {
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("French", { exact: true }).fill(french);
  await editor.getByLabel("English", { exact: true }).fill("temporary meaning");
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
}

async function go(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
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

const languageRequests = (backend, id, method) => backend.ledger.filter((entry) =>
  entry.id === id && entry.resource === "user_preferences" && entry.column === "language" && entry.method === method);
const languageCache = (page, id) => page.evaluate((id) => localStorage.getItem(`french-learning-language:${id}`), id);

test("delayed language hydration loads once across navigation and same-account refresh", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].preferences.language = "zh";
  const gate = backend.hold(`${ids.A}:user_preferences:GET:language`);
  await page.goto("/");
  await backend.waitFor(`${ids.A}:user_preferences:GET:language`);
  await expect(page.getByRole("button", { name: "简体中文", exact: true })).toBeVisible();
  expect(languageRequests(backend, ids.A, "POST")).toEqual([]);
  gate.resolve();
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "词汇", exact: true }).click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await backend.switchTo("A");
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
  expect(languageRequests(backend, ids.A, "POST")).toEqual([]);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("en");
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
});

test("choices made during hydration win, including returning to the initial displayed language", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].preferences.language = "zh";
  const gate = backend.hold(`${ids.A}:user_preferences:GET:language`);
  await page.goto("/");
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(languageRequests(backend, ids.A, "POST")).toEqual([]);
  gate.resolve();
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("en");
  await expect(page.getByRole("button", { name: "简体中文", exact: true })).toBeVisible();
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
  expect(languageRequests(backend, ids.A, "POST").map((entry) => entry.body.language)).toEqual(["en"]);
});

test("rapid toggles cannot produce out-of-order writes and the final choice survives refresh", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await expect.poll(() => languageCache(page, ids.A)).toBe("en");
  const gate = backend.hold(`${ids.A}:user_preferences:POST:language`);
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await backend.waitFor(`${ids.A}:user_preferences:POST:language`);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(languageRequests(backend, ids.A, "POST")).toHaveLength(1);
  gate.resolve();
  await expect.poll(() => languageRequests(backend, ids.A, "POST").length).toBe(2);
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("en");
  expect(languageRequests(backend, ids.A, "POST").map((entry) => entry.body.language)).toEqual(["zh", "en"]);
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
  await expect(page.getByRole("button", { name: "简体中文", exact: true })).toBeVisible();
  // Persist Chinese as well, so refresh tests a non-default saved preference.
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("zh");
  await page.reload();
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(2);
  expect(languageRequests(backend, ids.A, "POST")).toHaveLength(3);
});

test("a delayed language auth check does not trigger another preference hydration", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await expect.poll(() => languageCache(page, ids.A)).toBe("en");
  const gate = backend.hold(`${ids.A}:user:GET`);
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await backend.waitFor(`${ids.A}:user:GET`);
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
  expect(languageRequests(backend, ids.A, "POST")).toEqual([]);
  gate.resolve();
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("zh");
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
});

test("a failed language read keeps user intent and retries without a destructive default save", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const key = `${ids.A}:user_preferences:GET:language`;
  backend.failures.add(key);
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Your saved language could not be loaded." })).toBeVisible();
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  expect(languageRequests(backend, ids.A, "POST")).toEqual([]);
  expect(backend.accounts[ids.A].preferences.language).toBe("en");
  backend.failures.delete(key);
  await page.getByRole("button", { name: "重试语言同步", exact: true }).click();
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("zh");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(2);
  expect(languageRequests(backend, ids.A, "POST")).toHaveLength(1);
});

test("a failed language save keeps the current choice and retries only the latest selection", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await expect.poll(() => languageCache(page, ids.A)).toBe("en");
  const key = `${ids.A}:user_preferences:POST:language`;
  backend.failures.add(key);
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试语言同步", exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].preferences.language).toBe("en");
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(languageRequests(backend, ids.A, "POST")).toHaveLength(1);
  backend.failures.delete(key);
  await page.getByRole("button", { name: "Retry language preference", exact: true }).click();
  await expect.poll(() => languageRequests(backend, ids.A, "POST").length).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(languageRequests(backend, ids.A, "POST").map((entry) => entry.body.language)).toEqual(["zh", "en"]);
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
  expect(backend.accounts[ids.A].preferences.language).toBe("en");
});

for (const operation of ["read", "auth-check", "write"]) {
  test(`a pending A language ${operation} cannot affect B's language, cache, or saved preference`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    backend.accounts[ids.B].preferences.language = "zh";
    const key = `${ids.A}:${operation === "read" ? "user_preferences:GET:language" : operation === "write" ? "user_preferences:POST:language" : "user:GET"}`;
    const gate = operation === "read" ? backend.hold(key) : null;
    await page.goto("/");
    let pending = gate;
    if (operation === "read") {
      await backend.waitFor(key);
    } else {
      await expect.poll(() => languageCache(page, ids.A)).toBe("en");
      pending = backend.hold(key);
      await page.getByRole("button", { name: "简体中文", exact: true }).click();
      await backend.waitFor(key);
      await page.getByRole("button", { name: "English", exact: true }).click();
    }
    await backend.switchTo("B");
    await expect.poll(() => languageCache(page, ids.B)).toBe("zh");
    const response = page.waitForResponse((response) => {
      const token = response.request().headers().authorization?.replace(/^Bearer /, "");
      const owner = token?.includes(".") ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : null;
      return response.url().includes(origin) && owner === ids.A &&
        new URL(response.url()).pathname.endsWith(operation === "auth-check" ? "/user" : "/user_preferences") &&
        response.request().method() === (operation === "write" ? "POST" : "GET");
    });
    pending.resolve();
    await response;
    await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
    expect(await languageCache(page, ids.B)).toBe("zh");
    expect(await languageCache(page, ids.A)).toBe(operation === "read" ? null : "en");
    expect(backend.accounts[ids.B].preferences.language).toBe("zh");
    expect(languageRequests(backend, ids.B, "POST")).toEqual([]);
    expect(languageRequests(backend, ids.A, "POST")).toHaveLength(operation === "write" ? 1 : 0);
    expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
    expect(languageRequests(backend, ids.B, "GET")).toHaveLength(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("demo language stays temporary with an authenticated account in the browser", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const cookies = await context.cookies();
  await page.goto("/#/demo");
  const storage = await page.evaluate(() => ({ ...localStorage }));
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
  expect(backend.ledger).toEqual([]);
  expect(await context.cookies()).toEqual(cookies);
  await page.reload();
  await expect(page.getByRole("button", { name: "简体中文", exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
  expect(backend.accounts[ids.A].preferences.language).toBe("en");
  expect(backend.ledger).toEqual([]);
});

test("returning to A waits for its old in-flight language write before hydrating and saving a new choice", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await expect.poll(() => languageCache(page, ids.A)).toBe("en");
  const gate = backend.hold(`${ids.A}:user_preferences:POST:language`);
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await backend.waitFor(`${ids.A}:user_preferences:POST:language`);
  await backend.switchTo("B");
  await expect.poll(() => languageCache(page, ids.B)).toBe("en");
  await backend.switchTo("A");
  // The cached choice is Chinese, but new explicit intent is English.
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(1);
  expect(languageRequests(backend, ids.A, "POST")).toHaveLength(1);
  gate.resolve();
  await expect.poll(() => languageRequests(backend, ids.A, "POST").length).toBe(2);
  await expect.poll(() => backend.accounts[ids.A].preferences.language).toBe("en");
  expect(languageRequests(backend, ids.A, "GET")).toHaveLength(2);
  expect(languageRequests(backend, ids.A, "POST").map((entry) => entry.body.language)).toEqual(["zh", "en"]);
  await expect(page.getByRole("button", { name: "简体中文", exact: true })).toBeVisible();
  expect(backend.accounts[ids.B].preferences.language).toBe("en");
  expect(languageRequests(backend, ids.B, "POST")).toEqual([]);
});

const notePatches = (backend, noteId) => backend.ledger.filter((entry) => entry.resource === "notes" && entry.method === "PATCH" && entry.noteId === noteId);
const storedNote = (backend, noteId) => backend.accounts[ids.A].notes.find((note) => note.id === noteId);
async function answerQuiz(page, answer) {
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
}

for (const manual of [false, true]) {
  test(`${manual ? "manual correction" : "correct answer"} waits for confidence persistence and retries without double advancement`, async ({ page, context, baseURL }) => {
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
test(`a committed confidence update with a lost response resumes target ${initialConfidence + 1} after refresh`, async ({ page, context, baseURL }) => {
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

test("rapid submissions and consecutive Quiz answers advance each note only once", async ({ page, context, baseURL }) => {
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
  test(`${confidenceFirst ? "confidence then edit" : "edit then confidence"} saves do not replace newer fields`, async ({ page, context, baseURL }) => {
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
    await expect(page.getByRole("dialog").getByRole("combobox", { name: "Confidence", exact: true })).toHaveValue("2");
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

test("different note confidence responses can finish out of order without losing edits", async ({ page, context, baseURL }) => {
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

test("a failed confidence operation cannot roll back the edit queued behind it", async ({ page, context, baseURL }) => {
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

test("switching accounts cancels a queued note edit and preserves the old account's pending Quiz target", async ({ page, context, baseURL }) => {
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

test("a failed final Quiz write recovers after refresh without increasing confirmed confidence again", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.transport.failCompletedQuiz = true;
  await page.goto("/");
  await go(page, "Quiz");
  await answerQuiz(page, "A-meaning-2");
  await expect(page.getByRole("button", { name: "Retry saving answer", exact: true })).toBeVisible();
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

test("a pending intent in local daily storage survives a committed note response failure", async ({ page, context, baseURL }) => {
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

test("a correct demo Quiz answer changes only disposable demo confidence", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const original = structuredClone(backend.accounts);
  await page.goto("/#/demo");
  const storage = await page.evaluate(() => ({ ...localStorage }));
  await go(page, "Quiz");
  const question = page.locator("form p.text-3xl");
  const french = await question.textContent();
  const note = await page.evaluate(async (french) => {
    const { demoNotes } = await import("/src/data/demoData.js");
    const { getAcceptedMeanings } = await import("/src/utils/quiz.js");
    const note = demoNotes.find((note) => note.french === french);
    return { ...note, acceptedAnswer: getAcceptedMeanings(note.english)[0] };
  }, french);
  await page.getByLabel("Your answer", { exact: true }).fill(note.acceptedAnswer);
  if (note.partOfSpeech === "noun" && note.gender) await page.getByRole("combobox", { name: "Gender", exact: true }).selectOption(note.gender);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText(`Confidence advanced to ${Math.min(4, note.confidence + 1)}.`, { exact: true })).toBeVisible();
  expect(backend.accounts).toEqual(original);
  expect(backend.ledger).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
});

const noteDeletes = (backend, owner = ids.A) => backend.writes(owner).filter((entry) => entry.resource === "notes" && entry.method === "DELETE");

async function deleteSelection(page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
}

for (const fails of [false, true]) {
  test(`bulk deletion ${fails ? "keeps every failed note selected" : "removes every successful note and survives refresh"}`, async ({ page, context, baseURL }) => {
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
      for (let index = 1; index <= 3; index += 1) await expect(page.getByRole("button", { name: `Unselect A-word-${index}`, exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Retry failed deletions", exact: true })).toHaveCount(0);
    }
    await page.reload();
    await go(page, "Vocabulary");
    await expect(page.getByRole("article")).toHaveCount(fails ? 3 : 0);
  });
}

test("partial deletion reconciles successes before the last response and retries only failures", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.failedDeletes.add(`${ids.A}:A-2`);
  const gate = backend.hold(`${ids.A}:notes:DELETE:A-3`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select page");
  await deleteSelection(page);
  await expect(page.getByRole("heading", { name: "A-word-1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Deleting notes...");
  gate.resolve();
  await expect(page.getByRole("status")).toContainText("Deleted: 2. Failed: 1.");
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unselect A-word-2", exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-2"]);
  backend.failedDeletes.clear();
  page.once("dialog", (dialog) => dialog.accept());
  await go(page, "Retry failed deletions");
  await expect(page.getByRole("status")).toHaveText("Deleted: 1. Failed: 0.");
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(backend.accounts[ids.A].notes).toEqual([]);
  expect(noteDeletes(backend).map((entry) => entry.noteId).sort()).toEqual(["A-1", "A-2", "A-2", "A-3"]);
});

test("rapid repeated delete actions issue one job and stay locked across navigation", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:DELETE`);
  let confirmations = 0;
  page.on("dialog", async (dialog) => { confirmations += 1; await dialog.accept(); });
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select page");
  await page.getByRole("button", { name: "Delete selected", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => noteDeletes(backend).length).toBe(3);
  expect(confirmations).toBe(1);
  for (const name of ["Delete selected", "Clear selection", "Unselect page", "Delete A-word-1", "Unselect A-word-1"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
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

test("late deletes never affect another account and rehydration waits for the original account's deletes", async ({ page, context, baseURL }) => {
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
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1", "A-3"]);
  expect(backend.accounts[ids.B]).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

test("bulk deletes wait for pending Quiz updates and removed notes stay out of Quiz and Study after refresh", async ({ page, context, baseURL }) => {
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
  await card.getByRole("button", { name: "I know this", exact: true }).click();
  await expect(page.getByText("This note is being deleted. Wait before editing it.", { exact: true })).toBeVisible();
  gate.resolve();
  await expect(page.getByRole("status")).toHaveText("Deleted: 2. Failed: 0.");
  expect(notePatches(backend, "A-2")).toHaveLength(1);
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1"]);
  await go(page, "Quiz");
  await expect(page.getByRole("heading", { name: "Today's quiz is complete.", exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.quiz_state.queueIds).toEqual(["A-1"]);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].status).toBe("pending");
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

test("a delete queued behind an update is cancelled if the account changes before it starts", async ({ page, context, baseURL }) => {
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
  await expect(page.getByRole("button", { name: "Unselect B-word-1", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await backend.switchTo("A");
  await go(page, "Vocabulary");
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toBeVisible();
  expect(noteDeletes(backend)).toEqual([]);
  expect(backend.accounts[ids.B]).toEqual(originalB);
  expect(backend.writes(ids.B)).toEqual([]);
});

test("a pending editor response cannot restore a note deleted in the same bulk job", async ({ page, context, baseURL }) => {
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

test("a lost delete response is reported as a failure and can be retried idempotently", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  backend.lostDeleteResponses.add(`${ids.A}:A-2`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Select A-word-2");
  await deleteSelection(page);
  await expect(page.getByRole("status")).toContainText("Deleted: 0. Failed: 1.");
  await expect(page.getByRole("button", { name: "Unselect A-word-2", exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].notes.map((note) => note.id)).toEqual(["A-1", "A-3"]);
  page.once("dialog", (dialog) => dialog.accept());
  await go(page, "Retry failed deletions");
  await expect(page.getByRole("status")).toHaveText("Deleted: 1. Failed: 0.");
  await expect(page.getByRole("heading", { name: "A-word-2", exact: true })).toHaveCount(0);
  expect(noteDeletes(backend)).toHaveLength(2);
});

test("demo bulk deletion changes only temporary notes, not the ambient account or storage", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const original = structuredClone(backend.accounts);
  await page.goto("/#/demo");
  const storage = await page.evaluate(() => ({ ...localStorage }));
  await go(page, "Phrases");
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

async function openDraft(page, french = "bonjour") {
  await go(page, "Add note");
  const editor = page.getByRole("dialog");
  await editor.getByLabel("French", { exact: true }).fill(french);
  return editor;
}

const aiRequests = (backend) => backend.ledger.filter((entry) => entry.resource === "ai");

test("an obsolete word's uncancellable response cannot replace a new request or its loading state", async ({ page, context, baseURL }) => {
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

test("manual field edits during autofill survive in both the form and saved note", async ({ page, context, baseURL }) => {
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
  await editor.getByRole("combobox", { name: "Confidence", exact: true }).selectOption("3");
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
  test(`changing the ${change} invalidates pending autofill, even when returning to the original context`, async ({ page, context, baseURL }) => {
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
      await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption("grammar");
      await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption("vocabulary");
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

test("closing and reopening the same word discards uncancellable AI errors and allows a Chinese retry", async ({ page, context, baseURL }) => {
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

test("switching directly between notes creates a fresh editor identity for pending AI", async ({ page, context, baseURL }) => {
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
  test(`rapid repeated ${editing ? "edit" : "create"} submissions perform one write and show saving state`, async ({ page, context, baseURL }) => {
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

test("failed Save keeps the draft, unlocks controls, and allows one successful retry", async ({ page, context, baseURL }) => {
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
  test(`a late same-account save ${fails ? "failure" : "success"} cannot affect a different editor's pending save`, async ({ page, context, baseURL }) => {
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

test("saving cancels pending autofill and persists only the submitted draft", async ({ page, context, baseURL }) => {
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

test("cancelling autofill during delayed Auth preflight sends no AI request", async ({ page, context, baseURL }) => {
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

test("AI quota errors remain actionable without automatic retry or changing the draft", async ({ page, context, baseURL }) => {
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

function importCsv(mode, rows, ending = "\n", prefix = "") {
  const headers = mode === "vocabulary" ? VOCABULARY_CSV_HEADERS : ["french", "translation", "tags"];
  const escape = (value = "") => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return prefix + [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(","))].join(ending);
}

function importRow(french, extra = {}) {
  return { french, chinese: "中文释义", translation: "中文翻译", part_of_speech: "interjection", ...extra };
}

async function uploadCsv(page, text, name = "import.csv") {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
}

async function expectBatch(page, added, skipped, failed, unprocessed) {
  await expect(page.getByRole("status").filter({ hasText: "Batch:" })).toContainText(
    `Batch: ${added + skipped + failed + unprocessed}. Added: ${added}. Skipped: ${skipped}. Failed: ${failed}. Unprocessed: ${unprocessed}.`);
}

const noteCreates = (backend) => backend.writes(ids.A).filter((entry) => entry.resource === "notes" && entry.method === "POST");

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
  await expect(page.getByText("0/3", { exact: true })).toBeVisible();
  await go(page, "Import");
  await go(page, "Resume unprocessed rows");
  await expectBatch(page, 3, 0, 0, 0);
  await expect.poll(() => backend.accounts[ids.A].daily.add_note).toBe(true);
  const goals = backend.writes(ids.A).filter((entry) => entry.resource === "daily_learning_state" && entry.body?.add_note);
  expect(goals).toHaveLength(2);
  expect(new Set(goals.map((entry) => entry.body.date)).size).toBe(2);
  expect(noteCreates(backend)).toHaveLength(3);
});
