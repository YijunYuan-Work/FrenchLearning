import { expect, test } from "@playwright/test";
import { ids, setupAccounts, go } from "./fixtures/accounts.js";
import { importCsv, importRow, uploadCsv, expectBatch, noteCreates } from "./fixtures/imports.js";

test("import editorial steps expose actual previews, run counts and recovery states in both modes", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Import");
  await bureauCapture(page, testInfo, "import-initial", true);
  for (const mode of ["vocabulary", "phrases"]) {
    if (mode === "phrases") await page.getByRole("main").getByRole("button", { name: "Short phrases", exact: true }).click();
    const firstWord = `${mode}-premier`;
    const badWord = `${mode}-reessayer`;
    const thirdWord = `${mode}-troisieme`;
    await bureauCapture(page, testInfo, `import-${mode}-mode`, true);
    await uploadCsv(page, 'french,translation\n"not closed,broken', "malformed.csv");
    await expect(page.getByRole("alert")).toBeVisible();
    await bureauCapture(page, testInfo, `import-${mode}-malformed`, true);
    await uploadCsv(page, importCsv(mode, [firstWord, badWord, thirdWord, `${mode}-quatre`, `${mode}-cinq`, firstWord].map((word) => importRow(word, { tags: "A1;école,日常" }))));
    await expect(page.locator(".import-preview tbody tr")).toHaveCount(5);
    await expect(page.locator(".import-preview tbody tr").first()).toContainText("A1, école, 日常");
    await bureauCapture(page, testInfo, `import-${mode}-preview`, true);
    backend.failedCreates.add(badWord);
    const first = backend.hold(`${ids.A}:notes:POST:${firstWord}`);
    await go(page, "Start import");
    await backend.waitFor(`${ids.A}:notes:POST:${firstWord}`);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "6");
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    await expect(page.getByRole("main").getByRole("button", { name: "Short phrases", exact: true })).toBeDisabled();
    await bureauCapture(page, testInfo, `import-${mode}-running`, true);
    if (mode === "vocabulary") {
      await go(page, "简体中文");
      await page.setViewportSize({ width: 370, height: 736 });
      await page.getByRole("progressbar").scrollIntoViewIfNeeded();
      await bureauCapture(page, testInfo, "import-mobile-running-zh", true);
      await page.setViewportSize({ width: 1280, height: 900 });
      await go(page, "English");
    }
    await go(page, "Cancel import");
    await bureauCapture(page, testInfo, `import-${mode}-cancelling`, true);
    first.resolve();
    await expectBatch(page, 1, 0, 0, 5);
    await bureauCapture(page, testInfo, `import-${mode}-partial`, true);
    const third = backend.hold(`${ids.A}:notes:POST:${thirdWord}`);
    await go(page, "Resume unprocessed rows");
    await backend.waitFor(`${ids.A}:notes:POST:${thirdWord}`);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
    await bureauCapture(page, testInfo, `import-${mode}-resume`, true);
    third.resolve();
    await expectBatch(page, 4, 1, 1, 0);
    await bureauCapture(page, testInfo, `import-${mode}-failures`, true);
    if (mode === "vocabulary") {
      await page.setViewportSize({ width: 370, height: 736 });
      await page.locator(".import-result-title").scrollIntoViewIfNeeded();
      await bureauCapture(page, testInfo, "import-mobile-results-en", true);
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    const retry = backend.hold(`${ids.A}:notes:POST:${badWord}`);
    backend.failedCreates.delete(badWord);
    await go(page, "Retry failed only");
    await backend.waitFor(`${ids.A}:notes:POST:${badWord}`);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "1");
    await bureauCapture(page, testInfo, `import-${mode}-retry`, true);
    retry.resolve();
    await expectBatch(page, 5, 1, 0, 0);
    await bureauCapture(page, testInfo, `import-${mode}-complete`, true);
    expect(noteCreates(backend).filter((entry) => entry.body.french === firstWord)).toHaveLength(1);
    expect(backend.accounts[ids.A].notes.filter((note) => note.category === mode && note.french.startsWith(mode))).toHaveLength(5);
  }
});

