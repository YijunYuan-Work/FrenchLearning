import assert from "node:assert/strict";
import test from "node:test";
import { isRichTextEmpty, plainTextToRichText, richTextDisplayHtml, sanitizeRichTextHtml } from "./richText.js";

test("rich text sanitizer preserves common grammar formatting", () => {
  const html = `
    <h2 style="font-size: 30px">Cities</h2>
    <p>Use <b>à</b> before cities.</p>
    <ul><li>J'habite à Paris.</li><li>Je vais à Montréal.</li></ul>
  `;

  const clean = sanitizeRichTextHtml(html);
  assert.ok(clean.includes("<h2>Cities</h2>"));
  assert.ok(clean.includes("<p>Use <strong>à</strong> before cities.</p>"));
  assert.ok(clean.includes("<ul><li>J&#39;habite à Paris.</li><li>Je vais à Montréal.</li></ul>"));
  assert.equal(sanitizeRichTextHtml(clean), clean);
});

test("inline spaces, newlines, entities and adjacent paragraphs retain their text boundaries", () => {
  for (const html of ["<p><strong>un</strong> <em>chat</em></p>", "<p>un\n<em>chat</em></p>", "<p><b>un</b>\n<i>chat</i></p>", "<p>un &amp; deux &lt; trois&nbsp;quatre</p>", "<p>un</p><p>chat</p>"]) {
    const clean = sanitizeRichTextHtml(html);
    assert.equal(sanitizeRichTextHtml(clean), clean);
    assert.equal(richTextDisplayHtml(clean), clean);
    assert.doesNotMatch(clean, /unchat/);
  }
  assert.equal(sanitizeRichTextHtml("<b>un</b> <i>chat</i>"), "<strong>un</strong> <em>chat</em>");
  assert.equal(sanitizeRichTextHtml(" <b>un</b> "), " <strong>un</strong> ");
  assert.equal(richTextDisplayHtml("un &amp; chat"), "un &amp; chat");
  assert.equal(isRichTextEmpty("<p>&#160;&#x20;&nbsp;<br></p>"), true);
  assert.equal(isRichTextEmpty("<p>&lt;chat&gt;</p>"), false);
  assert.equal(plainTextToRichText("un\n\nchat"), "<p>un</p><p><br></p><p>chat</p>");
});

test("pasted table cells, nested styled spans and block containers remain readable", () => {
  const table = sanitizeRichTextHtml("<table><tr><th>Masculine</th><th>Feminine</th></tr><tr><td><b>petit</b></td><td>petite</td></tr></table>");
  assert.equal(table, "<p>Masculine | Feminine</p><p><strong>petit</strong> | petite</p>");
  assert.equal(sanitizeRichTextHtml(table), table);
  assert.equal(sanitizeRichTextHtml('<div><p>un</p><p>chat</p></div>'), "<p>un</p><p>chat</p>");
  assert.equal(sanitizeRichTextHtml('<span style="font-weight:700"><span style="font-style:italic">un</span> chat</span>'), "<strong><em>un</em> chat</strong>");
});

test("dangerous markup and malformed HTML cannot emit attributes, URLs or executable tags", () => {
  const inputs = [
    '<p title="x > y" onmouseover="alert(1)">safe</p><iframe srcdoc="<script>alert(1)</script>">bad</iframe>',
    '<a href="java&#x73;cript:alert(1)">link</a><svg><foreignObject><p onclick="alert(1)">bad</p></foreignObject></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<template><img src=x onerror=alert(1)></template><object data="javascript:alert(1)">bad</object>',
    '<p><span style="background:url(javascript:alert(1));font-weight:bold" onclick="alert(1)">safe</span></p>',
    '<p>&lt;img src=x onerror=alert(1)&gt;</p><script>throw new Error("bad")</script>',
  ];
  for (const input of inputs) {
    const clean = sanitizeRichTextHtml(input);
    assert.doesNotMatch(clean, /<(?:script|iframe|img|svg|math|object|template|style)\b|<[^>]+\s(?:on\w+|href|src|style)\s*=/i);
    assert.equal(sanitizeRichTextHtml(clean), clean);
  }
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
