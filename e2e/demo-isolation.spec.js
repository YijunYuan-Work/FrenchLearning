import { expect, test } from "@playwright/test";

const backendOrigin = "https://demo-isolation.supabase.test";
const sessionKey = "sb-demo-isolation-auth-token";
const realUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "real-user@demo.supabase.co",
  user_metadata: { name: "Real Account", username: "real-user" },
};

async function configureBackend(page, { configured = true } = {}) {
  // Exercise the real client boundary without depending on .env.local or live services.
  await page.route("**/src/lib/supabase.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(
        /const supabaseUrl =[^;]*;/,
        `const supabaseUrl = ${configured ? JSON.stringify(backendOrigin) : "undefined"};`
      )
      .replace(
        /const supabasePublishableKey =[\s\S]*?;/,
        `const supabasePublishableKey = ${configured ? '"test-publishable-key"' : "undefined"};`
      );
    await route.fulfill({ response, body });
  });

  const requests = [];
  await page.route(`${backendOrigin}/**`, async (route) => {
    requests.push({ url: route.request().url(), method: route.request().method() });
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === "/auth/v1/user") body = realUser;
    if (url.pathname === "/rest/v1/user_preferences") {
      body = [{ language: "en", quiz_vocabulary_limit: 50 }];
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/autofill-vocabulary", async (route) => {
    requests.push({ url: route.request().url(), method: route.request().method() });
    await route.fulfill({ status: 500, json: { error: "AI must not be called by the demo." } });
  });
  return requests;
}

