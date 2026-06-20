import { createClient } from "@supabase/supabase-js";

const allowedPartsOfSpeech = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "article",
  "numeral",
];

const allowedOutputLanguages = new Set(["en", "zh"]);

const requestLog = new Map();
const freeAutofillDailyLimit = 10;
const subscriberAutofillDailyLimit = 1000;
const rateWindowMs = 24 * 60 * 60 * 1000;
let rateLimitTableAvailable = true;
let subscriptionRoleTableAvailable = true;
const wiktionaryHeaders = {
  "User-Agent": "FrenchLearning/0.1 vocabulary import and lookup",
};
const wiktionaryVerificationCache = new Map();
const wiktionaryCacheMs = 6 * 60 * 60 * 1000;
const wiktionaryTemporaryCacheMs = 45 * 1000;
let wiktionaryCooldownUntil = 0;

const emptyConjugation = {
  je: "",
  tu: "",
  "il/elle": "",
  nous: "",
  vous: "",
  "ils/elles": "",
};

const emptyAdjectiveForms = {
  masculine: "",
  feminine: "",
  masculinePlural: "",
  femininePlural: "",
};

const blockedTags = new Set([
  "",
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "article",
  "numeral",
  "vocabulary",
  "masculine",
  "feminine",
]);

const vocabularySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    word: { type: "string" },
    category: { type: "string", enum: ["vocabulary"] },
    partOfSpeech: { type: "string", enum: allowedPartsOfSpeech },
    ipa: { type: "string" },
    gender: {
      type: "string",
      enum: ["", "masculine", "feminine", "masculine or feminine"],
    },
    conjugation: {
      type: "object",
      additionalProperties: false,
      properties: {
        je: { type: "string" },
        tu: { type: "string" },
        "il/elle": { type: "string" },
        nous: { type: "string" },
        vous: { type: "string" },
        "ils/elles": { type: "string" },
      },
      required: ["je", "tu", "il/elle", "nous", "vous", "ils/elles"],
    },
    adjectiveForms: {
      type: "object",
      additionalProperties: false,
      properties: {
        masculine: { type: "string" },
        feminine: { type: "string" },
        masculinePlural: { type: "string" },
        femininePlural: { type: "string" },
      },
      required: ["masculine", "feminine", "masculinePlural", "femininePlural"],
    },
    english: { type: "string" },
    example: { type: "string" },
    notes: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "word",
    "category",
    "partOfSpeech",
    "ipa",
    "gender",
    "conjugation",
    "adjectiveForms",
    "english",
    "example",
    "notes",
    "tags",
  ],
};

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function normalizeWord(value) {
  return String(value ?? "")
    .trim()
    .replace(/[’]/g, "'")
    .normalize("NFC");
}

function isSingleFrenchEntry(value) {
  return (
    value.length > 0 &&
    value.length <= 48 &&
    /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF'\u2019 -]+$/.test(value) &&
    value.split(/\s+/).length <= 4
  );
}

