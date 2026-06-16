export const wiktionaryPosMap = {
  Noun: "noun",
  Verb: "verb",
  Adjective: "adjective",
  Adverb: "adverb",
  Pronoun: "pronoun",
  Preposition: "preposition",
  Conjunction: "conjunction",
  Interjection: "interjection",
  Article: "article",
  Numeral: "numeral",
};

const commonFrenchConjugations = {
  être: {
    je: "suis",
    tu: "es",
    "il/elle": "est",
    nous: "sommes",
    vous: "êtes",
    "ils/elles": "sont",
  },
  avoir: {
    je: "ai",
    tu: "as",
    "il/elle": "a",
    nous: "avons",
    vous: "avez",
    "ils/elles": "ont",
  },
  aller: {
    je: "vais",
    tu: "vas",
    "il/elle": "va",
    nous: "allons",
    vous: "allez",
    "ils/elles": "vont",
  },
  faire: {
    je: "fais",
    tu: "fais",
    "il/elle": "fait",
    nous: "faisons",
    vous: "faites",
    "ils/elles": "font",
  },
  venir: {
    je: "viens",
    tu: "viens",
    "il/elle": "vient",
    nous: "venons",
    vous: "venez",
    "ils/elles": "viennent",
  },
  prendre: {
    je: "prends",
    tu: "prends",
    "il/elle": "prend",
    nous: "prenons",
    vous: "prenez",
    "ils/elles": "prennent",
  },
  pouvoir: {
    je: "peux",
    tu: "peux",
    "il/elle": "peut",
    nous: "pouvons",
    vous: "pouvez",
    "ils/elles": "peuvent",
  },
  vouloir: {
    je: "veux",
    tu: "veux",
    "il/elle": "veut",
    nous: "voulons",
    vous: "voulez",
    "ils/elles": "veulent",
  },
  devoir: {
    je: "dois",
    tu: "dois",
    "il/elle": "doit",
    nous: "devons",
    vous: "devez",
    "ils/elles": "doivent",
  },
  savoir: {
    je: "sais",
    tu: "sais",
    "il/elle": "sait",
    nous: "savons",
    vous: "savez",
    "ils/elles": "savent",
  },
  voir: {
    je: "vois",
    tu: "vois",
    "il/elle": "voit",
    nous: "voyons",
    vous: "voyez",
    "ils/elles": "voient",
  },
  dire: {
    je: "dis",
    tu: "dis",
    "il/elle": "dit",
    nous: "disons",
    vous: "dites",
    "ils/elles": "disent",
  },
};

export function stripLeadingFrenchArticle(value) {
  return value
    .trim()
    .replace(/^(l'|le\s+|la\s+|les\s+|un\s+|une\s+|des\s+)/i, "")
    .trim();
}

export function parseTemplateParams(templateText) {
  const parts = templateText
    .replace(/^\{\{/, "")
    .replace(/\}\}$/, "")
    .split("|")
    .map((part) => part.trim());

  return parts.slice(1).reduce(
    (params, part, index) => {
      const [key, ...rest] = part.split("=");
      if (rest.length) {
        params.named[key.trim()] = rest.join("=").trim();
      } else {
        params.positional[index] = part;
      }
      return params;
    },
    { named: {}, positional: [] }
  );
}

export function parseNounGender(posSection) {
  const template =
    posSection.text.match(/\{\{fr-noun\|[^}]+\}\}/)?.[0] ??
    posSection.text.match(/\{\{head\|fr\|noun\|[^}]+\}\}/)?.[0];
  if (!template) return null;

  const params = parseTemplateParams(template);
  const rawGender =
    params.named.g ?? params.named.g1 ?? params.positional[0] ?? "";
  if (/m.*f|f.*m/.test(rawGender)) return "masculine or feminine";
  if (rawGender.includes("m")) return "masculine";
  if (rawGender.includes("f")) return "feminine";
  return null;
}

export function addPlural(value) {
  if (!value) return "";
  if (/[sxz]$/i.test(value)) return value;
  return `${value}s`;
}

export function inferFeminineAdjective(value) {
  if (!value) return "";
  if (/e$/i.test(value)) return value;
  if (/eux$/i.test(value)) return value.replace(/eux$/i, "euse");
  if (/if$/i.test(value)) return value.replace(/if$/i, "ive");
  if (/er$/i.test(value)) return value.replace(/er$/i, "ère");
  if (/eur$/i.test(value)) return value.replace(/eur$/i, "euse");
  if (/(on|en|el|et)$/i.test(value)) return `${value}${value.slice(-1)}e`;
  return `${value}e`;
}

export function parseAdjectiveForms(word, posSection) {
  const template = posSection.text.match(/\{\{fr-adj\|[^}]+\}\}/)?.[0];
  const params = template ? parseTemplateParams(template) : { named: {} };
  const masculine = params.named.m ?? word;
  const feminine = params.named.f ?? inferFeminineAdjective(masculine);
  const masculinePlural = params.named.mp ?? addPlural(masculine);
  const femininePlural = params.named.fp ?? addPlural(feminine);
  return { masculine, feminine, masculinePlural, femininePlural };
}

export function generatePresentConjugation(verb) {
  const normalizedVerb = verb.toLowerCase();
  if (commonFrenchConjugations[normalizedVerb]) {
    return commonFrenchConjugations[normalizedVerb];
  }

  if (/er$/i.test(verb)) {
    const stem = verb.slice(0, -2);
    const nousStem = /ger$/i.test(verb)
      ? `${stem}e`
      : /cer$/i.test(verb)
        ? `${stem.slice(0, -1)}ç`
        : stem;
    return {
      je: `${stem}e`,
      tu: `${stem}es`,
      "il/elle": `${stem}e`,
      nous: `${nousStem}ons`,
      vous: `${stem}ez`,
      "ils/elles": `${stem}ent`,
    };
  }

  if (/ir$/i.test(verb)) {
    const stem = verb.slice(0, -2);
    return {
      je: `${stem}is`,
      tu: `${stem}is`,
      "il/elle": `${stem}it`,
      nous: `${stem}issons`,
      vous: `${stem}issez`,
      "ils/elles": `${stem}issent`,
    };
  }

  if (/re$/i.test(verb)) {
    const stem = verb.slice(0, -2);
    return {
      je: `${stem}s`,
      tu: `${stem}s`,
      "il/elle": stem,
      nous: `${stem}ons`,
      vous: `${stem}ez`,
      "ils/elles": `${stem}ent`,
    };
  }

  return null;
}

export function formatConjugation(conjugation) {
  return Object.entries(conjugation)
    .map(([pronoun, form]) => `${pronoun} ${form}`)
    .join("; ");
}

export function startsWithVowelSound(value) {
  return /^[aeiouyhâàäéèêëîïôöùûü]/i.test(value);
}

export function generateExample(word, type, metadata) {
  if (type === "noun") {
    const article =
      metadata.gender === "feminine"
        ? "la"
        : metadata.gender === "masculine"
          ? "le"
          : "un";
    const displayArticle = startsWithVowelSound(word) ? "l'" : `${article} `;
    return `J'apprends ${displayArticle}${word} aujourd'hui.`;
  }

  if (type === "verb") {
    const conjugation = metadata.conjugation;
    const jeForm = conjugation?.je ?? word;
    return `Aujourd'hui, je ${jeForm} en français.`;
  }

  if (type === "adjective") {
    return `Cette phrase est ${metadata.forms?.feminine ?? word}.`;
  }

  if (type === "adverb") {
    return `Je parle ${word} pendant l'exercice.`;
  }

  return `J'utilise "${word}" dans une phrase française.`;
}
