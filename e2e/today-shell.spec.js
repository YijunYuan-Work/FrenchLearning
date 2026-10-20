import { expect, test } from "@playwright/test";

test("Today task rows navigate without completing goals, then reflect real Study and Quiz completion", async ({ page }) => {
  await page.goto("/#/demo");
  await expect(page.getByRole("status", { name: "1 of 3 tasks done", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Add a note Capture/ }).click();
  await expect(page.getByRole("dialog", { name: "Add learning note" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Complete daily study Review/ }).click();
  await expect(page.getByRole("heading", { name: "Flashcards", exact: true })).toBeVisible();
  while (await page.getByRole("button", { name: "Next", exact: true }).count()) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".study-moving.is-leaving")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Finish study", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("status", { name: "2 of 3 tasks done", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Complete daily quiz Check/ }).click();
  for (let index = 0; index < 7; index += 1) {
    await page.getByRole("button", { name: "Show correct answer", exact: true }).click();
    await page.getByRole("button", { name: "Next word", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Today's quiz is complete.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("status", { name: "3 of 3 tasks done", exact: true })).toBeVisible();
  await expect(page.getByText("Tout est fait.", { exact: true })).toBeVisible();
});

test("mobile navigation sheets provide every destination, language controls, and keyboard dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/demo");
  const notes = page.getByRole("button", { name: "Notes", exact: true });
  await notes.click();
  let sheet = page.getByRole("dialog", { name: "Notes", exact: true });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(notes).toBeFocused();
  for (const destination of ["Vocabulary", "Phrases", "Grammar", "Pronunciation Rules"]) {
    await notes.click();
    sheet = page.getByRole("dialog", { name: "Notes", exact: true });
    await sheet.getByRole("button", { name: destination, exact: true }).click();
    await expect(page.getByRole("heading", { name: destination, exact: true })).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await expect(notes).toHaveAttribute("aria-current", "page");
  }
  await page.getByRole("button", { name: "More", exact: true }).click();
  sheet = page.locator(".cahier-nav-sheet");
  await sheet.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "简体中文", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "English", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add learning note" })).toBeVisible();
});

test("Today shell stays within narrow, tablet and wide viewports in both languages", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/demo");
  for (const language of ["en", "zh"]) {
    if (language === "zh") await page.getByRole("button", { name: "简体中文", exact: true }).click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".today-page")).toBeVisible();
      expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
      for (const selector of [".today-title", ".today-task-title", ".today-task-status"]) {
        const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, fits: element.scrollWidth <= element.clientWidth + 1 };
        }));
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(width);
          expect(box.fits).toBe(true);
        }
      }
      expect(await page.locator(".today-intro").evaluate((element) => Number.parseFloat(globalThis.getComputedStyle(element).animationDuration))).toBeLessThanOrEqual(.001);
    }
  }
  expect(errors).toEqual([]);
});
