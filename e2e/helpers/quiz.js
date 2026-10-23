

export async function answerQuiz(page, answer) {
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
}
