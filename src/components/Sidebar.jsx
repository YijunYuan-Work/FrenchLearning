import { CheckCircle2, Circle, Gauge, Sparkles } from "lucide-react";
import { categories } from "../data/categories";
import { useLanguage } from "../i18n/LanguageContext";

export function Sidebar({ activeSection, dailyProgress, setActiveSection }) {
  const { t } = useLanguage();
  const dailyTasks = [
    {
      key: "addNote",
      label: t("dailyTaskAddNote", "Add a note"),
      done: Boolean(dailyProgress?.addNote),
    },
    {
      key: "study",
      label: t("dailyTaskStudy", "Complete daily study"),
      done: Boolean(dailyProgress?.study),
    },
    {
      key: "quiz",
      label: t("dailyTaskQuiz", "Complete daily quiz"),
      done: Boolean(dailyProgress?.quiz),
    },
  ];
  const completedTasks = dailyTasks.filter((task) => task.done).length;
  const progressPercent = Math.round((completedTasks / dailyTasks.length) * 100);

  return (
    <aside className="border-b border-frenchBlue/10 bg-paper px-4 py-4 lg:border-b-0 lg:border-r lg:px-5">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-md bg-frenchBlue text-white">
          <Sparkles size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-frenchRed">
            {t("frenchDesk", "French Desk")}
          </p>
          <h1 className="text-xl font-bold">{t("learningHub", "Learning Hub")}</h1>
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
              {t(item.labelKey, item.label)}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 rounded-md border border-frenchBlue/10 bg-white p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Gauge size={17} className="text-sage" />
          {t("dailyProgress", "Daily progress")}
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-sage"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-700">
          {t(
            "dailyProgressCopy",
            "{completed}/3 tasks complete today.",
            { completed: completedTasks }
          )}
        </p>
        <div className="mt-3 grid gap-2">
          {dailyTasks.map((task) => {
            const Icon = task.done ? CheckCircle2 : Circle;
            return (
              <div
                className={`flex items-center gap-2 text-xs ${
                  task.done ? "font-semibold text-sage" : "text-slate-600"
                }`}
                key={task.key}
              >
                <Icon size={15} />
                <span>{task.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