test("bureau layouts remain usable in English and Chinese across mobile tablet and desktop", async ({ page, context, baseURL }, testInfo) => {
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
      if (width === 370 || width === 1280) await bureauCapture(page, testInfo, `settings-${language}-${width}`, true);
      if (width === 370) {
        await page.setViewportSize({ width, height: 452 });
        const email = page.getByLabel(language === "en" ? "Recovery email optional" : "找回邮箱（可选）", { exact: true });
        await email.focus();
        await email.evaluate((element) => element.scrollIntoView({ block: "center" }));
        const field = await email.boundingBox();
        const bottomNav = await page.locator(".cahier-mobile-nav").boundingBox();
        expect(field.y + field.height).toBeLessThanOrEqual(bottomNav.y);
        await bureauCapture(page, testInfo, `settings-keyboard-${language}`);
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
      if (width === 370 || width === 1280) await bureauCapture(page, testInfo, `import-${language}-${width}`, true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await go(page, language === "en" ? "Settings" : "设置");
  }
  expect(errors).toEqual([]);
  expect(noteCreates(backend)).toEqual([]);
  await testInfo.attach("phase6-runtime.json", { body: JSON.stringify(runtime, null, 2), contentType: "application/json" });
});
async function bureauCapture(page, testInfo, name, fullPage = false) {
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(260);
  await page.screenshot({ path: testInfo.outputPath(`phase6-${name}.png`), fullPage });
  if (fullPage) await page.screenshot({ path: testInfo.outputPath(`phase6-viewport-${name}.png`) });
}

test("settings sections discard independently, retain confirmed saves, and recover from failures", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Settings");
  const profile = page.getByRole("form", { name: "Profile details", exact: true });
  const learning = page.getByRole("form", { name: "Daily quiz and study amounts", exact: true });
  const password = page.getByRole("form", { name: "Change password", exact: true });
  await expect(page.locator(".settings-quota-number")).toHaveText("7/ 10");
  await expect(profile.getByRole("button", { name: "Save profile" })).toBeDisabled();
  await bureauCapture(page, testInfo, "settings-desktop", true);
  const writes = backend.writes(ids.A).length;
  await profile.getByLabel("Display name", { exact: true }).fill("Draft name");
  await learning.getByLabel("Quiz vocabulary questions", { exact: true }).fill("42");
  await password.getByLabel("Current password", { exact: true }).fill("old-test-password");
  await bureauCapture(page, testInfo, "settings-dirty", true);
  await profile.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(profile.getByLabel("Display name", { exact: true })).toHaveValue("Account A");
  await expect(learning.getByLabel("Quiz vocabulary questions", { exact: true })).toHaveValue("42");
  await expect(password.getByLabel("Current password", { exact: true })).toHaveValue("old-test-password");
  expect(backend.writes(ids.A)).toHaveLength(writes);

  await profile.getByLabel("Display name", { exact: true }).fill("  ");
  await go(page, "Save profile");
  await expect(profile.getByRole("alert")).toContainText("Display name is required.");
  await bureauCapture(page, testInfo, "settings-validation", true);
  await profile.getByLabel("Display name", { exact: true }).fill("Confirmed name");
  await profile.getByLabel("Recovery email optional", { exact: true }).fill("bad-email");
  await go(page, "Save profile");
  await expect(profile.getByRole("alert")).toContainText("Enter a valid recovery email.");
  await profile.getByLabel("Recovery email optional", { exact: true }).fill("");
  const key = `${ids.A}:user:PUT`;
  backend.failures.add(key);
  await go(page, "Save profile");
  await expect(profile.getByRole("alert")).toContainText("Late account A failure");
  await bureauCapture(page, testInfo, "settings-failure", true);
  await expect(profile.getByLabel("Display name", { exact: true })).toHaveValue("Confirmed name");
  backend.failures.delete(key);
  const gate = backend.hold(key);
  await go(page, "Save profile");
  await backend.waitFor(key);
  await expect(profile.getByLabel("Display name", { exact: true })).toBeDisabled();
  await expect(profile.getByText("Profile updated.", { exact: true })).toHaveCount(0);
  await bureauCapture(page, testInfo, "settings-saving", true);
  gate.resolve();
  await expect(profile.getByText("Profile updated.", { exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].user.user_metadata).toMatchObject({ username: "a", name: "Confirmed name", recoveryEmail: "" });
  await profile.getByLabel("Display name", { exact: true }).fill("Discard me");
  await profile.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(profile.getByLabel("Display name", { exact: true })).toHaveValue("Confirmed name");
  await expect(learning.getByLabel("Quiz vocabulary questions", { exact: true })).toHaveValue("42");
  await learning.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(learning.getByLabel("Quiz vocabulary questions", { exact: true })).toHaveValue("23");

  for (const [label, min, max] of [
    ["Quiz vocabulary questions", 1, 200], ["Study vocabulary cards", 0, 200],
    ["Study grammar cards", 0, 100], ["Study short phrase cards", 0, 100],
  ]) {
    const input = learning.getByLabel(label, { exact: true });
    await input.fill(String(min));
    await expect(learning.getByRole("button", { name: `Decrease ${label}`, exact: true })).toBeDisabled();
    await input.fill(String(max));
    await expect(learning.getByRole("button", { name: `Increase ${label}`, exact: true })).toBeDisabled();
  }
  await learning.getByLabel("Quiz vocabulary questions", { exact: true }).fill("201");
  await go(page, "Save learning settings");
  expect(backend.accounts[ids.A].preferences.quiz_vocabulary_limit).toBe(23);
  await learning.getByLabel("Quiz vocabulary questions", { exact: true }).fill("200");
  const settingsKey = `${ids.A}:user_preferences:POST:quiz_vocabulary_limit,study_vocabulary_limit,study_grammar_limit,study_phrase_limit`;
  backend.failures.add(settingsKey);
  await go(page, "Save learning settings");
  await expect(learning.getByRole("alert")).toContainText("Late account A failure");
  backend.failures.delete(settingsKey);
  await go(page, "Save learning settings");
  await expect(learning.getByText("Learning settings updated.", { exact: true })).toBeVisible();
  expect(backend.accounts[ids.A].preferences).toMatchObject({ quiz_vocabulary_limit: 200, study_vocabulary_limit: 200, study_grammar_limit: 100, study_phrase_limit: 100 });
  await expect(password.getByLabel("Current password", { exact: true })).toHaveValue("old-test-password");
  await password.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(password.getByLabel("Current password", { exact: true })).toHaveValue("");
  await bureauCapture(page, testInfo, "settings-saved", true);
});

test("settings quota uses real entitlement, shows loading and recovers explicitly", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  backend.accounts[ids.A].subscriptionTier = "subscriber";
  backend.accounts[ids.A].autofillUsed = 250;
  const key = `${ids.A}:ai_autofill_usage:GET`;
  const gate = backend.hold(key);
  await page.goto("/");
  await go(page, "Settings");
  await backend.waitFor(key);
  await expect(page.locator(".settings-quota")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Refresh quota", exact: true })).toBeDisabled();
  await bureauCapture(page, testInfo, "quota-loading", true);
  gate.resolve();
  await expect(page.locator(".settings-quota-number")).toHaveText("750/ 1000");
  await expect(page.locator(".settings-quota-ticks span")).toHaveCount(10);
  await expect(page.locator(".settings-quota-ticks .is-remaining")).toHaveCount(7);
  await expect(page.locator(".settings-heading").filter({ hasText: "AI auto-fill" })).toContainText("Subscriber");
  await bureauCapture(page, testInfo, "quota-subscriber", true);
  backend.failures.add(key);
  await go(page, "Refresh quota");
  await expect(page.getByRole("alert")).toContainText("Late account A failure");
  await bureauCapture(page, testInfo, "quota-failure", true);
  backend.failures.delete(key);
  backend.accounts[ids.A].autofillUsed = 1000;
  await page.getByRole("alert").getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".settings-quota-number")).toHaveText("0/ 1000");
  await expect(page.locator(".settings-quota-ticks .is-remaining")).toHaveCount(0);
  expect(backend.writes(ids.A).filter((entry) => ["ai_autofill_usage", "user_subscription_roles", "ai"].includes(entry.resource))).toEqual([]);
});

