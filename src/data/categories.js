import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  GraduationCap,
  Languages,
  ListChecks,
  Mic2,
  Upload,
  UserRound,
} from "lucide-react";

export const categories = {
  today: { label: "Today", labelKey: "categoryToday", icon: CalendarDays },
  review: { label: "Study", labelKey: "categoryStudy", icon: ListChecks },
  quiz: { label: "Quiz", labelKey: "categoryQuiz", icon: CircleHelp },
  vocabulary: {
    label: "Vocabulary",
    labelKey: "categoryVocabulary",
    icon: BookOpen,
  },
  phrases: { label: "Phrases", labelKey: "categoryPhrases", icon: Languages },
  grammar: { label: "Grammar", labelKey: "categoryGrammar", icon: GraduationCap },
  pronunciation: {
    label: "Pronunciation Rules",
    labelKey: "categoryPronunciation",
    icon: Mic2,
  },
  import: {
    label: "Import",
    labelKey: "categoryImport",
    icon: Upload,
  },
  settings: {
    label: "Settings",
    labelKey: "categorySettings",
    icon: UserRound,
  },
};

export const categoryOptions = Object.entries(categories)
  .filter(
    ([key]) =>
      key !== "today" &&
      key !== "quiz" &&
      key !== "review" &&
      key !== "import" &&
      key !== "settings"
  )
  .map(([value, item]) => ({ value, label: item.label, labelKey: item.labelKey }));
