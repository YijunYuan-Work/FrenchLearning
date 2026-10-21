import { expect } from "@playwright/test";
import { VOCABULARY_CSV_HEADERS } from "../../src/utils/importParsers.js";
import { ids } from "./accounts.js";

export function importCsv(mode, rows, ending = "\n", prefix = "") {
  const headers = mode === "vocabulary" ? VOCABULARY_CSV_HEADERS : ["french", "translation", "tags"];
  const escape = (value = "") => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return prefix + [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(","))].join(ending);
}

export function importRow(french, extra = {}) {
  return { french, chinese: "中文释义", translation: "中文翻译", part_of_speech: "interjection", ...extra };
}

export async function uploadCsv(page, text, name = "import.csv") {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
}

export async function expectBatch(page, added, skipped, failed, unprocessed) {
  await expect(page.getByRole("status").filter({ hasText: "Batch:" })).toContainText(
    `Batch: ${added + skipped + failed + unprocessed}. Added: ${added}. Skipped: ${skipped}. Failed: ${failed}. Unprocessed: ${unprocessed}.`);
}

export const noteCreates = (backend) => backend.writes(ids.A).filter((entry) => entry.resource === "notes" && entry.method === "POST");
