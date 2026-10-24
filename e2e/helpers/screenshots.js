export async function capturePage(page, testInfo, name, fullPage = false) {
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(260);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage });
  if (fullPage) await page.screenshot({ path: testInfo.outputPath(`${name}-viewport.png`) });
}
