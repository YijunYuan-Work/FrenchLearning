import { Search, Tags } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function NotesToolbar({
  query,
  selectedTag,
  setQuery,
  setSelectedTag,
  tags,
}) {
  const { t } = useLanguage();

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-white/90 p-3 shadow-soft md:flex-row">
      <label className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          size={18}
        />
        <input
          className="focus-ring h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-sm shadow-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(
            "searchPlaceholder",
            "Search words, phrases, grammar, tags..."
          )}
          value={query}
        />
      </label>
      <label className="flex min-w-[210px] items-center gap-2 rounded-lg border border-line bg-white px-3 shadow-sm">
        <Tags size={17} className="text-slate-500" />
        <select
          className="focus-ring h-10 flex-1 bg-transparent text-sm"
          onChange={(event) => setSelectedTag(event.target.value)}
          value={selectedTag}
        >
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag === "all" ? t("allTags", "All tags") : tag}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
