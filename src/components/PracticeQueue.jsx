import { ListChecks } from "lucide-react";

export function PracticeQueue({ items, markReviewed }) {
  return (
    <div className="rounded-md border border-frenchBlue/10 bg-paper p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={18} className="text-frenchRed" />
          <h3 className="font-bold">Review queue</h3>
        </div>
        <span className="rounded-md bg-frenchRed/10 px-2 py-1 text-xs font-semibold text-frenchRed">
          {items.length}
        </span>
      </div>
      <div className="grid gap-2">
        {items.slice(0, 4).map((item) => (
          <button
            className="focus-ring rounded-md border border-slate-200 bg-white p-3 text-left hover:border-frenchBlue/30"
            key={item.id}
            onClick={() => markReviewed(item, 1)}
            type="button"
          >
            <p className="font-semibold">{item.french}</p>
            <p className="text-sm text-slate-600">{item.english}</p>
          </button>
        ))}
        {items.length === 0 && (
          <p className="rounded-md bg-sage/10 p-3 text-sm text-sage">
            Your weak-item queue is clear.
          </p>
        )}
      </div>
    </div>
  );
}
