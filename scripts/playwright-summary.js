import { appendFile, readFile } from "node:fs/promises";

// Use Playwright's final outcomes, not attempts or console output: retries are
// included in a test's outcome and must not inflate the number of tests.
let summary;
try {
  const { stats, errors } = JSON.parse(await readFile("test-results/results.json", "utf8"));
  const counts = [stats?.expected, stats?.unexpected, stats?.flaky, stats?.skipped];
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0)) {
    throw new Error("Invalid Playwright outcome counts");
  }
  const [passed, failed, flaky, skipped] = counts;
  const total = passed + failed + flaky + skipped;
  summary = [
    "## Playwright results",
    "",
    "| Outcome | Tests |",
    "| --- | ---: |",
    `| Total selected | ${total} |`,
    `| Executed (excluding skipped) | ${total - skipped} |`,
    `| Passed (expected outcome) | ${passed} |`,
    `| Failed (unexpected outcome) | ${failed} |`,
    `| Flaky / retry-assisted | ${flaky} |`,
    `| Skipped | ${skipped} |`,
    "",
    `Runner-level errors: ${Array.isArray(errors) ? errors.length : 0}.`,
    "",
    "Download the **playwright-results** artifact for HTML results, retry history, attached diagnostics and JUnit XML (retained for 7 days).",
    "The test step's exit status remains authoritative; these counts do not override failures or runner errors.",
    "",
  ].join("\n");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  summary = "## Playwright results\n\nNo JSON report was produced. Inspect the test/setup logs; this is not a successful or zero-test result.\n";
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
  process.stdout.write(summary);
}
