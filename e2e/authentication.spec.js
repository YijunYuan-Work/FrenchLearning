import { expect, test } from "@playwright/test";
import { setupAccounts, go, ids, origin, sessionFor } from "./fixtures/accounts.js";

async function signedOut(fixture) {
  const backend = await setupAccounts(fixture);
  await fixture.context.clearCookies();
  await fixture.page.goto("/");
  await expect(fixture.page.getByRole("heading", { name: "Sign in to your workspace.", exact: true })).toBeVisible();
  return backend;
}

test("preserves Authentication drafts through validation and keyboard mode changes", async ({ page, context, baseURL }) => {
  const backend = await signedOut({ page, context, baseURL });
  const username = page.getByLabel("Username", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await go(page, "Sign in");
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("status")).toHaveText("Please fix the highlighted fields.");
  await username.fill("marie.dupont");
  await expect(username).toHaveAttribute("aria-invalid", "false");
  await password.fill("abc");
  await go(page, "Show password");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute("aria-pressed", "true");
  await go(page, "Hide password");
  const tab = page.getByRole("tab", { name: "Sign in", exact: true });
  await tab.focus();
  await page.keyboard.press("End");
  const signup = page.getByRole("tab", { name: "Create account", exact: true });
  await expect(signup).toBeFocused();
  await expect(signup).toHaveAttribute("aria-selected", "true");
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await page.getByLabel(/Recovery email/).fill("bad-email");
  await go(page, "Create account");
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use at least 6 characters.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a valid email, or leave it blank.", { exact: true })).toBeVisible();
  await password.fill("soleil22");
  await expect(password).toHaveAttribute("aria-invalid", "false");
  await signup.focus();
  await page.keyboard.press("Home");
  await expect(tab).toBeFocused();
  await expect(page.getByLabel(/Recovery email/, { includeHidden: true })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel(/Recovery email/)).toHaveValue("bad-email");
  await expect(username).toHaveValue("marie.dupont");
  await expect(password).toHaveValue("soleil22");
  await go(page, "简体中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await go(page, "创建账号");
  await expect(page.getByText("请输入有效的邮箱，或留空。", { exact: true })).toBeVisible();
  expect(backend.ledger).toEqual([]);
});

test("retries sign-in after network failure without changing credentials", async ({ page, context, baseURL }) => {
  const backend = await signedOut({ page, context, baseURL });
  // Passwords are opaque: even whitespace-only values must reach Auth unchanged.
  const rawPassword = "      ";
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const requests = [];
  await page.route(`${origin}/auth/v1/token**`, async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await gate;
      return route.fulfill({ status: 400, json: { msg: "Failed to fetch", code: "test_network_failure" } });
    }
    return route.fulfill({ json: sessionFor(backend.accounts[ids.A].user) });
  });
  await page.getByLabel("Username", { exact: true }).fill(" A ");
  await page.getByLabel("Password", { exact: true }).fill(rawPassword);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Signing in…", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Signing in…");
  await expect(page.getByLabel("Username", { exact: true })).toHaveJSProperty("readOnly", true);
  // A native duplicate submit must not dispatch another request either.
  await page.locator("form").evaluate((form) => form.requestSubmit());
  expect(requests).toHaveLength(1);
  release();
  await expect(page.getByRole("alert")).toContainText("Couldn’t reach French Desk.");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(" A ");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(rawPassword);
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await go(page, "Try again");
  await expect(page.getByRole("heading", { name: /Bonjour, Account A/ })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ email: `a@${new URL(origin).hostname}`, password: rawPassword });
  expect(backend.writes(ids.B)).toEqual([]);
});

