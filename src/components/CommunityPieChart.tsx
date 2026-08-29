type CommunityPieChartProps = {
  label: string;
  general: number;
  vip: number;
  generalLabel?: string;
  vipLabel?: string;
  compact?: boolean;
};

type PlatformUsersPieChartProps = {
  telegram: number;
  discord: number;
  whatsapp: number;
  label?: string;
};

function percentLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function safeCount(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export function CommunityPieChart({
  label,
  general,
  vip,
  generalLabel = 'General',
  vipLabel = 'VIP',
  compact = false,
}: CommunityPieChartProps) {
  const safeGeneral = safeCount(general);
  const safeVip = safeCount(vip);
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

export function PlatformUsersPieChart({
  telegram,
  discord,
  whatsapp,
  label = 'Users by platform',
}: PlatformUsersPieChartProps) {
  const telegramCount = safeCount(telegram);
  const discordCount = safeCount(discord);
  const whatsappCount = safeCount(whatsapp);
  const total = telegramCount + discordCount + whatsappCount;

  const percentage = (value: number) => total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
  const telegramPercent = percentage(telegramCount);
  const discordPercent = percentage(discordCount);
  const whatsappPercent = percentage(whatsappCount);
  const telegramEnd = total === 0 ? 0 : (telegramCount / total) * 100;
  const discordEnd = total === 0 ? 0 : ((telegramCount + discordCount) / total) * 100;
  const chartBackground = total === 0
    ? 'var(--border)'
    : `conic-gradient(#229ed9 0 ${telegramEnd}%, #5865f2 ${telegramEnd}% ${discordEnd}%, #25d366 ${discordEnd}% 100%)`;

  return (
    <div className="community-pie platform-users-pie">
      <div
        className="community-pie-visual"
        role="img"
        aria-label={`${label}: Telegram ${telegramCount} (${percentLabel(telegramPercent)}%), Discord ${discordCount} (${percentLabel(discordPercent)}%), WhatsApp ${whatsappCount} (${percentLabel(whatsappPercent)}%)`}
        style={{ background: chartBackground }}
      >
        <span aria-hidden="true" className="community-pie-center">
          <strong>{total.toLocaleString()}</strong>
          <small>{label}</small>
        </span>
      </div>
      <div className="community-pie-legend platform-users-legend">
        <span className="telegram"><i aria-hidden="true" /><b>{telegramCount.toLocaleString()} Telegram</b><small>{percentLabel(telegramPercent)}%</small></span>
        <span className="discord"><i aria-hidden="true" /><b>{discordCount.toLocaleString()} Discord</b><small>{percentLabel(discordPercent)}%</small></span>
        <span className="whatsapp"><i aria-hidden="true" /><b>{whatsappCount.toLocaleString()} WhatsApp</b><small>{percentLabel(whatsappPercent)}%</small></span>
      </div>
    </div>
  );
}
