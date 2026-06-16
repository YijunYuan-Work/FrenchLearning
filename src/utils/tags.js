export function normalizeTags(value) {
  if (Array.isArray(value)) return value;
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function mergeCommaTags(currentTags, nextTags) {
  const merged = new Set([...normalizeTags(currentTags), ...nextTags]);
  return Array.from(merged).join(", ");
}
