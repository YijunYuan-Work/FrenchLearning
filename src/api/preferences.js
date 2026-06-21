import { supabase } from "../lib/supabase";
import {
  defaultLearningSettings,
  normalizeLearningSettings,
} from "../utils/learningSettings";

const allowedLanguages = new Set(["en", "zh"]);

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

export async function getLanguagePreference(userId) {
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

export async function updateLanguagePreference(userId, language) {
  const nextLanguage = allowedLanguages.has(language) ? language : "en";

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || user?.id !== userId) {
    return nextLanguage;
  }

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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || user?.id !== userId) {
    return nextSettings;
  }

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
