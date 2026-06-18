export function Metric({ label, value, tone = "default" }) {
  const toneClasses = {
    default: "bg-white text-ink",
    red: "bg-blush text-frenchRed",
    blue: "bg-sky text-frenchBlue",
    green: "bg-mint text-sage",
  }[tone];

  return (
    <div className="app-card p-4">
      <p className="text-xs font-bold text-slate-500">
        {label}
      </p>
      <p
        className={`mt-3 inline-flex min-h-11 min-w-16 items-center justify-center rounded-lg px-3 text-2xl font-black ${toneClasses}`}
      >
        {value}
      </p>
    </div>
  );
}
