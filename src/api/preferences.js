import { supabase } from "../lib/supabase";

const allowedLanguages = new Set(["en", "zh"]);

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
