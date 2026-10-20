export function Brand({ compact = false }) {
  return (
    <div className={`cahier-brand${compact ? " cahier-brand--compact" : ""}`}>
      <img alt="" src="/brand/tricolore.png" width="48" height="3" />
      <span className="cahier-brand-name">French Desk</span>
    </div>
  );
}
