export function Metric({ label, value, tone = "default" }) {
  const toneClass = {
    default: "text-ink",
    red: "text-frenchRed",
    blue: "text-frenchBlue",
    green: "text-sage",
  }[tone];

  return (
    <div className="rounded-md border border-frenchBlue/10 bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
