import { frenchCharacterRows } from "../data/frenchCharacters";
import { useLanguage } from "../i18n/LanguageContext";

export function FrenchCharacterKeyboard({ onInsert }) {
  const { t } = useLanguage();

  return (
    <div className="rounded-xl border border-line bg-sky/35 p-3">
      <p className="mb-2 text-xs font-bold text-slate-500">
        {t("frenchCharacters", "French characters")}
      </p>
      <div className="grid gap-2">
        {frenchCharacterRows.map((row) => (
          <div className="flex flex-wrap gap-1.5" key={row.join("")}>
            {row.map((character) => (
              <button
                className="focus-ring grid size-8 place-items-center rounded-lg border border-line bg-white text-sm font-bold text-frenchRed hover:border-frenchBlue/35 hover:bg-white"
                key={character}
                onClick={() => onInsert(character)}
                type="button"
              >
                {character}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
