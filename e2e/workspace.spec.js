import { expect, test } from "@playwright/test";
import { setupAccounts, go } from "./fixtures/accounts.js";
import { importCsv, importRow, uploadCsv, noteCreates } from "./fixtures/imports.js";
import { capturePage } from "./helpers/screenshots.js";

test("keeps Settings and Import layouts usable across viewports and languages", async ({ page, context, baseURL }, testInfo) => {
  const backend = await setupAccounts({ page, context, baseURL });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await go(page, "Settings");
  const runtime = [];
  for (const language of ["en", "zh"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    if (language === "zh") await go(page, "简体中文");
    const quizLabel = language === "en" ? "Quiz vocabulary questions" : "测验词汇题数";
    await page.getByLabel(quizLabel, { exact: true }).fill("51");
    for (const width of [320, 370, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const nav = page.getByRole("navigation", { name: language === "en" ? "Settings sections" : "设置分区" });
      await nav.getByRole("button", { name: language === "en" ? "Learning" : "学习", exact: false }).click();
      await expect(page.getByLabel(quizLabel, { exact: true })).toHaveValue("51");
      const input = page.getByLabel(quizLabel, { exact: true });
      await input.focus();
      await input.press("ArrowUp");
      await expect(input).toHaveValue("52");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("51");
      const geometry = await page.evaluate(() => ({ viewport: globalThis.innerWidth, document: globalThis.document.documentElement.scrollWidth,
        steppers: [...globalThis.document.querySelectorAll(".settings-stepper")].map((el) => ({ x: el.getBoundingClientRect().x, right: el.getBoundingClientRect().right })),
        labelCollisions: [...globalThis.document.querySelectorAll(".settings-limit")].filter((element) => {
          const range = globalThis.document.createRange();
          range.selectNodeContents(element.querySelector("label"));
          const label = range.getBoundingClientRect();
          const control = element.querySelector(".settings-stepper").getBoundingClientRect();
          return label.left < control.right && label.right > control.left && label.top < control.bottom && label.bottom > control.top;
        }).length }));
      expect(geometry.document).toBeLessThanOrEqual(width);
      expect(geometry.steppers.every((item) => item.x >= 0 && item.right <= width)).toBe(true);
      expect(geometry.labelCollisions).toBe(0);
      runtime.push({ view: "settings", language, width, ...geometry });
      if (width === 370 || width === 1280) await capturePage(page, testInfo, `settings-${language}-${width}`, true);
      if (width === 370) {
        await page.setViewportSize({ width, height: 452 });
        const email = page.getByLabel(language === "en" ? "Recovery email optional" : "找回邮箱（可选）", { exact: true });
        await email.focus();
        await email.evaluate((element) => element.scrollIntoView({ block: "center" }));
        const field = await email.boundingBox();
        const bottomNav = await page.locator(".cahier-mobile-nav").boundingBox();
        expect(field.y + field.height).toBeLessThanOrEqual(bottomNav.y);
        await capturePage(page, testInfo, `settings-keyboard-${language}`);
        await page.setViewportSize({ width, height: 800 });
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await go(page, language === "en" ? "Import" : "导入");
    await uploadCsv(page, importCsv("vocabulary", [importRow("une expression française assez longue", { tags: "school;A1,日常" })]), "Un très long nom de fichier — 中文法语词汇表.csv");
    for (const width of [320, 370, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.locator(".import-preview tbody tr")).toHaveCount(1);
      const geometry = await page.evaluate(() => ({ viewport: globalThis.innerWidth, document: globalThis.document.documentElement.scrollWidth,
        row: globalThis.document.querySelector(".import-preview tr:last-child").getBoundingClientRect().toJSON(),
        display: globalThis.getComputedStyle(globalThis.document.querySelector(".import-preview tbody tr")).display }));
      expect(geometry.document).toBeLessThanOrEqual(width);
      if (width < 768) expect(geometry.display).toBe("block");
      runtime.push({ view: "import", language, width, ...geometry });
      if (width === 370 || width === 1280) await capturePage(page, testInfo, `import-${language}-${width}`, true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await go(page, language === "en" ? "Settings" : "设置");
  }
  expect(errors).toEqual([]);
  expect(noteCreates(backend)).toEqual([]);
  await testInfo.attach("settings-import-layout.json", { body: JSON.stringify(runtime, null, 2), contentType: "application/json" });
});

test("keeps Setup examples within the viewport in both languages", async ({ page }) => {
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

test("updates document language and restores focus after closing the Editor", async ({ page }) => {
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

test("loads workspace views on demand and recovers from a failed view import", async ({ page }) => {
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
