import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { setupAccounts } from "./fixtures/accounts.js";

const assets = [
  ["icon-192.png", 192, "e74322e667a5b14fe88c3439d72f753d36f735a1a02ed7b8669b06e06bbb0b50"],
  ["icon-512.png", 512, "100c6af6112d186d45cae8eb5064f14b4db26d874b45ecce87f413c31772a3ca"],
  ["french-learning-logo.png", 1024, "7d8d8cbcbd6c555dc195ae38531ab5121da324311e1516a4ad3164df9f158e7f"],
  ["apple-touch-icon.png", 180, "51023587906f1db5d0397ffca73ea15a1887763846d414634e0722e35da6bfc1"],
  ["favicon-32x32.png", 32, "e5e3d254715fe78db3f7a80a7901c7d4214d2777e6663fc1e713a3b8ee3f6e7c"],
  ["favicon.ico", null, "033e798ad004ee5e78e100ae8765c65b857e87d21cfdc301b2d0a1ae6be9c221"],
];

async function inspectBrand(page) {
  const icons = page.locator(".cahier-brand-icon:visible");
  await expect(icons).toHaveCount(1);
  await expect(icons).toHaveJSProperty("naturalWidth", 192);
  await expect(icons).toHaveCSS("object-fit", "contain");
  const geometry = await icons.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    const parent = image.parentElement.getBoundingClientRect();
    const name = image.closest(".cahier-brand")?.querySelector(".cahier-brand-name");
    const label = name?.getBoundingClientRect();
    return {
      width: rect.width, height: rect.height,
      inParent: rect.left >= parent.left && rect.right <= parent.right && rect.top >= parent.top && rect.bottom <= parent.bottom,
      inViewport: rect.left >= 0 && rect.right <= globalThis.innerWidth,
      labelFits: !name || name.scrollWidth <= name.clientWidth + 1,
      separated: !label || rect.right <= label.left,
      aligned: label
        ? Math.abs((rect.top + rect.bottom - label.top - label.bottom) / 2) < 1
        : Math.abs((rect.left + rect.right - parent.left - parent.right) / 2) < 1,
      alt: image.alt,
    };
  });
  expect([28, 32]).toContain(geometry.width);
  expect(geometry.height).toBe(geometry.width);
  expect(geometry).toMatchObject({ inParent: true, inViewport: true, labelFits: true, separated: true, aligned: true });
  if (await page.locator(".cahier-rail-brand:visible").count()) {
    expect(geometry.alt).toBe("French Desk");
  } else {
    expect(geometry.alt).toBe("");
    await expect(page.locator(".cahier-brand:visible .cahier-brand-name")).toHaveText("French Desk");
    await expect(page.locator(".cahier-brand:visible .cahier-brand-name")).toHaveCSS("font-style", "italic");
  }
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  return geometry;
}

test("serves approved logo assets and browser icons unchanged", async ({ page }) => {
  for (const [name, size, hash] of assets) {
    const original = await readFile(new URL(`../public/brand/${name}`, import.meta.url));
    expect(createHash("sha256").update(original).digest("hex")).toBe(hash);
    const response = await page.request.get(`/brand/${name}`);
    expect(response.ok()).toBe(true);
    expect(await response.body()).toEqual(original);
    if (size) {
      expect(original.readUInt32BE(16)).toBe(size);
      expect(original.readUInt32BE(20)).toBe(size);
    }
  }
  await page.goto("/#/demo");
  await expect(page).toHaveTitle("French Desk");
  await expect(page.locator('link[rel="icon"][sizes="any"]')).toHaveAttribute("href", "/brand/favicon.ico");
  await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute("href", "/brand/favicon-32x32.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/apple-touch-icon.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
});

for (const demo of [true, false]) {
  test(`keeps ${demo ? "Demo" : "authenticated"} branding aligned across viewports and languages`, async ({ page, context, baseURL }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (!demo) await setupAccounts({ page, context, baseURL });
    await page.goto(demo ? "/#/demo" : "/");
    await expect(page.locator(".today-page")).toBeVisible();
    await page.evaluate(() => globalThis.document.fonts.ready);
    const measurements = [];
    for (const language of ["en", "zh"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      if (language === "zh") await page.getByRole("button", { name: "简体中文", exact: true }).click();
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        measurements.push({ language, width, ...await inspectBrand(page) });
        if ((language === "en" && [1440, 768, 390].includes(width)) || (language === "zh" && width === 320)) {
          await page.screenshot({ path: testInfo.outputPath(`branding-${language}-${width}.png`) });
        }
      }
    }
    await testInfo.attach("branding-layout.json", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
  });
}

test("aligns shared branding on sign-in and sign-up screens", async ({ page, context, baseURL }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const backend = await setupAccounts({ page, context, baseURL });
  await context.clearCookies();
  await page.goto("/");
  await expect(page.locator(".auth-page")).toBeVisible();
  await page.evaluate(() => globalThis.document.fonts.ready);
  for (const language of ["en", "zh"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (language === "zh") await page.getByRole("button", { name: "简体中文", exact: true }).click();
    for (const mode of [0, 1]) {
      await page.getByRole("tab").nth(mode).click();
      await expect(page.getByRole("tab").nth(mode)).toHaveAttribute("aria-selected", "true");
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await inspectBrand(page);
        if ((language === "en" && [1440, 390].includes(width)) || (language === "zh" && width === 320)) {
          await page.screenshot({ path: testInfo.outputPath(`authentication-branding-${language}-${mode}-${width}.png`) });
        }
      }
    }
  }
  expect(backend.ledger).toEqual([]);
  expect(errors).toEqual([]);
});
