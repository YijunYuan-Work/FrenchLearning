const blockTagPattern =
  /<(\/?)\s*(p|div|h1|h2|h3|h4|blockquote|ul|ol|li)\b[^>]*>/gi;
const inlineTagPattern = /<(\/?)\s*(b|strong|i|em|u|br)\b[^>]*>/gi;
const dangerousTagPattern =
  /<\s*(script|style|iframe|object|embed|link|meta|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const dangerousSelfClosingPattern =
  /<\s*(script|style|iframe|object|embed|link|meta|svg|math|img|video|audio|source|canvas)[^>]*\/?\s*>/gi;
const disallowedTagPattern =
  /<(?!\/?(?:p|h1|h2|h3|h4|blockquote|ul|ol|li|strong|em|u|br)\b)[^>]*>/gi;

function normalizeTagName(tagName) {
  const normalized = tagName.toLowerCase();
  if (normalized === "b") return "strong";
  if (normalized === "i") return "em";
  if (normalized === "div") return "p";
  return normalized;
}

function normalizeStyledSpan(match, attributes, content) {
  const style = attributes.match(/style\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
  let nextContent = content;

  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) {
    nextContent = `<strong>${nextContent}</strong>`;
  }
  if (/font-style\s*:\s*italic/i.test(style)) {
    nextContent = `<em>${nextContent}</em>`;
  }
  if (/text-decoration[^;]*underline/i.test(style)) {
    nextContent = `<u>${nextContent}</u>`;
  }

  return nextContent;
}

export function sanitizeRichTextHtml(value = "") {
  return String(value)
    .replace(/[\r\n]\s*/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(dangerousTagPattern, "")
    .replace(dangerousSelfClosingPattern, "")
    .replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, normalizeStyledSpan)
    .replace(blockTagPattern, (match, slash, tagName) => {
      const nextTagName = normalizeTagName(tagName);
      return `<${slash ? "/" : ""}${nextTagName}>`;
    })
    .replace(inlineTagPattern, (match, slash, tagName) => {
      const nextTagName = normalizeTagName(tagName);
      if (nextTagName === "br") return "<br>";
      return `<${slash ? "/" : ""}${nextTagName}>`;
    })
    .replace(disallowedTagPattern, "")
    .replace(/>\s+</g, "><")
    .trim();
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextToRichText(value = "") {
  const lines = String(value).split(/\r?\n/);
  return sanitizeRichTextHtml(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("")
  );
}

export function richTextDisplayHtml(value = "") {
  const text = String(value);
  if (!text.trim()) return "";
  return /<[^>]+>/.test(text) ? sanitizeRichTextHtml(text) : plainTextToRichText(text);
}

export function isRichTextEmpty(value = "") {
  return sanitizeRichTextHtml(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim()
    .length === 0;
}