function stripLeadingFrenchArticle(value) {
  return value
    .replace(/^(l['’]|le\s+|la\s+|les\s+|un\s+|une\s+|des\s+)/i, "")
    .trim();
}

function capitalizeFirstLetter(value) {
  return value.replace(/^\p{Letter}/u, (letter) =>
    letter.toLocaleUpperCase("fr-FR")
  );
}

function titleCaseFrenchProperNoun(value) {
  return value.replace(/(^|[\s-])(\p{Letter})/gu, (match, separator, letter) =>
    `${separator}${letter.toLocaleUpperCase("fr-FR")}`
  );
}

function createWiktionaryPageCandidates(word) {
  const page = stripLeadingFrenchArticle(word);
  return Array.from(
    new Set([
      page,
      capitalizeFirstLetter(page),
      titleCaseFrenchProperNoun(page),
    ].filter(Boolean))
  );
}

function extractLanguageSection(wikitext, language) {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((line) => line.trim() === `==${language}==`);
  if (start === -1) return "";

  const end = lines.findIndex(
    (line, index) => index > start && /^==[^=].*==\s*$/.test(line.trim())
  );

  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getWiktionaryCacheKey(word) {
  return normalizeWord(stripLeadingFrenchArticle(word)).toLocaleLowerCase("fr-FR");
}

function getCachedWiktionaryVerification(word) {
  const cached = wiktionaryVerificationCache.get(getWiktionaryCacheKey(word));
  if (!cached) return undefined;

  if (cached.expiresAt <= Date.now()) {
    wiktionaryVerificationCache.delete(getWiktionaryCacheKey(word));
    return undefined;
  }

  return cached.value;
}

function setCachedWiktionaryVerification(word, value, ttlMs = wiktionaryCacheMs) {
  wiktionaryVerificationCache.set(getWiktionaryCacheKey(word), {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function getRetryDelayMs(response, attempt) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 30000);
  }

  const retryAfterDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterDate)) {
    return Math.min(Math.max(retryAfterDate - Date.now(), 1000), 30000);
  }

  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

function extractWiktionaryPageContent(page) {
  const revision = page.revisions?.[0];
  return revision?.slots?.main?.content ?? revision?.content ?? "";
}

class WiktionaryTemporaryError extends Error {
  constructor(status, retryAfterMs) {
    super(
      `Wiktionary verification is temporarily unavailable${status ? ` (${status})` : ""}. Import will retry after a short pause.`
    );
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.code = "WIKTIONARY_TEMPORARY";
  }
}

async function verifyFrenchWiktionaryEntry(word) {
  const cached = getCachedWiktionaryVerification(word);
  if (cached !== undefined) return cached;

  const cooldownRemainingMs = wiktionaryCooldownUntil - Date.now();
  if (cooldownRemainingMs > 0) {
    throw new WiktionaryTemporaryError(429, cooldownRemainingMs);
  }

  const pages = createWiktionaryPageCandidates(word);
  const url = new URL("https://en.wiktionary.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: pages.join("|"),
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    format: "json",
    formatversion: "2",
    origin: "*",
  }).toString();

  let lastStatus = 0;
  let retryAfterMs = 0;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers: wiktionaryHeaders });
    lastStatus = response.status;

    if (response.ok) {
      const data = await response.json();
      const hasFrenchEntry = (data.query?.pages ?? []).some((page) => {
        if (page.missing) return false;
        const wikitext = extractWiktionaryPageContent(page);
        return extractLanguageSection(wikitext, "French").trim().length > 0;
      });

      setCachedWiktionaryVerification(word, hasFrenchEntry);
      return hasFrenchEntry;
    }

    if (response.status === 429) {
      retryAfterMs = getRetryDelayMs(response, attempt);
      wiktionaryCooldownUntil = Date.now() + retryAfterMs;
      throw new WiktionaryTemporaryError(response.status, retryAfterMs);
    }

    if (![500, 502, 503, 504].includes(response.status)) {
      setCachedWiktionaryVerification(word, false);
      return false;
    }

    retryAfterMs = getRetryDelayMs(response, attempt);
    await sleep(retryAfterMs);
  }

  wiktionaryCooldownUntil = Date.now() + wiktionaryTemporaryCacheMs;
  throw new WiktionaryTemporaryError(lastStatus, retryAfterMs);
}

function getSupabaseEnvironment() {
  return {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey:
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY,
  };
}

function getBearerToken(request) {
  const authorization =
    request.headers.authorization ?? request.headers.Authorization ?? "";
  return authorization.replace(/^Bearer\s+/i, "");
}

function isMissingRateLimitTable(error) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("ai_autofill_usage")
  );
}

function isMissingSubscriptionRoleTable(error) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("user_subscription_roles")
  );
}

function getAutofillLimit(subscriptionTier) {
  return subscriptionTier === "subscriber"
    ? subscriberAutofillDailyLimit
    : freeAutofillDailyLimit;
}

function checkMemoryRateLimit(userId, limit = freeAutofillDailyLimit, subscriptionTier = "free") {
  const now = Date.now();
  const current = requestLog.get(userId) ?? [];
  const recent = current.filter((timestamp) => now - timestamp < rateWindowMs);

  if (recent.length >= limit) {
    requestLog.set(userId, recent);
    return {
      allowed: false,
      limit,
      requestCount: recent.length,
      subscriptionTier,
    };
  }

  requestLog.set(userId, [...recent, now]);
  return {
    allowed: true,
    limit,
    requestCount: recent.length + 1,
    subscriptionTier,
  };
}

