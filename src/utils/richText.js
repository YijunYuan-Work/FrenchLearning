import { parseFragment } from "parse5";

const allowedTags = new Set(["p", "h1", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "strong", "em", "u", "br"]);
const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "svg", "math", "img", "video", "audio", "source", "canvas", "template", "noscript", "textarea", "xmp", "plaintext"]);
const blockContainers = new Set(["div", "section", "article", "header", "footer", "main", "aside", "figure", "figcaption", "pre", "dt", "dd", "caption"]);
const inlineTags = new Set(["strong", "em", "u", "br"]);

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNode(node, inlineOnly = false) {
  if (node.nodeName === "#text") return escapeHtml(node.value);
  const tag = node.tagName;
  if (!tag || node.namespaceURI !== "http://www.w3.org/1999/xhtml" || blockedTags.has(tag)) return "";
  const children = () => (node.childNodes ?? []).map((child) => renderNode(child, inlineOnly)).join("");

  // Tables become readable rows, without merging adjacent cell text.
  if (tag === "tr") return "<p>" + (node.childNodes ?? []).filter((child) => child.tagName === "td" || child.tagName === "th")
    .map((cell) => cell.childNodes.map((child) => renderNode(child, true)).join("")).join(" | ") + "</p>";
  if (tag === "span") {
    const style = node.attrs.find((attribute) => attribute.name === "style")?.value ?? "";
    const declarations = new Map(style.split(";").map((part) => {
      const colon = part.indexOf(":");
      return [part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim().toLowerCase()];
    }));
    let content = children();
    if (/^(bold|[6-9]00)$/.test(declarations.get("font-weight") ?? "")) content = "<strong>" + content + "</strong>";
    if (declarations.get("font-style") === "italic") content = "<em>" + content + "</em>";
    if (/\bunderline\b/.test(declarations.get("text-decoration") ?? declarations.get("text-decoration-line") ?? "")) content = "<u>" + content + "</u>";
    return content;
  }
  const normalizedTag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
  if (allowedTags.has(normalizedTag)) {
    if (normalizedTag === "br") return "<br>";
    if (inlineOnly && !inlineTags.has(normalizedTag)) return "<br>" + children() + "<br>";
    return "<" + normalizedTag + ">" + children() + "</" + normalizedTag + ">";
  }
  if (blockContainers.has(tag)) {
    if (inlineOnly) return "<br>" + children() + "<br>";
    const hasBlocks = node.childNodes.some((child) => blockContainers.has(child.tagName) ||
      (allowedTags.has(child.tagName) && !inlineTags.has(child.tagName)) || child.tagName === "table");
    return hasBlocks ? children() : "<p>" + children() + "</p>";
  }
  return children();
}

export function sanitizeRichTextHtml(value = "") {
  // Parse inert HTML, then emit only fixed tags and escaped text. No source
  // attributes or URLs survive, and inline text-node whitespace stays intact.
  const fragment = parseFragment(typeof value === "string" ? value : "");
  return fragment.childNodes.map((node) => renderNode(node)).join("");
}

export function plainTextToRichText(value = "") {
  return String(value).split(/\r?\n/)
    .map((line) => "<p>" + (escapeHtml(line) || "<br>") + "</p>").join("");
}

export function richTextDisplayHtml(value = "") {
  const text = typeof value === "string" ? value : "";
  if (!text.trim()) return "";
  return /<\/?[a-z][\s\S]*?>|&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(text) ? sanitizeRichTextHtml(text) : plainTextToRichText(text);
}

export function isRichTextEmpty(value = "") {
  const fragment = parseFragment(sanitizeRichTextHtml(value));
  const textContent = (node) => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textContent).join("");
  return !textContent(fragment).replace(/\p{Cf}/gu, "").trim();
}
