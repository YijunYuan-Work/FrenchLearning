import { expect, test } from "@playwright/test";
import { go, origin, setupAccounts } from "./fixtures/accounts.js";

test("missing-configuration setup keeps long examples inside the viewport in both languages", async ({ page }) => {
  await page.route("**/src/lib/supabase.js*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/const supabaseUrl =[^;]*;/, 'const supabaseUrl = "";')
      .replace(/const supabasePublishableKey =[\s\S]*?;/, 'const supabasePublishableKey = "";');
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect FrenchLearning to your Supabase project.", exact: true })).toBeVisible();
  for (const language of ["en", "zh"]) {
    if (language === "zh") await go(page, "简体中文");
    for (const width of [320, 370, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => globalThis.document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator("pre")).toBeVisible();
    }
  }
});

test("document language, modal isolation and focus restoration follow the visible workspace", async ({ page }) => {
  await page.goto("/#/demo");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await go(page, "简体中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await go(page, "English");
  const trigger = page.getByRole("button", { name: "Add note", exact: true });
  for (let opening = 0; opening < 2; opening += 1) {
    await trigger.click();
    const editor = page.getByRole("dialog");
    await expect(editor).toBeVisible();
    await expect(page.locator(".cahier-main")).toHaveAttribute("inert", "");
    await expect(page.locator(".cahier-sidebar")).toHaveAttribute("inert", "");
    await page.locator(".cahier-main button").first().evaluate((button) => button.focus());
    await expect(editor.getByLabel("French", { exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".cahier-main")).not.toHaveAttribute("inert");
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  }
});

test("sign-in selection and failed submission expose accessible state without changing Auth", async ({ page, context, baseURL }) => {
  await setupAccounts({ page, context, baseURL });
  await context.clearCookies();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(`${origin}/auth/v1/token**`, async (route) => {
    await gate;
    await route.fulfill({ status: 400, json: { msg: "Invalid login credentials", code: "invalid_credentials" } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace.", exact: true })).toBeVisible();
  const signIn = page.getByRole("button", { name: "Sign in", exact: true }).first();
  await expect(signIn).toHaveAttribute("aria-pressed", "true");
  await go(page, "Sign up");
  await expect(signIn).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  await signIn.click();
  await page.getByLabel("Username", { exact: true }).fill("synthetic-user");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-invalid-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByRole("status")).toContainText("Loading your French workspace");
  release();
  await expect(page.getByRole("alert")).toContainText("username or password is incorrect");
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "false");
  await go(page, "简体中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("secondary views load on demand and a failed module cannot take down the workspace", async ({ page }) => {
  const loads = [];
  page.on("request", (request) => { if (request.url().includes("/src/views/")) loads.push(request.url()); });
  await page.goto("/#/demo");
  await expect(page.getByRole("heading", { name: /Bonjour, Demo/ })).toBeVisible();
  expect(loads.some((url) => url.includes("SettingsView"))).toBe(false);
  await go(page, "Settings");
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Demo");
  expect(loads.some((url) => url.includes("SettingsView"))).toBe(true);
  await page.route("**/src/views/ImportView.jsx*", (route) => route.abort("connectionfailed"));
  await go(page, "Import");
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(page.getByRole("button", { name: "Reload page", exact: true })).toBeVisible();
  await go(page, "Today");
  await expect(page.getByRole("heading", { name: /Bonjour, Demo/ })).toBeVisible();
  await page.unroute("**/src/views/ImportView.jsx*");
  await page.reload();
  await go(page, "Import");
  await expect(page.getByLabel("CSV file", { exact: true })).toBeVisible();
});
