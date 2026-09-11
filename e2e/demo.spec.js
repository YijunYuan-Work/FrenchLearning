import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/demo");
});

test("demo loads and navigates to vocabulary", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: /Bonjour, Demo\./ })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Finish today's French plan" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Vocabulary", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "organiser" })).toBeVisible();
});

test("vocabulary search filters demo notes", async ({ page }) => {
  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
  const search = page.getByPlaceholder(
    "Search words, phrases, grammar, tags..."
  );

  await search.fill("organiser");
  await expect(page.getByRole("heading", { name: "organiser" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "la boulangerie" })
  ).toHaveCount(0);

  await search.fill("no-demo-note-matches-this");
  await expect(page.getByText("No words in this type yet.")).toBeVisible();

  await search.clear();
  await expect(
    page.getByRole("heading", { name: "la boulangerie" })
  ).toBeVisible();
});

test("demo vocabulary can be created, edited, and deleted", async ({ page }) => {
  const french = "qualite-e2e";

  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Add learning note" });
  await createDialog.getByLabel("French").fill(`   ${french}   `);
  await createDialog.getByLabel("English").fill("quality check");
  await createDialog.getByRole("button", { name: "Save note" }).click();

  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
  await expect(page.getByRole("heading", { name: french })).toBeVisible();

  await page.getByRole("button", { name: `Edit ${french}` }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit learning note" });
  await expect(editDialog.getByLabel("French")).toHaveValue(french);
  await editDialog.getByLabel("English").fill("updated quality check");
  await editDialog.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("updated quality check")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${french}` }).click();
  await expect(page.getByRole("heading", { name: french })).toHaveCount(0);
});

test("demo quiz reveals an answer and advances", async ({ page }) => {
  await page.getByRole("button", { name: "Quiz", exact: true }).click();

  await expect(page.getByText("Vocabulary quiz")).toBeVisible();
  await page.getByRole("button", { name: "Show correct answer" }).click();
  await expect(
    page.getByText("Answer revealed. Confidence was not changed.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Next word" }).click();
  await expect(
    page.getByRole("button", { name: "Show correct answer" })
  ).toBeVisible();
});

test("demo study reveals a card and advances", async ({ page }) => {
  await page.getByRole("button", { name: "Study", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Flashcards", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: /^Reveal details for / }).click();
  await expect(page.getByRole("button", { name: "Show front" })).toBeVisible();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Reveal details for / })
  ).toBeVisible();
});
