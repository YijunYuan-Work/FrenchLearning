import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";

export const upstreamTimeouts = Object.freeze({ wiktionary: 15000, openai: 30000 });
const frenchLetters = "[A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF\\u0152\\u0153]";
const frenchEntryPattern = new RegExp(`^${frenchLetters}+(?:(?:['-]| +)${frenchLetters}+)*$`, "u");

class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// The deadline covers headers, body reads, and (for Wiktionary) retry waits.
async function withUpstreamDeadline(service, operation) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError(504, `${service.toUpperCase()}_TIMEOUT`,
        `${service === "openai" ? "AI auto-fill" : "Wiktionary verification"} timed out. Please try again.`, { retryable: true }));
      controller.abort();
    }, upstreamTimeouts[service]);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, `${service.toUpperCase()}_UNAVAILABLE`,
      `${service === "openai" ? "AI auto-fill" : "Wiktionary verification"} is temporarily unavailable. Please try again.`, { retryable: true });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function fetchUpstreamJson(url, options, service) {
  const response = await fetch(url, options);
  options.signal.throwIfAborted();
  if (!response.ok) return { response };
  let payload;
  try {
    payload = await response.json();
  } catch {
    options.signal.throwIfAborted();
    throw invalidUpstreamResponse(service);
  }
  options.signal.throwIfAborted();
  return { response, payload };
}

