type CommunityPieChartProps = {
  label: string;
  general: number;
  vip: number;
  generalLabel?: string;
  vipLabel?: string;
  compact?: boolean;
};

function percentLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

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
  const generalPercent = total === 0 ? 0 : Math.round((100 - vipPercent) * 10) / 10;
  const vipPercentText = percentLabel(vipPercent);
  const generalPercentText = percentLabel(generalPercent);
  const chartBackground = total === 0
    ? 'var(--border)'
    : `conic-gradient(var(--accent) 0 ${generalPercent}%, var(--warning) ${generalPercent}% 100%)`;

  return (
    <div className={`community-pie ${compact ? 'compact' : ''}`}>
      <div
        className="community-pie-visual"
        role="img"
        aria-label={`${label}: ${safeGeneral} ${generalLabel} (${generalPercentText}%), ${safeVip} ${vipLabel} (${vipPercentText}%)`}
        data-vip-percent={String(vipPercent)}
        style={{ background: chartBackground }}
      >
        <span aria-hidden="true" className="community-pie-center">
          <strong>{total.toLocaleString()}</strong>
          <small>{label}</small>
          {total > 0 && <em>{vipPercentText}% {vipLabel}</em>}
        </span>
      </div>
      <div className="community-pie-legend">
        <span className="general"><i aria-hidden="true" /><b>{safeGeneral.toLocaleString()} {generalLabel}</b><small>{generalPercentText}%</small></span>
        <span className="vip"><i aria-hidden="true" /><b>{safeVip.toLocaleString()} {vipLabel}</b><small>{vipPercentText}%</small></span>
      </div>
    </div>
  );
}
