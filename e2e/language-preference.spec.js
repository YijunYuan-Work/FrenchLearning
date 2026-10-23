import { expect, test } from "@playwright/test";
import { origin, ids, setupAccounts } from "./fixtures/accounts.js";

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
