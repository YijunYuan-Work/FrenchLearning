export function Metric({ label, value, tone = "default" }) {
  const toneClasses = {
    default: "bg-white text-ink",
    red: "bg-blush text-frenchRed",
    blue: "bg-sky text-frenchBlue",
    green: "bg-mint text-sage",
  }[tone];

  return (
    <div className="app-card p-3 sm:p-4">
      <p className="text-xs font-medium text-inkMute">
        {label}
      </p>
      <p
        className={`numeric mt-2 inline-flex min-h-9 min-w-12 items-center justify-center rounded-md px-2.5 text-xl font-medium sm:mt-3 sm:min-h-11 sm:min-w-16 sm:px-3 sm:text-2xl ${toneClasses}`}
      >
        {value}
      </p>
    </div>
  );
}
