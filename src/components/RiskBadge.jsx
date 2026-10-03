export default function RiskBadge({ level, small, suffix = !small }) {
  if (!level) return <span className="risk-badge risk-none">Not reviewed</span>;
  return (
    <span className={`risk-badge risk-${level.toLowerCase()} ${small ? 'small' : ''}`}>
      <span className="risk-dot" aria-hidden="true" />
      {level}
      {suffix && ' risk'}
    </span>
  );
}
