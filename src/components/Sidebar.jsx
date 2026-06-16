import { Gauge, Sparkles } from "lucide-react";
import { categories } from "../data/categories";

export function Sidebar({ activeSection, setActiveSection, stats }) {
  return (
    <aside className="border-b border-frenchBlue/10 bg-paper px-4 py-4 lg:border-b-0 lg:border-r lg:px-5">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-md bg-frenchBlue text-white">
          <Sparkles size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-frenchRed">
            French Desk
          </p>
          <h1 className="text-xl font-bold">Learning Hub</h1>
        </div>
      </div>

      <nav className="grid gap-1">
        {Object.entries(categories).map(([key, item]) => {
          const Icon = item.icon;
          const isActive = activeSection === key;
          return (
            <button
              className={`focus-ring flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-medium ${
                isActive
                  ? "bg-frenchBlue text-white shadow-soft"
                  : "text-slate-700 hover:bg-frenchBlue/8"
              }`}
              key={key}
              onClick={() => setActiveSection(key)}
              type="button"
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 rounded-md border border-frenchBlue/10 bg-white p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Gauge size={17} className="text-sage" />
          Weekly pulse
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-sage"
            style={{ width: `${stats.average}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {stats.average}% confidence across {stats.total} saved notes.
        </p>
      </div>
    </aside>
  );
}
