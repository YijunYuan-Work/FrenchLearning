import { supabase } from "../lib/supabase";

function toNote(row) {
  return {
    id: row.id,
    category: row.category,
    french: row.french,
    english: row.english,
    example: row.example ?? "",
    notes: row.notes ?? "",
    tags: row.tags ?? [],
    confidence: row.confidence ?? 1,
    partOfSpeech: row.part_of_speech ?? "",
    ipa: row.ipa ?? "",
    gender: row.gender ?? "",
    conjugation: row.conjugation ?? {},
    adjectiveForms: row.adjective_forms ?? {},
    lastReviewed: row.last_reviewed ?? "Not reviewed",
  };
}

function toNoteRow(note, userId) {
  return {
    user_id: userId,
    category: note.category,
    french: note.french,
    english: note.english,
    example: note.example ?? "",
    notes: note.notes ?? "",
    tags: note.tags ?? [],
    confidence: Number(note.confidence) || 1,
    part_of_speech: note.partOfSpeech ?? "",
    ipa: note.ipa ?? "",
    gender: note.gender ?? "",
    conjugation: note.conjugation ?? {},
    adjective_forms: note.adjectiveForms ?? {},
    last_reviewed: note.lastReviewed ?? "Not reviewed",
  };
}

export async function listNotes(userId) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map(toNote);
}

export async function createNote(note, userId) {
  const { data, error } = await supabase
    .from("notes")
    .insert(toNoteRow(note, userId))
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toNote(data);
}

export async function updateNote(noteId, note, userId) {
  const { data, error } = await supabase
    .from("notes")
    .update(toNoteRow(note, userId))
    .eq("id", noteId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toNote(data);
}

export async function deleteNote(noteId, userId) {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
