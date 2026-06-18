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
    <aside className="min-w-0 overflow-hidden border-b border-line bg-white/90 px-4 py-3 shadow-sm lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-4">
      <div className="mb-4 flex items-center gap-3 lg:mb-7">
        <div className="grid size-11 place-items-center rounded-xl bg-frenchBlue text-white shadow-soft">
          <Sparkles size={22} />
        </div>
        <div>
          <p className="text-sm font-bold text-frenchRed">
            {t("frenchDesk", "French Desk")}
          </p>
          <h1 className="text-xl font-black tracking-[-0.01em]">
            {t("learningHub", "Learning Hub")}
          </h1>
        </div>
      </div>

      <nav className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1.5 lg:overflow-visible lg:pb-0">
        {Object.entries(categories).map(([key, item]) => {
          const Icon = item.icon;
          const isActive = activeSection === key;
          return (
            <button
              className={`focus-ring flex h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition lg:shrink ${
                isActive
                  ? "bg-frenchBlue text-white shadow-soft"
                  : "text-slate-700 hover:bg-sky/70 hover:text-frenchBlue"
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

      <div className="mt-4 rounded-xl bg-mint p-4 shadow-inset lg:mt-7">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black">
            <Gauge size={17} className="text-sage" />
            {t("dailyProgress", "Daily progress")}
          </div>
          <span className="rounded-full bg-white/85 px-2 py-1 text-xs font-black text-sage">
            {progressPercent}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/80">
          <div
            className="h-2 rounded-full bg-sage"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-3 text-xs font-bold text-slate-700">
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
                className={`flex items-center gap-2 text-xs font-semibold ${
                  task.done ? "text-sage" : "text-slate-600"
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