async function seedAccountSession(context, baseURL) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: realUser.id, exp: expiresAt, role: "authenticated",
  })}.test-signature`;
  const session = {
    access_token: token,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: realUser,
  };
  await context.addCookies([
    { name: `${sessionKey}.chunks`, value: "1", url: baseURL },
    { name: `${sessionKey}.0`, value: encodeURIComponent(JSON.stringify(session)), url: baseURL },
  ]);
}

async function attemptAccountOperations(page) {
  return page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const profile = await import("/src/api/profile.js");
    const preferences = await import("/src/api/preferences.js");
    const daily = await import("/src/api/dailyLearning.js");
    const { autoFillFrenchVocabulary } = await import("/src/services/vocabularyAutofill.js");
    const attempts = {
      profile: () => profile.updateUserProfile({ displayName: "Should not save", recoveryEmail: "" }),
      password: () => profile.changeUserPassword({ oldPassword: "old-password", newPassword: "new-password" }),
      language: () => preferences.updateLanguagePreference("real-user", "zh"),
      learning: () => preferences.updateLearningPreferences("real-user", { quizVocabularyLimit: 3 }),
      daily: () => daily.updateDailyProgress("real-user", { date: "2026-10-19", addNote: true }),
      dailyQuiz: () => daily.updateDailyQuizState("real-user", { date: "2026-10-19", queueIds: [] }),
      dailyStudy: () => daily.updateDailyStudyState("real-user", { date: "2026-10-19", cycleIds: [] }),
      ai: () => autoFillFrenchVocabulary("bonjour"),
      notes: () => supabase.from("notes").insert({ french: "blocked" }),
      quota: () => supabase.rpc("consume_ai_autofill_quota"),
    };
    const results = {};
    for (const [name, attempt] of Object.entries(attempts)) {
      try {
        const result = await attempt();
        results[name] = Boolean(result?.error);
      } catch {
        results[name] = true;
      }
    }
    return results;
  });
}

for (const signedIn of [false, true]) {
  test(`demo is disposable and blocks account operations (${signedIn ? "existing login" : "signed out"})`, async ({ page, context, baseURL }) => {
    const requests = await configureBackend(page);
    if (signedIn) await seedAccountSession(context, baseURL);
    const cookiesBefore = await context.cookies();
    await page.addInitScript(() => {
      localStorage.setItem("french-learning-language", "zh");
      localStorage.setItem("french-learning-daily-learning-state-v1:real-user:2026-10-19", "account-state");
    });

    await page.goto("/#/demo");
    await expect(page.getByRole("heading", { name: /Bonjour, Demo\./ })).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByText("Demo changes are temporary and reset when you reload.")).toBeVisible();
    await expect(page.getByText("AI auto-fill is unavailable in the public demo.")).toBeVisible();
    await page.getByLabel("Display name", { exact: true }).fill("Demo Visitor");
    await page.getByRole("textbox", { name: /^Recovery email optional/ }).fill("demo@example.test");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByText("Profile updated.", { exact: true })).toBeVisible();
    await page.getByLabel("Quiz vocabulary questions", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Save learning settings", exact: true }).click();
    await expect(page.getByText("Learning settings updated.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Current password", { exact: true })).toBeDisabled();
    const passwordButton = page.getByRole("button", { name: "Update password", exact: true });
    await expect(passwordButton).toBeDisabled();
    await passwordButton.evaluate((button) => button.form.requestSubmit());

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Bonjour, Demo Visitor\./ })).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Quiz vocabulary questions", { exact: true })).toHaveValue("3");
    await expect(page.getByRole("textbox", { name: /^Recovery email optional/ })).toHaveValue("demo@example.test");

    await page.getByRole("button", { name: "Add note", exact: true }).click();
    const editor = page.getByRole("dialog");
    await editor.getByLabel("French", { exact: true }).fill("demo-isolation-word");
    await editor.getByLabel("English", { exact: true }).fill("temporary meaning");
    await expect(editor.getByRole("button", { name: "Auto-fill", exact: true })).toBeDisabled();
    await editor.getByRole("button", { name: "Save note", exact: true }).click();
    await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
    await expect(page.getByRole("heading", { name: "demo-isolation-word", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "简体中文", exact: true }).click();
    await page.getByRole("button", { name: "English", exact: true }).click();

    const results = await attemptAccountOperations(page);
    expect(Object.values(results)).toEqual(Array(10).fill(true));
    expect(requests).toEqual([]);
    expect(await context.cookies()).toEqual(cookiesBefore);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
      "french-learning-language": "zh",
      "french-learning-daily-learning-state-v1:real-user:2026-10-19": "account-state",
    });

    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Demo");
    await expect(page.getByLabel("Quiz vocabulary questions", { exact: true })).toHaveValue("50");
    await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
    await expect(page.getByRole("heading", { name: "demo-isolation-word", exact: true })).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(await context.cookies()).toEqual(cookiesBefore);
  });
}

test("switching between account and demo resets workspace ownership", async ({ page, context, baseURL }) => {
  const requests = await configureBackend(page);
  await seedAccountSession(context, baseURL);
  const cookiesBefore = await context.cookies();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Bonjour, Real Account\./ })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Real Account");
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const { error } = await supabase.auth.getUser();
    if (error) throw error;
  });

  await page.evaluate(() => { globalThis.location.hash = "/demo/"; });
  await expect(page.getByRole("heading", { name: /Bonjour, Demo\./ })).toBeVisible();
  requests.length = 0;
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Temporary Demo");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile updated.", { exact: true })).toBeVisible();
  expect(Object.values(await attemptAccountOperations(page))).toEqual(Array(10).fill(true));
  expect(requests).toEqual([]);
  expect(await context.cookies()).toEqual(cookiesBefore);

  await page.evaluate(() => { globalThis.location.hash = ""; });
  await expect(page.getByRole("heading", { name: /Bonjour, Real Account\./ })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Real Account");
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const { error } = await supabase.auth.getUser();
    if (error) throw error;
  });
  expect(requests.some((request) => request.url.includes("/auth/v1/user"))).toBe(true);
});

test("demo settings and AI restrictions work without Supabase configuration", async ({ page }) => {
  const requests = await configureBackend(page, { configured: false });
  await page.goto("/#/demo");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Offline Demo");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile updated.", { exact: true })).toBeVisible();
  await page.getByLabel("Quiz vocabulary questions", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Save learning settings", exact: true }).click();
  await expect(page.getByText("Learning settings updated.", { exact: true })).toBeVisible();
  const message = await page.evaluate(async () => {
    const { autoFillFrenchVocabulary } = await import("/src/services/vocabularyAutofill.js");
    try { await autoFillFrenchVocabulary("bonjour"); } catch (error) { return error.message; }
  });
  expect(message).toContain("public demo");
  expect(requests).toEqual([]);
});

test("auto-fill waiting for a session cannot send after entering demo", async ({ page, context, baseURL }) => {
  const requests = await configureBackend(page);
  await seedAccountSession(context, baseURL);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Bonjour, Real Account\./ })).toBeVisible();

  const message = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const { autoFillFrenchVocabulary } = await import("/src/services/vocabularyAutofill.js");
    const session = await supabase.auth.getSession();
    const originalGetSession = supabase.auth.getSession;
    let releaseSession;
    supabase.auth.getSession = () => new Promise((resolve) => { releaseSession = resolve; });
    try {
      const result = autoFillFrenchVocabulary("bonjour").catch((error) => error.message);
      globalThis.location.hash = "/demo";
      releaseSession(session);
      return await result;
    } finally {
      supabase.auth.getSession = originalGetSession;
    }
  });

  expect(message).toContain("public demo");
  await expect(page.getByRole("heading", { name: /Bonjour, Demo\./ })).toBeVisible();
  expect(requests.some((request) => request.url.includes("/api/autofill-vocabulary"))).toBe(false);
});
