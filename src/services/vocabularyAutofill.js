import { supabase } from "../lib/supabase";
import { assertAccountAccess } from "../utils/demoMode";

export async function autoFillFrenchVocabulary(word, language = "en", { userId, isCurrentAccount, signal } = {}) {
  assertAccountAccess();
  if (isCurrentAccount && !isCurrentAccount()) {
    throw new Error("The account changed. Reopen the editor before using AI auto-fill.");
  }
  const normalizedWord = word.trim();
  if (!normalizedWord) {
    throw new Error("Enter a French word first.");
  }

  const { data } = await supabase.auth.getSession();
  if ((isCurrentAccount && !isCurrentAccount()) || (userId && data.session?.user?.id !== userId)) {
    throw new Error("The account changed. Reopen the editor before using AI auto-fill.");
  }
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Sign in before using AI auto-fill.");
  }

  assertAccountAccess();
  const response = await fetch("/api/autofill-vocabulary", {
    signal,
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
      "AI auto-fill returned an incomplete response. Check the API configuration and try again."
    );
  }

  return payload;
}