for (const email of ["", "marie@example.test"]) {
  test(`recovers sign-up from a taken username ${email ? "with" : "without"} recovery-email metadata`, async ({ page, context, baseURL }) => {
    const backend = await signedOut({ page, context, baseURL });
    const requests = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(`${origin}/auth/v1/signup**`, async (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (requests.length === 1) {
        await gate;
        return route.fulfill({ status: 422, json: { msg: "User already registered", code: "user_already_exists" } });
      }
      const user = { ...backend.accounts[ids.A].user, email: body.email, user_metadata: body.data };
      backend.accounts[ids.A].user = user;
      return route.fulfill({ json: sessionFor(user) });
    });
    await page.getByRole("tab", { name: "Create account", exact: true }).click();
    const username = page.getByLabel("Username", { exact: true });
    await username.fill("marie");
    await page.getByLabel("Password", { exact: true }).fill("soleil22");
    await page.getByLabel(/Recovery email/).fill(email);
    await go(page, "Create account");
    await expect(page.getByRole("status")).toHaveText("Creating account…");
    await expect(page.getByLabel(/Recovery email/)).toHaveJSProperty("readOnly", true);
    await expect(page.getByRole("tab", { name: "Create account", exact: true })).toBeDisabled();
    release();
    await expect(username).toBeFocused();
    await expect(username).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("That username is already taken. Try another.", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await username.fill("marie.dupont");
    await expect(username).toHaveAttribute("aria-invalid", "false");
    await go(page, "Create account");
    await expect(page.getByRole("heading", { name: /Bonjour, marie.dupont/ })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      email: `marie-dupont@${new URL(origin).hostname}`, password: "soleil22",
      data: { username: "marie.dupont", name: "marie.dupont", profileEmail: email },
    });
  });
}

test("keeps Authentication scrollable across viewports, languages and reduced motion", async ({ page, context, baseURL }) => {
  await signedOut({ page, context, baseURL });
  await page.setViewportSize({ width: 768, height: 844 });
  await page.setViewportSize({ width: 1440, height: 844 });
  await expect(page.locator(".auth-page")).toHaveClass(/has-entered/);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const language of ["en", "zh"]) {
    await go(page, language === "en" ? "English" : "简体中文");
    for (const width of [1440, 1280, 1024, 768, 390, 375, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => globalThis.document.documentElement.scrollWidth)).toBe(width);
      const title = page.getByRole("heading", { name: language === "en" ? "Sign in to your workspace." : "登录你的工作区。", exact: true });
      await expect(title).toBeVisible();
      await expect(page.locator(".auth-sheet")).toHaveCSS("opacity", "1");
      await expect(page.getByLabel(language === "en" ? "Username" : "用户名", { exact: true })).toHaveCSS("font-size", "16px");
    }
    await page.setViewportSize({ width: 320, height: 430 });
    await page.getByLabel(language === "en" ? "Password" : "密码", { exact: true }).focus();
    await expect(page.locator(".auth-cover")).toBeHidden();
    const submit = page.getByRole("button", { name: language === "en" ? "Sign in" : "登录", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await page.getByRole("tab", { name: language === "en" ? "Sign in" : "登录", exact: true }).focus();
    await expect(page.locator(".auth-cover")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("exposes sign-in selection, pending state and credential errors accessibly", async ({ page, context, baseURL }) => {
  await setupAccounts({ page, context, baseURL });
  await context.clearCookies();
  let release;
  let requestCount = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(`${origin}/auth/v1/token**`, async (route) => {
    requestCount += 1;
    await gate;
    await route.fulfill({ status: 400, json: { msg: "Invalid login credentials", code: "invalid_credentials" } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace.", exact: true })).toBeVisible();
  const signIn = page.getByRole("tab", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await expect(signIn).toHaveAttribute("aria-selected", "false");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  await signIn.click();
  await page.getByLabel("Username", { exact: true }).fill("synthetic-user");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-invalid-password");
  const tokenRequest = page.waitForRequest(`${origin}/auth/v1/token**`);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  const request = await tokenRequest;
  expect(request.method()).toBe("POST");
  expect(new URL(request.url()).searchParams.get("grant_type")).toBe("password");
  expect(request.postDataJSON()).toMatchObject({
    email: `synthetic-user@${new URL(origin).hostname}`,
    password: "synthetic-invalid-password",
  });
  await expect(page.getByRole("status")).toContainText("Signing in");
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("synthetic-user");
  await expect(page.getByLabel("Password", { exact: true })).toHaveJSProperty("readOnly", true);
  await expect(signIn).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("username or password is incorrect");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("synthetic-invalid-password");
  await expect(page.getByRole("button", { name: "Sign in", exact: true }).last()).toBeEnabled();
  expect(requestCount).toBe(1);
  await go(page, "简体中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
