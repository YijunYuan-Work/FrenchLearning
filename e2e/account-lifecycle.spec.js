import { expect, test } from "@playwright/test";
import { VOCABULARY_CSV_HEADERS } from "../src/utils/importParsers.js";
import { libraryRows } from "./fixtures/library-data.js";

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
  const transport = { failCompletedQuiz: false, aiError: null, aiStatus: 429, aiRaw: undefined, failNextCreate: false };

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
    ledger.push({ id, resource, method: request.method(), body, column, noteId, filter: url.searchParams.get("user_id"), categoryFilter: url.searchParams.get("category") });
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
        if (url.searchParams.get("category") && (index < 0 || `eq.${account.notes[index].category}` !== url.searchParams.get("category"))) {
          return route.fulfill({ status: 406, json: { code: "PGRST116", message: "No eligible Vocabulary row" } });
        }
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
      if (transport.aiRaw !== undefined) return route.fulfill({ status: transport.aiStatus, contentType: "text/html", body: transport.aiRaw });
      if (transport.aiError) return route.fulfill({ status: transport.aiStatus, json: transport.aiError });
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
  await page.getByRole("button", { name, exact: true }).or(page.getByRole("checkbox", { name, exact: true })).click();
  if (name.startsWith("Delete ") || name === "Retry failed deletions") await page.getByRole("alertdialog").getByRole("button", { name: "Confirm deletion", exact: true }).click();
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

async function changeQuizNoteCategory(page, french, category) {
  await go(page, "Vocabulary");
  await go(page, `Edit ${french}`);
  const editor = page.getByRole("dialog");
  await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption(category);
  if (category === "grammar") await editor.getByRole("textbox", { name: "Grammar note", exact: true }).fill("A grammar explanation.");
  await go(page, "Save note");
  await expect(editor).toHaveCount(0);
}

for (const category of ["phrases", "grammar", "pronunciation"]) {
  test(`saved Quiz removes a Vocabulary note moved to ${category} and resumes the valid order`, async ({ page, context, baseURL }) => {
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

test("Quiz retains completed history and counts after moves and deletion while pruning mixed invalid questions", async ({ page, context, baseURL }) => {
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

test("a category edit before pending answer intent is acknowledged prevents any Quiz confidence write", async ({ page, context, baseURL }) => {
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

test("a Quiz answer queued behind a category save is rejected before its confidence PATCH starts", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const gate = backend.hold(`${ids.A}:notes:PATCH:A-2`);
  await page.goto("/");
  await go(page, "Vocabulary");
  await go(page, "Edit A-word-2");
  const editor = page.getByRole("dialog");
  await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption("phrases");
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
  test(`an in-flight Quiz update cannot advance a remotely reclassified note${switchAccount ? " across account switching" : ""}`, async ({ page, context, baseURL }) => {
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

test("demo Quiz reconciles reclassified questions without account or backend writes", async ({ page, context, baseURL }) => {
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

test("Quiz notebook keyboard flow preserves real saves, feedback and completion", async ({ page, context, baseURL }, testInfo) => {
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
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
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
  await shot("desktop-complete-chinese");
  await page.setViewportSize({ width: 370, height: 736 });
  await shot("mobile-complete-chinese");
  await page.getByRole("button", { name: "开始新的测验", exact: true }).click();
  await expect(page.getByTestId("quiz-word")).toContainText("inédit-");
  await expect.poll(() => account.daily.quiz_state.queueIds.every((id) => id.startsWith("unseen-"))).toBe(true);
  expect(errors).toEqual([]);
});

test("mobile Quiz follows the visible viewport, bilingual controls and reduced motion", async ({ page, context, baseURL }, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath("mobile-question-chinese.png") });
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
  await page.screenshot({ path: testInfo.outputPath("mobile-keyboard-chinese.png"), clip: { x: 0, y: 0, width: 370, height: 452 } });
  await check.click();
  const next = page.getByRole("button", { name: "下一个词", exact: true });
  await expect(next).toBeFocused();
  expect(storedNote(backend, "A-2").confidence).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(globalThis.visualViewport, "height", { configurable: true, value: 736 });
    globalThis.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.screenshot({ path: testInfo.outputPath("mobile-correct-chinese.png") });
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

test("the maximum configured Quiz fits its complete segmented ledger on a narrow phone", async ({ page, context, baseURL }) => {
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

const noteDeletes = (backend, owner = ids.A) => backend.writes(owner).filter((entry) => entry.resource === "notes" && entry.method === "DELETE");

test("library search, type, tags, sort and pagination preserve cross-page selection and confirmed deletion", async ({ page, context, baseURL }) => {
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

test("grammar reader follows filters, deletion and confidence without changing sanitized HTML", async ({ page, context, baseURL }) => {
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

test("a library confirmation cancels safely on Escape and account change before any delete", async ({ page, context, baseURL }) => {
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

test("mobile bilingual libraries retain filter sheets, actions, reader navigation and bottom tabs", async ({ page, context, baseURL }) => {
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

test("partial deletion reconciles successes before the last response and retries only failures", async ({ page, context, baseURL }, testInfo) => {
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

test("rapid repeated delete actions issue one job and stay locked across navigation", async ({ page, context, baseURL }) => {
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
  await expect(page.getByRole("region", { name: "Selected notes", exact: true })).toHaveCount(0);
  await expect(page.locator('.library-checkbox input:checked')).toHaveCount(0);
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
  await expect(page.getByRole("checkbox", { name: "Unselect B-word-1", exact: true })).toBeVisible();
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
  await expect(page.getByRole("checkbox", { name: "Unselect A-word-2", exact: true })).toBeVisible();
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

for (const failure of ["timeout", "invalid-response", "non-json", "null-json", "connection"]) {
  test(`AI ${failure} preserves the draft and allows one explicit retry`, async ({ page, context, baseURL }) => {
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

test("Chinese editor localizes upstream errors and keeps a manual retry available", async ({ page, context, baseURL }) => {
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

for (const demo of [false, true]) {
  test(`${demo ? "demo" : "authenticated"} editor validates category requirements and duplicates without losing drafts`, async ({ page, context, baseURL }) => {
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
    await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption("phrases");
    await editor.getByRole("textbox", { name: "Translation", exact: true }).fill("   ");
    await go(page, "Save note");
    await expect(editor.getByText("Enter a meaning or translation, not just spaces.", { exact: true })).toBeVisible();
    await editor.getByRole("textbox", { name: "Translation", exact: true }).fill("a phrase translation");
    await go(page, "Save note");
    await expect(editor).toHaveCount(0);
    await go(page, "Add note");
    await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption("grammar");
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

test("grammar paste is safe and preserves spacing, lists, tables and entities after Save Reload Edit", async ({ page, context, baseURL }) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await go(page, "Add note");
  const editor = page.getByRole("dialog");
  await editor.getByRole("combobox", { name: "Section", exact: true }).selectOption("grammar");
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

test("malformed legacy rows are isolated without mutating stored data or crashing learning views", async ({ page, context, baseURL }) => {
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
  await expect(editor.getByRole("combobox", { name: "Confidence", exact: true })).toHaveValue("1");
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

test("note API rejects invalid writes before the backend and confidence patches remain narrow", async ({ page, context, baseURL }) => {
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
