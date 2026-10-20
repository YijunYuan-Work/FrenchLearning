import { supabase } from "../lib/supabase";
import { assertAccountAccess } from "../utils/demoMode";

export async function autoFillFrenchVocabulary(word, language = "en", { userId, isCurrentAccount, signal } = {}) {
  assertAccountAccess();
  signal?.throwIfAborted();
  if (isCurrentAccount && !isCurrentAccount()) {
    throw new Error("The account changed. Reopen the editor before using AI auto-fill.");
  }
  const normalizedWord = word.trim();
  if (!normalizedWord) {
    throw new Error("Enter a French word first.");
  }

  const { data } = await supabase.auth.getSession();
  signal?.throwIfAborted();
  if ((isCurrentAccount && !isCurrentAccount()) || (userId && data.session?.user?.id !== userId)) {
    throw new Error("The account changed. Reopen the editor before using AI auto-fill.");
  }
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Sign in before using AI auto-fill.");
  }

  assertAccountAccess();
  let response;
  try {
    response = await fetch("/api/autofill-vocabulary", {
      signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ word: normalizedWord, language }),
    });
  } catch {
    signal?.throwIfAborted();
    const error = new Error("Could not connect to AI auto-fill. Check your connection and click Auto-fill to retry.");
    error.code = "AUTOFILL_NETWORK_ERROR";
    throw error;
  }

  const dataPayload = await response.json().catch(() => null);
  const payload = dataPayload && typeof dataPayload === "object" && !Array.isArray(dataPayload) ? dataPayload : {};
  signal?.throwIfAborted();
  assertAccountAccess();
  if (isCurrentAccount && !isCurrentAccount()) {
    throw new Error("The account changed. Reopen the editor before using AI auto-fill.");
  }
  if (!response.ok) {
    const error = new Error(typeof payload.error === "string" ? payload.error : "AI auto-fill is temporarily unavailable. Click Auto-fill to retry.");
    error.code = typeof payload.code === "string" ? payload.code : "AUTOFILL_UNAVAILABLE";
    error.retryAfterMs = payload.retryAfterMs;
    error.status = response.status;
    throw error;
  }

  if (!["word", "english", "partOfSpeech"].every((field) => typeof payload[field] === "string" && payload[field].trim())) {
    const error = new Error("AI auto-fill returned an incomplete response. Click Auto-fill to retry.");
    error.code = "OPENAI_INVALID_RESPONSE";
    throw error;
  }

  return payload;
}
