import { sameSnapshot } from "./dailyPersistence.js";

export const editableNoteFields = [
  "category", "french", "english", "example", "notes", "tags", "confidence",
  "partOfSpeech", "ipa", "gender", "conjugation", "adjectiveForms", "lastReviewed",
];

export function changedNoteFields(next, original) {
  return Object.fromEntries(editableNoteFields
    .filter((key) => Object.hasOwn(next, key) && !sameSnapshot(next[key], original?.[key]))
    .map((key) => [key, next[key]]));
}

export function createNoteMutationQueue(isCurrent) {
  const pending = new Map();
  return (id, operation) => {
    const previous = pending.get(id) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(() => {
      if (!isCurrent()) throw new Error("The account changed before saving the note.");
      return operation();
    });
    pending.set(id, result);
    return result.finally(() => { if (pending.get(id) === result) pending.delete(id); });
  };
}
