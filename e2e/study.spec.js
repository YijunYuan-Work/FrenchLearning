import { expect, test } from "@playwright/test";

async function openStudy(page, { mobile = false, chinese = false, reducedMotion = false } = {}) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/demo");
  if (chinese) {
    if (mobile) await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "简体中文", exact: true }).click();
    if (mobile) await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: chinese ? "学习" : "Study", exact: true }).click();
  await expect(page.locator(".study-page")).toBeVisible();
}

async function next(page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".study-moving.is-leaving")).toHaveCount(0);
}

test("keeps Study card faces and focus consistent during rapid keyboard navigation", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await openStudy(page);
  const front = page.locator(".study-front");
  const back = page.locator(".study-back");
  const first = await front.textContent();
  await expect(back).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Edit note", exact: true })).toHaveCount(0);
  await front.click();
  await expect(front).toHaveAttribute("inert", "");
  await expect(back).not.toHaveAttribute("inert");
  await expect(page.getByRole("button", { name: "Show front", exact: true })).toBeFocused();
  await expect(page.getByRole("radiogroup", { name: "Confidence" })).toHaveCount(0);
  await page.locator(".study-page").focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Show details", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".study-moving.is-leaving")).toHaveCount(0);
  await expect(page.locator(".study-position > span")).toHaveText("Card 2 of 12");
  await expect(front).not.toHaveText(first);
  await expect(back).toHaveAttribute("inert", "");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".study-moving.is-leaving")).toHaveCount(0);
  await expect(front).toHaveText(first);
  await expect(page.locator(".study-previous")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("preserves Study details, confidence controls and Editor access through completion", async ({ page }) => {
  await openStudy(page, { reducedMotion: true });
  let sawForms = false;
  for (let index = 0; index < 7; index += 1) {
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(page.getByRole("radiogroup", { name: "Confidence" })).toHaveCount(0);
    if (await page.getByText("Conjugation", { exact: true }).count()) {
      await expect(page.locator(".study-forms")).toBeVisible();
      sawForms = true;
    }
    await next(page);
  }
  expect(sawForms).toBe(true);
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  const group = page.getByRole("radiogroup", { name: "Confidence" });
  await expect(page.getByText("Translation", { exact: true })).toBeVisible();
  await group.getByRole("radio", { name: "Learning", exact: true }).click();
  await expect(group.getByRole("radio", { name: "Learning", exact: true })).toBeChecked();
  await page.locator(".study-page").focus();
  await page.keyboard.press("3");
  await expect(group.getByRole("radio", { name: "Familiar", exact: true })).toBeChecked();
  await group.getByRole("radio", { name: "Familiar", exact: true }).press("ArrowLeft");
  await expect(group.getByRole("radio", { name: "Learning", exact: true })).toBeChecked();
  await expect(page.locator(".study-position > span")).toHaveText("Card 8 of 12");
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit learning note" })).toBeVisible();
  await page.keyboard.press("Escape");
  for (let index = 0; index < 3; index += 1) await next(page);
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(page.locator(".study-back .rich-text-content")).toBeVisible();
  expect(await page.locator(".study-back .rich-text-content").evaluate((element) => globalThis.getComputedStyle(element).fontSize)).toBe("15px");
  await expect(group).toBeVisible();
  await next(page);
  await page.getByRole("button", { name: "Finish study", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nice work. You finished this study cycle." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new study cycle" })).toBeDisabled();
  await expect(page.locator(".study-group-heading").last()).toContainText("2/2");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add learning note" });
  await editor.getByLabel("French", { exact: true }).fill("anticonstitutionnellement");
  await editor.getByLabel("English", { exact: true }).fill("unconstitutionally");
  const longNotes = "A long explanation with meaningful French: un chat, une œuvre. ".repeat(70);
  await editor.getByRole("textbox", { name: "Notes", exact: true }).fill(longNotes);
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: "Start a new study cycle" }).click();
  await expect(page.locator(".study-position > span")).toHaveText("Card 1 of 1");
  await expect(page.locator(".study-french")).toHaveText("anticonstitutionnellement");
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  const details = page.getByRole("region", { name: "Card details" });
  expect(await details.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await details.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("button", { name: "Finish study", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Finish study", exact: true }).click();
  await expect(page.getByText("You reviewed 1 cards.", { exact: true })).toBeVisible();
});

test("supports mobile Study gestures, scrolling and return navigation", async ({ page }) => {
  await openStudy(page, { mobile: true });
  await expect(page.locator(".cahier-mobile-nav")).toBeHidden();
  await expect(page.getByRole("button", { name: "Back to Today" })).toBeVisible();
  const card = page.locator(".study-front");
  const box = await card.boundingBox();
  await card.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 5, clientX: box.x + 240, clientY: box.y + 120 });
  await card.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 5, clientX: box.x + 80, clientY: box.y + 130 });
  await expect(page.locator(".study-moving.is-leaving")).toHaveCount(0);
  await expect(page.locator(".study-mobile-position")).toHaveText("02 /12");
  await card.click();
  await expect(page.getByRole("button", { name: "Show front", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit note", exact: true })).toBeVisible();
  const details = page.getByRole("region", { name: "Card details" });
  expect(await details.evaluate((element) => globalThis.getComputedStyle(element).overflowY)).toBe("auto");
  await page.getByRole("button", { name: "Back to Today", exact: true }).click();
  await expect(page.locator(".today-page")).toBeVisible();
  await expect(page.locator(".cahier-mobile-nav")).toBeVisible();
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(page.locator(".study-mobile-position")).toHaveText("02 /12");
  await expect(page.getByRole("button", { name: "Show front", exact: true })).toBeVisible();
});

test("keeps Chinese Study controls usable across viewports with reduced motion", async ({ page }) => {
  await openStudy(page, { chinese: true, reducedMotion: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "显示详情", exact: true }).click();
    const buttonBoxes = await page.locator(".study-actions button").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, right: box.right, fits: element.scrollWidth <= element.clientWidth + 1 };
    }));
    for (const box of buttonBoxes) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.right).toBeLessThanOrEqual(width); expect(box.fits).toBe(true); }
    expect(await page.locator(".study-flipper").evaluate((element) => Number.parseFloat(globalThis.getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(.001);
    await page.getByRole("button", { name: "显示正面", exact: true }).click();
  }
});
