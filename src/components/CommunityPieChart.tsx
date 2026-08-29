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

type Segment = {
  value: number;
  percent: number;
  offset: number;
  className: string;
};

function percentLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function safeCount(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
}

function DonutSvg({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <svg className="community-donut-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle className="community-donut-track" cx="60" cy="60" r="48" pathLength="100" />
      {total > 0 && segments.map((segment) => (
        <circle
          key={segment.className}
          className={`community-donut-segment ${segment.className}`}
          cx="60"
          cy="60"
          r="48"
          pathLength="100"
          strokeDasharray={`${segment.percent} ${Math.max(0, 100 - segment.percent)}`}
          strokeDashoffset={-segment.offset}
        />
      ))}
    </svg>
  );
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
  const vipPercent = percentage(safeVip, total);
  const generalPercent = total === 0 ? 0 : Math.round((100 - vipPercent) * 10) / 10;
  const vipPercentText = percentLabel(vipPercent);
  const generalPercentText = percentLabel(generalPercent);
  const segments: Segment[] = [
    { value: safeGeneral, percent: generalPercent, offset: 0, className: 'general-segment' },
    { value: safeVip, percent: vipPercent, offset: generalPercent, className: 'vip-segment' },
  ];

  return (
    <div className={`community-pie ${compact ? 'compact' : ''}`}>
      <div
        className="community-pie-visual"
        role="img"
        aria-label={`${label}: ${safeGeneral} ${generalLabel} (${generalPercentText}%), ${safeVip} ${vipLabel} (${vipPercentText}%)`}
        data-vip-percent={String(vipPercent)}
      >
        <DonutSvg segments={segments} />
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

  const telegramPercent = percentage(telegramCount, total);
  const discordPercent = percentage(discordCount, total);
  const whatsappPercent = percentage(whatsappCount, total);
  const segments: Segment[] = [
    { value: telegramCount, percent: telegramPercent, offset: 0, className: 'telegram-segment' },
    { value: discordCount, percent: discordPercent, offset: telegramPercent, className: 'discord-segment' },
    { value: whatsappCount, percent: whatsappPercent, offset: telegramPercent + discordPercent, className: 'whatsapp-segment' },
  ];

  return (
    <div className="community-pie platform-users-pie">
      <div
        className="community-pie-visual"
        role="img"
        aria-label={`${label}: Telegram ${telegramCount} (${percentLabel(telegramPercent)}%), Discord ${discordCount} (${percentLabel(discordPercent)}%), WhatsApp ${whatsappCount} (${percentLabel(whatsappPercent)}%)`}
      >
        <DonutSvg segments={segments} />
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
