import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeRichTextHtml } from "./richText.js";

test("rich text sanitizer preserves common grammar formatting", () => {
  const html = `
    <h2 style="font-size: 30px">Cities</h2>
    <p>Use <b>à</b> before cities.</p>
    <ul><li>J'habite à Paris.</li><li>Je vais à Montréal.</li></ul>
  `;

  assert.equal(
    sanitizeRichTextHtml(html),
    "<h2>Cities</h2><p>Use <strong>à</strong> before cities.</p><ul><li>J'habite à Paris.</li><li>Je vais à Montréal.</li></ul>"
  );
});

test("rich text sanitizer converts useful pasted span styles", () => {
  const html = '<p><span style="font-weight: 700; font-style: italic;">Important</span></p>';

  assert.equal(
    sanitizeRichTextHtml(html),
    "<p><em><strong>Important</strong></em></p>"
  );
});

test("rich text sanitizer removes unsafe tags and attributes", () => {
  const html = '<p onclick="alert(1)">Safe</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a>';

  assert.equal(sanitizeRichTextHtml(html), "<p>Safe</p>link");
});

test("rich text display converts legacy plain text into paragraphs", async () => {
  const { richTextDisplayHtml } = await import("./richText.js");

  assert.equal(
    richTextDisplayHtml("Use à\nUse en"),
    "<p>Use à</p><p>Use en</p>"
  );
});
