import { expect } from "@playwright/test";

export const origin = "https://account-lifecycle.supabase.test";
export const ids = { A: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

function deferred() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

export function sessionFor(user, expiresIn = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt, role: "authenticated" })}.test`,
    refresh_token: `refresh-${user.id}`, expires_at: expiresAt, expires_in: expiresIn, token_type: "bearer", user,
  };
}

export async function setupAccounts({ page, context, baseURL }, { sync = true, delayInitialSession = false, ignoreAiCancellation = false, sessionLifetimeSeconds = 3600 } = {}) {
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
    subscriptionTier: "free", autofillUsed: 3,
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
  const transport = { failCompletedQuiz: false, aiError: null, aiStatus: 429, aiRaw: undefined, failNextCreate: false, aiResult: null };

  if (ignoreAiCancellation) {
    // Keep real Auth, request and response handling, but simulate a transport
    // that cannot cancel. The editor must still discard obsolete completions.
    await page.route("**/src/components/EditorModal.jsx*", async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace("import { autoFillFrenchVocabulary }", "import { autoFillFrenchVocabulary as requestAutoFill }")
        .replace("const inputClass =", "const autoFillFrenchVocabulary = (word, language, options) => requestAutoFill(word, language, { ...options, signal: undefined });\nconst inputClass =");
      await route.fulfill({ response, body });
    });
  }

  await page.route("**/src/lib/supabase.js*", async (route) => {
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
  await page.route("**/src/api/dailyLearning.js*", async (route) => {
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
      status: resource === "user" || (resource === "user_preferences" && column === "language") || (resource === "notes" && request.method() === "PATCH") ? 400 : 500,
      json: { message: "Late account A failure", msg: "Late account A failure", code: "test_failure" },
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
    if (resource === "user_subscription_roles") return route.fulfill({ json: { subscription_tier: account.subscriptionTier } });
    if (resource === "ai_autofill_usage") return route.fulfill({ json: { request_count: account.autofillUsed } });
    if (resource === "ai") {
      if (transport.aiRaw !== undefined) return route.fulfill({ status: transport.aiStatus, contentType: "text/html", body: transport.aiRaw });
      if (transport.aiError) return route.fulfill({ status: transport.aiStatus, json: transport.aiError });
      return route.fulfill({ json: transport.aiResult ?? {
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

export async function go(page, name) {
  await page.getByRole("button", { name, exact: true }).or(page.getByRole("checkbox", { name, exact: true })).click();
  if (name.startsWith("Delete ") || name === "Retry failed deletions") await page.getByRole("alertdialog").getByRole("button", { name: "Confirm deletion", exact: true }).click();
}
