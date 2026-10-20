import { supabase } from "../lib/supabase";
import { assertAccountAccess } from "../utils/demoMode";
import { normalizeNoteInput, normalizeStoredNotes } from "../utils/noteIntegrity";
import {
  collectPaginatedRows,
  NOTES_PAGE_SIZE,
} from "../utils/notePagination";

const pendingNoteWrites = new Map();

function toNote(row) {
  const note = normalizeStoredNotes([row]).notes[0];
  if (!note) throw new Error("The saved note returned invalid data. Reload your notes before retrying.");
  return note;
}

function toNoteRow(note, userId) {
  return {
    user_id: userId,
    category: note.category,
    french: String(note.french ?? "").trim(),
    english: note.english,
    example: note.example ?? "",
    notes: note.notes ?? "",
    tags: note.tags ?? [],
    confidence: note.confidence,
    part_of_speech: note.partOfSpeech ?? "",
    ipa: note.ipa ?? "",
    gender: note.gender ?? "",
    conjugation: note.conjugation ?? {},
    adjective_forms: note.adjectiveForms ?? {},
    last_reviewed: note.lastReviewed ?? "Not reviewed",
  };
}

function throwNoteWriteError(error) {
  if (error.code === "23505") {
    const duplicate = new Error("A note with this title already exists in this category. Edit it or choose a different title.");
    Object.assign(duplicate, { code: "NOTE_DUPLICATE", field: "duplicate" });
    throw duplicate;
  }
  throw error;
}

export async function listNotes(userId, { isCurrent = () => true } = {}) {
  // On A -> B -> A, hydrate A after its already-started writes have settled.
  await Promise.all([...pendingNoteWrites.entries()]
    .filter(([key]) => key.startsWith(`${userId}:`))
    .map(([, promise]) => promise.catch(() => {})));
  assertAccountAccess();
  if (!isCurrent()) throw new Error("The account changed before loading notes.");
  const rows = await collectPaginatedRows(async (from, to) => {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    return data ?? [];
  }, NOTES_PAGE_SIZE);

  return normalizeStoredNotes(rows);
}

export async function createNote(note, userId) {
  assertAccountAccess();
  const validated = normalizeNoteInput(note);
  const { data, error } = await supabase
    .from("notes")
    .insert(toNoteRow(validated, userId))
    .select()
    .single();

  if (error) {
    throwNoteWriteError(error);
  }

  return toNote(data);
}

export function updateNote(noteId, note, userId, { isCurrent = () => true, category } = {}) {
  const validated = normalizeNoteInput(note, { partial: true, category });
  return queueNoteWrite(noteId, userId, isCurrent, () => patchNote(noteId, validated, userId));
}

function queueNoteWrite(noteId, userId, isCurrent, operation) {
  assertAccountAccess();
  const key = `${userId}:${noteId}`;
  const previous = pendingNoteWrites.get(key) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(() => {
    if (!isCurrent()) throw new Error("The account changed before saving the note.");
    return operation();
  });
  pendingNoteWrites.set(key, write);
  return write.finally(() => { if (pendingNoteWrites.get(key) === write) pendingNoteWrites.delete(key); });
}

async function patchNote(noteId, note, userId) {
  assertAccountAccess();
  const columns = {
    category: "category", french: "french", english: "english", example: "example",
    notes: "notes", tags: "tags", confidence: "confidence", partOfSpeech: "part_of_speech",
    ipa: "ipa", gender: "gender", conjugation: "conjugation", adjectiveForms: "adjective_forms",
    lastReviewed: "last_reviewed",
  };
  const patch = Object.fromEntries(Object.entries(columns)
    .filter(([key]) => Object.hasOwn(note, key))
    .map(([key, column]) => [column, key === "french" ? String(note[key]).trim() : note[key]]));
  const { data, error } = await supabase
    .from("notes")
    .update(patch)
    .eq("id", noteId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throwNoteWriteError(error);
  }

  return toNote(data);
}

export function deleteNote(noteId, userId, { isCurrent = () => true } = {}) {
  return queueNoteWrite(noteId, userId, isCurrent, async () => {
    assertAccountAccess();
    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", userId);
    if (error) throw error;
  });
}
