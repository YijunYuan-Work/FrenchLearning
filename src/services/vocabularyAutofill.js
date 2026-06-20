import { supabase } from "../lib/supabase";

export async function autoFillFrenchVocabulary(word, language = "en") {
  const normalizedWord = word.trim();
  if (!normalizedWord) {
    throw new Error("Enter a French word first.");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Sign in before using AI auto-fill.");
  }

  const response = await fetch("/api/autofill-vocabulary", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ word: normalizedWord, language }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "AI auto-fill failed.");
    error.code = payload.code;
    error.retryAfterMs = payload.retryAfterMs;
    error.status = payload.status ?? response.status;
    throw error;
  }

  if (!payload?.word || !payload?.english || !payload?.partOfSpeech) {
    throw new Error(
      "AI auto-fill endpoint is unavailable. Use the Vercel deployment or run the app with vercel dev."
    );
  }

  return payload;
}
