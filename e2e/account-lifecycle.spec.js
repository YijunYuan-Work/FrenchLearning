import { expect, test } from "@playwright/test";

const origin = "https://account-lifecycle.supabase.test";
const ids = { A: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

function sessionFor(user) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt, role: "authenticated" })}.test`,
    refresh_token: `refresh-${user.id}`, expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user,
  };
}

async function setupAccounts({ page, context, baseURL }, { sync = true, delayInitialSession = false } = {}) {
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
    ledger.push({ id, resource, method: request.method(), body, filter: url.searchParams.get("user_id") });
    if (!hits.has(key)) hits.set(key, deferred());
    hits.get(key).resolve();
    await gates.get(key)?.promise;
    if (failures.has(key)) return route.fulfill({ status: 500, json: { message: "Late account A failure" } });
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
      expect(body.user_id).toBe(id);
      const note = { ...body, id: `saved-${body.french}` };
      account.notes.push(note);
      return route.fulfill({ json: note });
    }
    if (resource === "daily_learning_state") {
      if (request.method() === "GET") return route.fulfill({ json: [account.daily] });
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
    if (resource === "ai") return route.fulfill({ json: {
      category: "vocabulary", word: "A-auto-result", english: "A meaning", partOfSpeech: "interjection", tags: [],
    } });
    return route.fulfill({ json: [] });
  };
  await page.route(`${origin}/**`, handle);
  await page.route("**/api/autofill-vocabulary", handle);

  const session = sessionFor(accounts[ids.A].user);
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
  return { accounts, ledger, hold, waitFor, failures, switchTo, writes, date };
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
  await go(page, "Study");
  await expect(page.getByRole("heading", { name: "B-word-2", exact: true })).toBeVisible();
  await expect.poll(() => backend.accounts[ids.A].daily.add_note).toBe(true);
  expect(backend.accounts[ids.A].daily.quiz_state.answered["A-2"].revealedAnswer).toBe(true);
  expect(backend.accounts[ids.A].daily.study_state.isFlipped).toBe(false);
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

for (const destination of ["B", "A"]) {
  test(`an old import stops on account change and cannot finish a new ${destination} import`, async ({ page, context, baseURL }) => {
    const backend = await setupAccounts({ page, context, baseURL });
    const oldGate = backend.hold(`${ids.A}:notes:POST`);
    await page.goto("/");
    await go(page, "Import");
    await page.getByRole("button", { name: "Short phrases", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "old.csv", mimeType: "text/csv", buffer: Buffer.from("french,translation\nold-first,first\nold-second,second") });
    await page.getByRole("button", { name: "Start import", exact: true }).click();
    await backend.waitFor(`${ids.A}:notes:POST`);
    await backend.switchTo("B");
    if (destination === "A") await backend.switchTo("A");
    const nextGate = backend.hold(`${ids[destination]}:notes:POST`);
    // The in-flight old row keeps its original gate; new requests use the new one.
    await go(page, "Import");
    await expect(page.getByText("old.csv", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Short phrases", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "new.csv", mimeType: "text/csv", buffer: Buffer.from("french,translation\nnew-only,new") });
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
