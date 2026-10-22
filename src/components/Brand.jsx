export function Brand({ compact = false }) {
  return (
    <div className={`cahier-brand${compact ? " cahier-brand--compact" : ""}`}>
      <img className="cahier-brand-icon" alt="" src="/brand/icon-192.png" width="32" height="32" />
      <span className="cahier-brand-name">French Desk</span>
    </div>
  );
}
