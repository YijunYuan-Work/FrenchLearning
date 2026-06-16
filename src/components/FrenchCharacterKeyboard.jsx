import { frenchCharacterRows } from "../data/frenchCharacters";

export function FrenchCharacterKeyboard({ onInsert }) {
  return (
    <div className="rounded-md border border-frenchBlue/10 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        French characters
      </p>
      <div className="grid gap-2">
        {frenchCharacterRows.map((row) => (
          <div className="flex flex-wrap gap-1.5" key={row.join("")}>
            {row.map((character) => (
              <button
                className="focus-ring grid size-8 place-items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-frenchRed hover:border-frenchBlue/30 hover:bg-frenchBlue/5"
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