test("settings password validation and retry preserve other section drafts", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const backend = await setupAccounts({ page, context, baseURL });
  await page.goto("/");
  await go(page, "Settings");
  const password = page.getByRole("form", { name: "Change password", exact: true });
  await page.getByLabel("Display name", { exact: true }).fill("Unsaved profile");
  await go(page, "Update password");
  await expect(password.getByRole("alert")).toContainText("Enter your current password.");
  await password.getByLabel("Current password", { exact: true }).fill("old-test-password");
  await password.getByLabel("New password", { exact: true }).fill("short");
  await go(page, "Update password");
  await expect(password.getByRole("alert")).toContainText("at least 6 characters");
  await password.getByLabel("New password", { exact: true }).fill("new-test-password");
  await password.getByLabel("Confirm new password", { exact: true }).fill("different");
  await go(page, "Update password");
  await expect(password.getByRole("alert")).toContainText("do not match");
  await bureauCapture(page, testInfo, "password-validation", true);
  await password.getByLabel("Confirm new password", { exact: true }).fill("new-test-password");
  backend.failures.add(`${ids.A}:user:PUT`);
  await go(page, "Update password");
  await expect(password.getByRole("alert")).toContainText("Late account A failure");
  await expect(password.getByLabel("New password", { exact: true })).toHaveValue("new-test-password");
  backend.failures.clear();
  await go(page, "Update password");
  await expect(password.getByText("Password updated.", { exact: true })).toBeVisible();
  await expect(password.locator('input[type="password"]')).toHaveCount(3);
  await expect(password.getByLabel("New password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Unsaved profile");
  expect(backend.accounts[ids.A].passwordChanged).toBe(true);
});
