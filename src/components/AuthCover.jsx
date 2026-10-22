import { useLanguage } from "../i18n/LanguageContext";
import { Brand } from "./Brand";

export function AuthBrand({ compact = false }) {
  const { t } = useLanguage();
  return (
    <div className={`auth-brand${compact ? " auth-brand-compact" : ""}`}>
      <Brand compact={compact} />
      {!compact && <span className="auth-brand-sub">{t("learningHub", "Learning Hub")}</span>}
    </div>
  );
}

export function AuthCover() {
  const { t } = useLanguage();
  const groups = [
    ["Pratique", [["01", t("categoryToday", "Today"), "aujourd’hui"], ["02", t("categoryStudy", "Study"), "étude"], ["03", t("categoryQuiz", "Quiz"), "dictée"]]],
    ["Le cahier", [["04", t("categoryVocabulary", "Vocabulary"), "mots"], ["05", t("categoryPhrases", "Phrases"), "expressions"], ["06", t("categoryGrammar", "Grammar"), "grammaire"], ["07", t("navPronunciation", "Pronunciation"), "sons"]]],
    ["Bureau", [["08", t("categoryImport", "Import"), ""], ["09", t("categorySettings", "Settings"), ""]]],
  ];
  return (
    <section className="auth-cover" aria-label={t("authCoverLabel", "About French Desk")}>
      <div className="auth-cover-brand"><AuthBrand /><span lang="fr">Cahier de français</span></div>
      <div className="auth-entry">
        <span className="auth-entry-eyebrow" lang="fr">Entrée · nom masculin</span>
        <div className="auth-headword-line" lang="fr">
          <span className="auth-headword">ca<span>·</span>hier</span>
          <span className="auth-annotation"><span>/ka.je/</span><span>n.m.</span></span>
        </div>
        <div className="auth-entry-rule" aria-hidden="true" />
        <ol className="auth-definitions">
          <li><span aria-hidden="true">1.</span><span>{t("authDefinitionOne", "A notebook kept for what you are learning.")}</span></li>
          <li><span aria-hidden="true">2.</span><span>{t("authDefinitionTwo", "Here, yours: the words you collect, the phrases you keep, the grammar you read and the sounds you practise — in one place.")}</span></li>
        </ol>
        <div className="auth-example"><span lang="fr">« J’ouvre mon cahier chaque matin. »</span><span>{t("authExampleMeaning", "I open my notebook every morning.")}</span></div>
      </div>
      <section className="auth-contents" aria-label={t("authContents", "What is inside")}>
        <div className="auth-contents-heading"><span lang="fr">Sommaire</span><span>{t("authContentsShort", "What’s inside")}</span></div>
        <div className="auth-contents-groups">{groups.map(([name, items]) => (
          <div key={name}><span className="auth-group-name" lang="fr">{name}</span><ol>{items.map(([number, label, gloss]) => (
            <li key={number}><span>{number}</span><span>{label} {gloss && <i lang="fr">{gloss}</i>}</span></li>
          ))}</ol></div>
        ))}</div>
      </section>
    </section>
  );
}
