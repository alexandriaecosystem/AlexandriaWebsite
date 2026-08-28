type CommunityPieChartProps = {
  label: string;
  general: number;
  vip: number;
  generalLabel?: string;
  vipLabel?: string;
  compact?: boolean;
};

export function CommunityPieChart({
  label,
  general,
  vip,
  generalLabel = 'General',
  vipLabel = 'VIP',
  compact = false,
}: CommunityPieChartProps) {
  const safeGeneral = Math.max(0, Number.isFinite(general) ? general : 0);
  const safeVip = Math.max(0, Number.isFinite(vip) ? vip : 0);
  const total = safeGeneral + safeVip;
  const vipPercent = total === 0 ? 0 : Math.round((safeVip / total) * 1000) / 10;
  const generalPercent = total === 0 ? 0 : 100 - vipPercent;
  const chartBackground = total === 0
    ? 'var(--border)'
    : `conic-gradient(var(--accent) 0 ${generalPercent}%, var(--warning) ${generalPercent}% 100%)`;

  return (
    <div className={`community-pie ${compact ? 'compact' : ''}`}>
      <div
        className="community-pie-visual"
        role="img"
        aria-label={`${label}: ${safeGeneral} ${generalLabel}, ${safeVip} ${vipLabel}`}
        data-vip-percent={String(vipPercent)}
        style={{ background: chartBackground }}
      >
        <span aria-hidden="true"><strong>{total.toLocaleString()}</strong><small>{label}</small></span>
      </div>
      <div className="community-pie-legend" aria-hidden="true">
        <span className="general"><i />{safeGeneral.toLocaleString()} {generalLabel}</span>
        <span className="vip"><i />{safeVip.toLocaleString()} {vipLabel}</span>
      </div>
    </div>
  );
}
