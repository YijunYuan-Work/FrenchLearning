import { go } from "../fixtures/accounts.js";

export async function openDraft(page, french = "bonjour") {
  await go(page, "Add note");
  const editor = page.getByRole("dialog");
  await editor.getByLabel("French", { exact: true }).fill(french);
  return editor;
}
