// Approved-content fixtures only. Production Demo data and queue logic are unchanged.
const words = [
  { french: "l'abricot", english: "apricot", partOfSpeech: "noun", gender: "masculine", ipa: "/a.bʁi.ko/", example: "Elle mange un abricot au petit-déjeuner.", tags: ["food"], confidence: 3 },
  { french: "apprendre", english: "to learn", partOfSpeech: "verb", ipa: "/a.pʁɑ̃dʁ/", conjugation: { je: "j'apprends", tu: "apprends", "il/elle": "apprend", nous: "apprenons", vous: "apprenez", "ils/elles": "apprennent" }, tags: ["verbs"], confidence: 2 },
  { french: "la boulangerie", english: "bakery", partOfSpeech: "noun", gender: "feminine", ipa: "/bu.lɑ̃ʒ.ʁi/", example: "Je passe à la boulangerie après le travail.", tags: ["food", "daily life"], confidence: 2 },
  { french: "le bureau", english: "desk; office", partOfSpeech: "noun", gender: "masculine", ipa: "/by.ʁo/", example: "Mon bureau est près de la fenêtre.", tags: ["work"], confidence: 4 },
  { french: "chaleureux", english: "warm, welcoming", partOfSpeech: "adjective", ipa: "/ʃa.lø.ʁø/", adjectiveForms: { masculine: "chaleureux", feminine: "chaleureuse", masculinePlural: "chaleureux", femininePlural: "chaleureuses" }, tags: ["people"], confidence: 1 },
  { french: "d'ailleurs", english: "besides; moreover", partOfSpeech: "adverb", ipa: "/da.jœʁ/", notes: "Often opens a sentence to add a supporting point.", confidence: 1 },
  { french: "l'épanouissement", english: "fulfilment, blossoming; personal growth and flourishing", partOfSpeech: "noun", gender: "masculine", ipa: "/e.pa.nwis.mɑ̃/", example: "Le travail contribue à l'épanouissement personnel.", tags: ["work", "people"], confidence: 1 },
  { french: "heureux", english: "happy", partOfSpeech: "adjective", ipa: "/ø.ʁø/", adjectiveForms: { masculine: "heureux", feminine: "heureuse", masculinePlural: "heureux", femininePlural: "heureuses" }, tags: ["people"], confidence: 3 },
  { french: "malgré", english: "despite, in spite of", partOfSpeech: "preposition", ipa: "/mal.ɡʁe/", example: "Nous sommes sortis malgré la pluie.", confidence: 2 },
  { french: "organiser", english: "to organize", partOfSpeech: "verb", ipa: "/ɔʁ.ɡa.ni.ze/", conjugation: { je: "organise", tu: "organises", "il/elle": "organise", nous: "organisons", vous: "organisez", "ils/elles": "organisent" }, tags: ["work"], confidence: 1 },
  { french: "le rendez-vous", english: "appointment, meeting", partOfSpeech: "noun", gender: "masculine", ipa: "/ʁɑ̃.de.vu/", example: "J'ai un rendez-vous chez le médecin.", tags: ["daily life"], confidence: 2 },
  { french: "souvent", english: "often", partOfSpeech: "adverb", ipa: "/su.vɑ̃/", confidence: 4 },
  { french: "vachement", english: "really, very (informal)", partOfSpeech: "adverb", ipa: "/vaʃ.mɑ̃/", example: "C'est vachement bien !", tags: ["informal"], confidence: 2 },
  { french: "le wifi", english: "Wi-Fi", tags: ["travail"], confidence: 3 },
];
const phrases = [
  { french: "avoir le cafard", english: "to feel down; to have the blues", tags: ["idiom", "feelings"], confidence: 2 },
  { french: "Ça me dit quelque chose.", english: "That rings a bell.", confidence: 1 },
  { french: "Il ne faut pas vendre la peau de l'ours avant de l'avoir tué.", english: "Don't count your chickens before they hatch — literally, don't sell the bear's skin before you've killed it.", tags: ["proverb"], confidence: 1 },
  { french: "Mieux vaut tard que jamais.", english: "Better late than never.", tags: ["proverb"], confidence: 3 },
  { french: "Je vous en prie.", english: "You're welcome; please, go ahead (formal).", tags: ["politeness"], confidence: 4 },
  { french: "On se tient au courant ?", english: "Shall we keep each other posted?", tags: ["work"], confidence: 2 },
];
const grammar = [
  { french: "Accord du participe passé avec avoir", confidence: 2, tags: ["participes"], notes: "<p>With <strong>avoir</strong>, the past participle agrees with the direct object only when that object comes before the verb.</p><p><em>Les lettres que j’ai écrites.</em></p><p><em>J’ai écrit des lettres.</em></p><ul><li>Object after the verb → no agreement.</li><li>Object pronoun before (la, les, que) → agree in gender and number.</li><li>Never agree with en.</li></ul>" },
  { french: "Le subjonctif après « il faut que »", confidence: 1, tags: ["subjonctif"], notes: "<p><strong>Il faut que</strong> is always followed by the subjunctive, because it expresses necessity rather than a fact.</p><p><em>Il faut que tu viennes demain.</em></p><p><em>Il faut que nous fassions attention aux accords.</em></p><p><strong>Formation</strong></p><ol><li>Take the ils/elles form of the present tense.</li><li>Drop -ent.</li><li>Add -e, -es, -e, -ions, -iez, -ent.</li></ol><p>Irregular stems to memorise: <strong>être (sois), avoir (aie), faire (fasse), aller (aille), pouvoir (puisse), savoir (sache), vouloir (veuille).</strong></p><p>Do not confuse with <strong>il faut + infinitive</strong>, which is impersonal: Il faut partir. Use que + subjunctive only when the subject is specified.</p><ul><li>bien que, pour que, avant que, à condition que</li><li>je veux que, je doute que, je suis content que</li></ul>" },
  { french: "En ou y ?", confidence: 2, tags: ["pronoms"], notes: "<p><strong>En</strong> replaces de + noun (quantities, origin).</p><p><strong>Y</strong> replaces à + thing, or a place.</p><p><em>Tu veux du pain ? — Oui, j’en veux.</em></p><p><em>Tu vas à Lyon ? — Oui, j’y vais.</em></p>" },
  { french: "Prépositions devant les villes et les pays", confidence: 3, tags: ["prépositions"], notes: "<ul><li>à + city: à Paris, à Montréal</li><li>en + feminine country: en France, en Chine</li><li>au + masculine country: au Canada, au Japon</li><li>aux + plural: aux États-Unis</li></ul>" },
  { french: "Imparfait ou passé composé ?", confidence: 1, notes: "<p><strong>Imparfait</strong> sets the scene, describes habits and ongoing states.</p><p><strong>Passé composé</strong> moves the story forward with completed actions.</p><p><em>Il pleuvait quand je suis sorti.</em></p>" },
  { french: "Les pronoms relatifs : qui, que, dont, où", confidence: 2, tags: ["pronoms"], notes: "<p>Choose by the function of the replaced word in the relative clause.</p>" },
];
const rules = [
  { french: "-ent muet", english: "Silent in third-person plural verb endings — never pronounced.", example: "ils parlent · elles chantent · ils mangent", notes: "Not silent in nouns and adverbs: le moment, souvent.", tags: ["endings"], confidence: 3 },
  { french: "eau · au · o", english: "All say a pure /o/ as in “go”, without the English glide.", example: "le bateau · chaud · le vélo", tags: ["vowels"], confidence: 2 },
  { french: "La liaison obligatoire", english: "Link a silent final consonant to a following vowel after determiners and pronouns.", example: "les‿amis · nous‿avons · un‿enfant", notes: "Never after et: et / un.", tags: ["liaison"], confidence: 1 },
  { french: "gn", english: "Pronounced /ɲ/, like “ny” in canyon.", example: "la montagne · gagner · espagnol", tags: ["consonants"], confidence: 4 },
];
export const libraryDemoNotes = Object.entries({ vocabulary: words, phrases, grammar, pronunciation: rules }).flatMap(([category, notes]) => notes.map((note, index) => ({ english: "", notes: "", example: "", partOfSpeech: "", gender: "", ipa: "", tags: [], conjugation: {}, adjectiveForms: {}, confidence: 1, ...note, category, id: `${category}-${index + 1}`, createdAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString() })));

export function libraryRows(userId) {
  return libraryDemoNotes.map(({ partOfSpeech, adjectiveForms, createdAt, ...note }) => ({ ...note, user_id: userId, part_of_speech: partOfSpeech, adjective_forms: adjectiveForms, created_at: createdAt }));
}
