import { Plus } from "lucide-react";

export function TodayPanel({ hasItems, weakItems, openNewItem }) {
  return (
    <div className="mt-5 grid gap-3 rounded-xl bg-frenchBlue p-4 text-white shadow-soft md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-bold text-white/75">
          {hasItems ? "Today's focus" : "Start your notebook"}
        </p>
        <h3 className="mt-1 text-xl font-black">
          {hasItems
            ? "Review weak words, then add one useful phrase."
            : "Add your first real French note."}
        </h3>
        <p className="mt-2 text-sm leading-6 text-white/80">
          {hasItems
            ? `You have ${weakItems.length} item${weakItems.length === 1 ? "" : "s"} marked for practice. Keep the session short and concrete.`
            : "Start with one word, phrase, grammar rule, or pronunciation reminder from your own notes."}
        </p>
      </div>
      <button
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-frenchBlue hover:bg-white/90"
        onClick={() => openNewItem(hasItems ? "phrases" : "vocabulary")}
        type="button"
      >
        <Plus size={17} />
        {hasItems ? "Add phrase" : "Add note"}
      </button>
    </div>
  );
}