async function getSubscriptionTier(supabase, userId) {
  if (!subscriptionRoleTableAvailable) return "free";

  const { data, error } = await supabase
    .from("user_subscription_roles")
    .select("subscription_tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingSubscriptionRoleTable(error)) {
      subscriptionRoleTableAvailable = false;
      return "free";
    }

    throw error;
  }

  return data?.subscription_tier === "subscriber" ? "subscriber" : "free";
}

async function checkRateLimit(request, userId) {
  if (!rateLimitTableAvailable) {
    return checkMemoryRateLimit(userId);
  }

  const token = getBearerToken(request);
  const { supabaseUrl, supabaseKey } = getSupabaseEnvironment();
  if (!token || !supabaseUrl || !supabaseKey) {
    return checkMemoryRateLimit(userId);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
  const today = getTodayKey();
  const subscriptionTier = await getSubscriptionTier(supabase, userId);
  const limit = getAutofillLimit(subscriptionTier);

  const { data, error } = await supabase
    .from("ai_autofill_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (error) {
    if (isMissingRateLimitTable(error)) {
      rateLimitTableAvailable = false;
      return checkMemoryRateLimit(userId, limit, subscriptionTier);
    }
    throw error;
  }

  const nextCount = Number(data?.request_count ?? 0) + 1;
  if (nextCount > limit) {
    return {
      allowed: false,
      limit,
      requestCount: Number(data?.request_count ?? 0),
      subscriptionTier,
    };
  }

  const { error: upsertError } = await supabase
    .from("ai_autofill_usage")
    .upsert(
      {
        user_id: userId,
        date: today,
        request_count: nextCount,
      },
      { onConflict: "user_id,date" }
    );

  if (upsertError) {
    if (isMissingRateLimitTable(upsertError)) {
      rateLimitTableAvailable = false;
      return checkMemoryRateLimit(userId, limit, subscriptionTier);
    }
    throw upsertError;
  }

  return {
    allowed: true,
    limit,
    requestCount: nextCount,
    subscriptionTier,
  };
}

function cleanAutofillResult(value, requestedWord) {
  const partOfSpeech = allowedPartsOfSpeech.includes(value.partOfSpeech)
    ? value.partOfSpeech
    : "";
  const tags = Array.from(
    new Set(
      (Array.isArray(value.tags) ? value.tags : [])
        .map((tag) =>
          String(tag)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\u4E00-\u9FFF -]/g, "")
            .replace(/\s+/g, " ")
        )
        .filter((tag) => tag.length > 1 && tag.length <= 24)
        .filter((tag) => !blockedTags.has(tag) && tag !== partOfSpeech)
    )
  ).slice(0, 4);

  return {
    word: String(value.word || requestedWord).trim(),
    category: "vocabulary",
    partOfSpeech,
    ipa: String(value.ipa ?? "").trim(),
    gender: partOfSpeech === "noun" ? String(value.gender ?? "").trim() : "",
    conjugation:
      partOfSpeech === "verb"
        ? { ...emptyConjugation, ...(value.conjugation ?? {}) }
        : emptyConjugation,
    adjectiveForms:
      partOfSpeech === "adjective"
        ? { ...emptyAdjectiveForms, ...(value.adjectiveForms ?? {}) }
        : emptyAdjectiveForms,
    english: String(value.english ?? "").trim(),
    example: String(value.example ?? "").trim(),
    notes: String(value.notes ?? "").trim(),
    tags,
  };
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputItems = Array.isArray(payload.output) ? payload.output : [];
  for (const item of outputItems) {
    const contentItems = Array.isArray(item.content) ? item.content : [];
    for (const content of contentItems) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }

      if (
        typeof content.output_text === "string" &&
        content.output_text.trim()
      ) {
        return content.output_text;
      }
    }
  }

  return "";
}

