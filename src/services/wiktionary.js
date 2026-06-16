import {
  generateExample,
  generatePresentConjugation,
  parseAdjectiveForms,
  parseNounGender,
  stripLeadingFrenchArticle,
  wiktionaryPosMap,
} from "../utils/frenchGrammar";

function extractLanguageSection(wikitext, language) {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((line) => line.trim() === `==${language}==`);
  if (start === -1) return "";
  const end = lines.findIndex(
    (line, index) => index > start && /^==[^=].*==\s*$/.test(line.trim())
  );
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

function extractFirstPosSection(languageSection) {
  const headingPattern =
    /^={3,4}\s*(Noun|Verb|Adjective|Adverb|Pronoun|Preposition|Conjunction|Interjection|Article|Numeral)\s*={3,4}\s*$/gm;
  const matches = Array.from(languageSection.matchAll(headingPattern));
  if (!matches.length) return null;
  const match = matches[0];
  const next = matches[1];
  return {
    label: match[1],
    type: wiktionaryPosMap[match[1]],
    text: languageSection.slice(
      match.index + match[0].length,
      next?.index ?? languageSection.length
    ),
  };
}

function cleanWiktionaryText(value) {
  return value
    .replace(/\{\{lb\|fr\|([^}]+)\}\}/g, "($1)")
    .replace(/\{\{gloss\|([^}]+)\}\}/g, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDefinition(posSection) {
  const lines = posSection.text.split("\n");
  const definition = lines
    .filter((line) => /^#\s+[^*:]/.test(line))
    .map((line) => cleanWiktionaryText(line.replace(/^#\s+/, "")))
    .find(
      (line) =>
        line &&
        !/(form of|plural of|singular of|inflection of|past participle of)/i.test(
          line
        )
    );
  return definition ?? "";
}

function parseIpa(languageSection) {
  const ipaTemplate = languageSection.match(/\{\{IPA\|fr\|([^}|]+)[^}]*\}\}/);
  if (ipaTemplate?.[1]) return ipaTemplate[1].trim();

  const frIpaTemplate = languageSection.match(/\{\{fr-IPA\|([^}|]+)[^}]*\}\}/);
  if (frIpaTemplate?.[1]) {
    const value = frIpaTemplate[1].trim();
    return value.startsWith("/") ? value : `/${value}/`;
  }

  return "";
}

export async function lookupFrenchWord(rawWord) {
  const word = stripLeadingFrenchArticle(rawWord);
  if (!word) {
    throw new Error("Enter a French word first.");
  }

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
    throw new Error("Wiktionary lookup failed. Try again in a moment.");
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`No Wiktionary entry found for "${word}".`);
  }

  const rawWikitext = data.parse?.wikitext;
  const wikitext =
    typeof rawWikitext === "string" ? rawWikitext : rawWikitext?.["*"] ?? "";
  const frenchSection = extractLanguageSection(wikitext, "French");
  const posSection = extractFirstPosSection(frenchSection);
  if (!posSection) {
    throw new Error(`No French word type found for "${word}".`);
  }

  const metadata = {};
  const notes = [];
  const ipa = parseIpa(frenchSection);
  if (posSection.type === "noun") {
    metadata.gender = parseNounGender(posSection);
  }

  if (posSection.type === "verb") {
    metadata.conjugation = generatePresentConjugation(word);
    if (!metadata.conjugation) {
      notes.push(
        "Conjugation: not generated automatically for this verb pattern yet."
      );
    }
  }

  if (posSection.type === "adjective") {
    metadata.forms = parseAdjectiveForms(word, posSection);
  }

  const definition = parseDefinition(posSection);
  if (definition) notes.push("Source: Wiktionary");

  return {
    word,
    category: "vocabulary",
    partOfSpeech: posSection.type,
    ipa,
    gender: metadata.gender ?? "",
    conjugation: metadata.conjugation ?? null,
    adjectiveForms: metadata.forms ?? null,
    english: definition,
    example: generateExample(word, posSection.type, metadata),
    notes: notes.join("\n"),
    tags: [],
  };
}
