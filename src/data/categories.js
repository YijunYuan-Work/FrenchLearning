import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  GraduationCap,
  Languages,
  ListChecks,
  Mic2,
} from "lucide-react";

export const categories = {
  today: { label: "Today", icon: CalendarDays },
  review: { label: "Study", icon: ListChecks },
  quiz: { label: "Quiz", icon: CircleHelp },
  vocabulary: { label: "Vocabulary", icon: BookOpen },
  phrases: { label: "Phrases", icon: Languages },
  grammar: { label: "Grammar", icon: GraduationCap },
  pronunciation: { label: "Pronunciation Rules", icon: Mic2 },
};

export const categoryOptions = Object.entries(categories)
  .filter(([key]) => key !== "today" && key !== "quiz" && key !== "review")
  .map(([value, item]) => ({ value, label: item.label }));