async function authenticateUser(request) {
  const { supabaseUrl, supabaseKey } = getSupabaseEnvironment();
  const token = getBearerToken(request);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  if (!token) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    return null;
  }

  return data.user;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 500, { error: "OPENAI_API_KEY is not configured." });
    return;
  }

  let user;
  try {
    user = await authenticateUser(request);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
    return;
  }

  if (!user) {
    sendJson(response, 401, { error: "Sign in before using AI auto-fill." });
    return;
  }

  let rateLimitResult;
  try {
    rateLimitResult = await checkRateLimit(request, user.id);
  } catch (error) {
    sendJson(response, 500, {
      error: `AI usage tracking failed: ${error.message}`,
    });
    return;
  }

  if (!rateLimitResult.allowed) {
    sendJson(response, 429, {
      error: `Daily AI auto-fill limit reached (${rateLimitResult.requestCount}/${rateLimitResult.limit} used for the ${rateLimitResult.subscriptionTier} plan). Try again tomorrow.`,
      limit: rateLimitResult.limit,
      requestCount: rateLimitResult.requestCount,
      subscriptionTier: rateLimitResult.subscriptionTier,
    });
    return;
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Invalid request body." });
    return;
  }

  const word = normalizeWord(body.word);
  const outputLanguage = allowedOutputLanguages.has(body.language)
    ? body.language
    : "en";
  const outputLanguageName =
    outputLanguage === "zh" ? "Simplified Chinese" : "English";
  const learnerDescription =
    outputLanguage === "zh"
      ? "a Simplified Chinese-speaking learner"
      : "an English-speaking learner";
  const tagExamples =
    outputLanguage === "zh"
      ? "学校、工作、食物、旅行、家庭、情绪、日常生活、购物、健康、时间、天气、科技、正式表达"
      : "school, work, food, travel, family, emotions, daily life, shopping, health, time, weather, technology, or formal speech";
  if (!isSingleFrenchEntry(word)) {
    sendJson(response, 400, {
      error: "Enter one French word or short expression.",
    });
    return;
  }

  let hasFrenchEntry;
  try {
    hasFrenchEntry = await verifyFrenchWiktionaryEntry(word);
  } catch (error) {
    if (error.code === "WIKTIONARY_TEMPORARY") {
      sendJson(response, 503, {
        code: error.code,
        error: error.message,
        retryAfterMs: error.retryAfterMs,
        status: error.status,
      });
      return;
    }

    sendJson(response, 502, { error: error.message });
    return;
  }

  if (!hasFrenchEntry) {
    sendJson(response, 422, {
      error:
        "I could not find this as a French entry in Wiktionary. Check the spelling and try again.",
    });
    return;
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_AUTOFILL_MODEL || "gpt-5.4-mini",
      reasoning: { effort: "low" },
      input: [
        {
          role: "developer",
          content: `You are a careful French teacher creating beginner-friendly vocabulary notes for ${learnerDescription}. All explanations, definitions, notes, tags, and the example translation must be in ${outputLanguageName}, unless you are showing the French word, French forms, IPA, or a French example sentence. Return only verified, concise French learning data. If a field is not applicable, return an empty string or empty object fields. Keep the JSON property names exactly as requested, even when the values are in ${outputLanguageName}.`,
        },
        {
          role: "user",
          content: `Create a French vocabulary note for: ${word}

Rules:
- Identify the part of speech.
- For nouns, include gender.
- For verbs, include present tense conjugation for je, tu, il/elle, nous, vous, ils/elles.
- For adjectives, include masculine, feminine, masculine plural, and feminine plural forms.
- Include IPA if you are confident; otherwise use an empty string.
- The "english" JSON field should contain a short definition in ${outputLanguageName}.
- Example should be one natural French sentence plus a short ${outputLanguageName} translation.
- Notes must be written in ${outputLanguageName}. Keep them brief and useful for a beginner.
- Tags should be written in ${outputLanguageName} and should describe usage topics, contexts, or themes such as ${tagExamples}.
- Do not use the word type, gender, or grammar category as a tag.`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "french_vocabulary_autofill",
          strict: true,
          schema: vocabularySchema,
        },
      },
    }),
  });

  const payload = await openAiResponse.json();
  if (!openAiResponse.ok) {
    sendJson(response, openAiResponse.status, {
        error:
          payload.error?.message ||
          "AI auto-fill failed. Please try again in a moment.",
    });
    return;
  }

  const text = extractResponseText(payload);
  if (!text) {
    sendJson(response, 502, {
      error: "AI auto-fill returned an empty response.",
    });
    return;
  }

  try {
    sendJson(response, 200, cleanAutofillResult(JSON.parse(text), word));
  } catch {
    sendJson(response, 502, { error: "AI auto-fill returned invalid JSON." });
  }
}
