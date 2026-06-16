export const STORAGE_KEY = "french-learning-notes-v2";
export const LEGACY_STORAGE_KEYS = ["french-learning-notes-v1"];

export const legacySampleIds = new Set([
  "vocab-boulangerie",
  "phrase-je-voudrais",
  "grammar-au",
  "pronunciation-r",
]);

export const starterItems = [];

export function loadItems() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) ? parsed : starterItems;
  } catch {
    return starterItems;
  }
}

export function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