function invalidUpstreamResponse(service) {
  return new ApiError(502, `${service.toUpperCase()}_INVALID_RESPONSE`,
    `${service === "openai" ? "AI auto-fill" : "Wiktionary verification"} returned an incomplete or unreadable response. Please try again.`, { retryable: true });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
  if (request.body !== undefined && typeof request.body !== "string") {
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
    .replace(/[’‘]/g, "'")
    .replace(/[\u2010\u2011]/g, "-")
    .normalize("NFC");
}

function isSingleFrenchEntry(value) {
  return (
    value.length > 0 &&
    value.length <= 48 &&
    frenchEntryPattern.test(value) &&
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

class WiktionaryTemporaryError extends ApiError {
  constructor(status, retryAfterMs) {
    super(503, "WIKTIONARY_TEMPORARY", "Wiktionary verification is temporarily unavailable. Please try again after a short pause.",
      { retryable: true, retryAfterMs, upstreamStatus: status });
  }
}

async function verifyFrenchWiktionaryEntry(word, signal) {
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
    const { response, payload: data } = await fetchUpstreamJson(url, { headers: wiktionaryHeaders, signal }, "wiktionary");
    lastStatus = response.status;

    if (response.ok) {
      if (!isObject(data) || !Array.isArray(data.query?.pages) || !data.query.pages.length ||
          data.query.pages.some((page) => !isObject(page) ||
            (!page.missing && typeof extractWiktionaryPageContent(page) !== "string") ||
            (!page.missing && !extractWiktionaryPageContent(page)))) {
        throw invalidUpstreamResponse("wiktionary");
      }
      const hasFrenchEntry = data.query.pages.some((page) => {
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
      if (response.status === 404) {
        setCachedWiktionaryVerification(word, false);
        return false;
      }
      throw new ApiError(502, "WIKTIONARY_UNAVAILABLE", "Wiktionary verification is temporarily unavailable. Please try again.", { retryable: true });
    }

    retryAfterMs = getRetryDelayMs(response, attempt);
    if (attempt < 4) await delay(retryAfterMs, undefined, { signal });
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

export function normalizeQuotaRpcResult(data) {
  const result = Array.isArray(data) ? data[0] : data;
  const requestCount = Number(result?.request_count);
  const limit = Number(result?.daily_limit);

  if (
    typeof result?.allowed !== "boolean" ||
    !Number.isInteger(requestCount) ||
    requestCount < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !["free", "subscriber"].includes(result?.subscription_tier)
  ) {
    throw new Error("Secure quota RPC returned an invalid result.");
  }

  return {
    allowed: result.allowed,
    limit,
    requestCount,
    subscriptionTier: result.subscription_tier,
  };
}

async function consumeAutofillQuota(request) {
  const token = getBearerToken(request);
  const { supabaseUrl, supabaseKey } = getSupabaseEnvironment();
  if (!token || !supabaseUrl || !supabaseKey) {
    throw new Error("Authenticated Supabase environment is unavailable.");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
  const { data, error } = await supabase.rpc("consume_ai_autofill_quota");

  if (error) throw error;

  return normalizeQuotaRpcResult(data);
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
  if (!isObject(payload) || (payload.status && payload.status !== "completed")) return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputItems = Array.isArray(payload.output) ? payload.output : [];
  for (const item of outputItems) {
    if (!isObject(item)) continue;
    const contentItems = Array.isArray(item.content) ? item.content : [];
    for (const content of contentItems) {
      if (!isObject(content)) continue;
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
  try {
    await handleRequest(request, response);
  } catch (error) {
    const failure = error instanceof ApiError ? error :
      new ApiError(500, "AUTOFILL_FAILED", "AI auto-fill could not be completed. Please try again.");
    sendJson(response, failure.status, {
      error: failure.message, code: failure.code, status: failure.status, ...failure.details,
    });
  }
}

async function handleRequest(request, response) {
  if (request.method !== "POST") {
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  let user;
  try {
    user = await authenticateUser(request);
  } catch {
    throw new ApiError(503, "AUTH_UNAVAILABLE", "Sign-in verification is temporarily unavailable. Please try again.", { retryable: true });
  }

  if (!user) {
    throw new ApiError(401, "AUTH_REQUIRED", "Sign in before using AI auto-fill.");
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", "Invalid request body. Send a French word and an optional language (en or zh).");
  }

  if (!isObject(body) || typeof body.word !== "string" ||
      (body.language !== undefined && !allowedOutputLanguages.has(body.language))) {
    throw new ApiError(400, "INVALID_REQUEST", "Invalid request body. Send a French word and an optional language (en or zh).");
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
  if (/[\p{Cc}\p{Cf}]/u.test(body.word) || !isSingleFrenchEntry(word)) {
    throw new ApiError(400, "INVALID_WORD", "Enter one French word or short expression (up to 48 characters and 4 words).");
  }

  const hasFrenchEntry = await withUpstreamDeadline("wiktionary", (signal) => verifyFrenchWiktionaryEntry(word, signal));

  if (!hasFrenchEntry) {
    throw new ApiError(422, "WORD_NOT_FOUND", "I could not find this as a French entry in Wiktionary. Check the spelling and try again.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new ApiError(500, "AUTOFILL_NOT_CONFIGURED", "AI auto-fill is not configured. Please contact the site owner.");
  }

  let rateLimitResult;
  try {
    rateLimitResult = await consumeAutofillQuota(request);
  } catch {
    throw new ApiError(503, "QUOTA_UNAVAILABLE", "AI usage tracking is temporarily unavailable. Please try again later.", { retryable: true });
  }

  if (!rateLimitResult.allowed) {
    sendJson(response, 429, {
      error: `Daily AI auto-fill limit reached (${rateLimitResult.requestCount}/${rateLimitResult.limit} used for the ${rateLimitResult.subscriptionTier} plan). Try again tomorrow.`,
      code: "DAILY_LIMIT_REACHED",
      status: 429,
      retryable: false,
      limit: rateLimitResult.limit,
      requestCount: rateLimitResult.requestCount,
      subscriptionTier: rateLimitResult.subscriptionTier,
    });
    return;
  }

  const { response: openAiResponse, payload } = await withUpstreamDeadline("openai", (signal) => fetchUpstreamJson("https://api.openai.com/v1/responses", {
    signal,
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
  }, "openai"));

  if (!openAiResponse.ok) {
    const retryable = openAiResponse.status === 429 || openAiResponse.status >= 500 || openAiResponse.status === 408;
    throw new ApiError(retryable ? 503 : 502, retryable ? "OPENAI_UNAVAILABLE" : "OPENAI_REJECTED",
      retryable ? "AI auto-fill is temporarily unavailable. Please try again later." :
        "AI auto-fill could not process the request. Please contact the site owner if this continues.", { retryable });
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw invalidUpstreamResponse("openai");
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw invalidUpstreamResponse("openai");
  }
  if (!isValidVocabularyResult(result)) throw invalidUpstreamResponse("openai");
  sendJson(response, 200, cleanAutofillResult(result, word));
}

function isValidVocabularyResult(value) {
  if (!isObject(value)) return false;
  const strings = ["word", "english", "partOfSpeech", "category", "ipa", "gender", "example", "notes"];
  return strings.every((key) => typeof value[key] === "string") &&
    value.word.trim() && value.english.trim() && value.category === "vocabulary" &&
    allowedPartsOfSpeech.includes(value.partOfSpeech) &&
    vocabularySchema.properties.gender.enum.includes(value.gender) &&
    Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string") &&
    ["conjugation", "adjectiveForms"].every((key) => isObject(value[key]) &&
      Object.keys(value[key]).length === vocabularySchema.properties[key].required.length &&
      vocabularySchema.properties[key].required.every((field) => typeof value[key][field] === "string"));
}
