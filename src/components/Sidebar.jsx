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
    <aside className="sticky top-0 z-30 min-w-0 overflow-hidden border-b border-line bg-white/95 px-3 py-2 shadow-sm backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:h-screen lg:w-[272px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-4">
      <div className="mb-2 flex items-center gap-2 lg:mb-7 lg:gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-frenchBlue text-white shadow-soft lg:size-11">
          <Sparkles size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-frenchRed lg:text-sm">
            {t("frenchDesk", "French Desk")}
          </p>
          <h1 className="truncate text-lg font-black tracking-[-0.01em] lg:text-xl">
            {t("learningHub", "Learning Hub")}
          </h1>
        </div>
      </div>

      <nav className="flex max-w-full gap-1.5 overflow-x-auto pb-1 lg:grid lg:gap-1.5 lg:overflow-visible lg:pb-0">
        {Object.entries(categories).map(([key, item]) => {
          const Icon = item.icon;
          const isActive = activeSection === key;
          return (
            <button
              className={`focus-ring flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm font-bold transition lg:h-11 lg:shrink lg:gap-3 ${
                isActive
                  ? "bg-frenchBlue text-white shadow-soft"
                  : "text-slate-700 hover:bg-sky/70 hover:text-frenchBlue"
              }`}
              key={key}
              onClick={() => setActiveSection(key)}
              type="button"
            >
              <Icon size={17} />
              <span className="whitespace-nowrap">{t(item.labelKey, item.label)}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 hidden rounded-xl bg-mint p-4 shadow-inset lg:mt-7 lg:block">
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
