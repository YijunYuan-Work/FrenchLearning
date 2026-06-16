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

const requestLog = new Map();
const maxRequestsPerWindow = 40;
const rateWindowMs = 24 * 60 * 60 * 1000;

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
    .normalize("NFC");
}

function isSingleFrenchEntry(value) {
  return (
    value.length > 0 &&
    value.length <= 48 &&
    /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF' -]+$/.test(value) &&
    value.split(/\s+/).length <= 4
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

async function verifyFrenchWiktionaryEntry(word) {
  const url = new URL("https://en.wiktionary.org/w/api.php");
  url.search = new URLSearchParams({
    action: "parse",
    page: word,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
    origin: "*",
  }).toString();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not verify the word with Wiktionary. Try again.");
  }

  const data = await response.json();
  if (data.error) {
    return false;
  }

  const rawWikitext = data.parse?.wikitext;
  const wikitext =
    typeof rawWikitext === "string" ? rawWikitext : rawWikitext?.["*"] ?? "";
  const frenchSection = extractLanguageSection(wikitext, "French");

  return Boolean(frenchSection.trim());
}

function checkRateLimit(userId) {
  const now = Date.now();
  const current = requestLog.get(userId) ?? [];
  const recent = current.filter((timestamp) => now - timestamp < rateWindowMs);

  if (recent.length >= maxRequestsPerWindow) {
    requestLog.set(userId, recent);
    return false;
  }

  requestLog.set(userId, [...recent, now]);
  return true;
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
            .replace(/[^a-z0-9 -]/g, "")
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
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  const authorization =
    request.headers.authorization ?? request.headers.Authorization ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");

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

  if (!checkRateLimit(user.id)) {
    sendJson(response, 429, {
      error: "Daily AI auto-fill limit reached. Try again tomorrow.",
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
          content:
            "You are a careful French teacher creating beginner-friendly vocabulary notes for an English-speaking learner. All explanations, notes, definitions, and labels must be in English unless you are showing the French word, French forms, IPA, or a French example sentence. Return only verified, concise French learning data. If a field is not applicable, return an empty string or empty object fields.",
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
- English should be a short definition.
- Example should be one natural French sentence plus a short English translation.
- Notes must be written in English. Keep them brief and useful for a beginner.
- Tags should describe usage topics, contexts, or themes such as school, work, food, travel, family, emotions, daily life, shopping, health, time, weather, technology, or formal speech.
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
