import { supabase } from "../lib/supabase";
import {
  defaultLearningSettings,
  normalizeLearningSettings,
} from "../utils/learningSettings";
import { assertAuthenticatedUser } from "../utils/accountIdentity";
import { assertAccountAccess } from "../utils/demoMode";

const allowedLanguages = new Set(["en", "zh"]);
const pendingLanguageWrites = new Map();

function isMissingLearningSettingsColumns(error) {
  const message = error?.message?.toLowerCase?.() ?? "";
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("quiz_vocabulary_limit") ||
    message.includes("study_vocabulary_limit") ||
    message.includes("study_grammar_limit") ||
    message.includes("study_phrase_limit")
  );
}

export async function getLanguagePreference(userId, { isCurrent = () => true } = {}) {
  assertAccountAccess();
  // A newly mounted A workspace must not hydrate ahead of an old A write
  // still finishing after an A -> B -> A switch.
  await pendingLanguageWrites.get(userId)?.catch(() => {});
  assertAccountAccess();
  if (!isCurrent()) throw new Error("Account changed before loading language.");
  const { data, error } = await supabase
    .from("user_preferences")
    .select("language")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return allowedLanguages.has(data?.language) ? data.language : null;
}

export function updateLanguagePreference(userId, language, options = {}) {
  assertAccountAccess();
  const previous = pendingLanguageWrites.get(userId) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(() => saveLanguagePreference(userId, language, options));
  pendingLanguageWrites.set(userId, write);
  return write.finally(() => {
    if (pendingLanguageWrites.get(userId) === write) pendingLanguageWrites.delete(userId);
  });
}

async function saveLanguagePreference(userId, language, { isCurrent = () => true } = {}) {
  assertAccountAccess();
  if (!isCurrent()) throw new Error("Account changed before saving language.");
  const nextLanguage = allowedLanguages.has(language) ? language : "en";

  const authResult = await supabase.auth.getUser();
  assertAccountAccess();
  if (!isCurrent()) throw new Error("Account changed before saving language.");
  assertAuthenticatedUser(authResult, userId);

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        language: nextLanguage,
      },
      { onConflict: "user_id" }
    )
    .select("language")
    .single();

  if (error) {
    throw error;
  }

  if (data?.language !== nextLanguage) throw new Error("Language preference was not saved.");
  return data.language;
}

export async function getLearningPreferences(userId) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select(
      "quiz_vocabulary_limit, study_vocabulary_limit, study_grammar_limit, study_phrase_limit"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingLearningSettingsColumns(error)) {
      return defaultLearningSettings;
    }

    throw error;
  }

  return normalizeLearningSettings({
    quizVocabularyLimit: data?.quiz_vocabulary_limit,
    studyVocabularyLimit: data?.study_vocabulary_limit,
    studyGrammarLimit: data?.study_grammar_limit,
    studyPhraseLimit: data?.study_phrase_limit,
  });
}

export async function updateLearningPreferences(userId, settings) {
  const nextSettings = normalizeLearningSettings(settings);

  const authResult = await supabase.auth.getUser();
  assertAuthenticatedUser(authResult, userId);

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        quiz_vocabulary_limit: nextSettings.quizVocabularyLimit,
        study_vocabulary_limit: nextSettings.studyVocabularyLimit,
        study_grammar_limit: nextSettings.studyGrammarLimit,
        study_phrase_limit: nextSettings.studyPhraseLimit,
      },
      { onConflict: "user_id" }
    )
    .select(
      "quiz_vocabulary_limit, study_vocabulary_limit, study_grammar_limit, study_phrase_limit"
    )
    .single();

  if (error) {
    throw error;
  }

  return normalizeLearningSettings({
    quizVocabularyLimit: data.quiz_vocabulary_limit,
    studyVocabularyLimit: data.study_vocabulary_limit,
    studyGrammarLimit: data.study_grammar_limit,
    studyPhraseLimit: data.study_phrase_limit,
  });
}
