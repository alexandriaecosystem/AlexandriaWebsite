import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { getTokenMonitorData, type TokenMonitorData, type TokenTransfer } from '../services/token-monitor';
import { LoadingState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import '../token-monitor.css';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-6)}` : value;
}

function addressLabel(address: string, tag: string) {
  return tag || shortAddress(address);
}

function transferUrl(id: string) {
  return `https://tronscan.org/#/transaction/${encodeURIComponent(id)}`;
}

function addressUrl(address: string) {
  return `https://tronscan.org/#/address/${encodeURIComponent(address)}`;
}

function TransferChart({ transfers, symbol }: { transfers: TokenTransfer[]; symbol: string }) {
  const rows = transfers.slice(0, 20).reverse();
  const max = Math.max(...rows.map((item) => item.amount), 1);
  if (!rows.length) return <p className="token-empty">No transfer data returned.</p>;
  return (
    <div className="token-transfer-chart" aria-label="Recent transfer size chart">
      {rows.map((item) => {
        const height = Math.max(4, (item.amount / max) * 100);
        return (
          <a
            href={transferUrl(item.transactionId)}
            target="_blank"
            rel="noreferrer"
            key={item.transactionId}
            className="token-transfer-bar-column"
            title={`${number.format(item.amount)} ${symbol}`}
          >
            <span className={item.riskTransaction ? 'token-transfer-bar risk' : 'token-transfer-bar'} style={{ height: `${height}%` }} />
          </a>
        );
      })}
    </div>
  );
}

export function TokenMonitorPage() {
  const { tr, isArabic } = useLanguage();
  const [data, setData] = useState<TokenMonitorData>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError('');
    setData(undefined);
    void getTokenMonitorData(getSupabaseClient())
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load on-chain data.', 'تعذر تحميل بيانات السلسلة.')));
  }, [reload, tr]);

  const latest = useMemo(() => data?.transfers.slice(0, 25) ?? [], [data]);

  if (error) {
    return <>
      <header className="page-header"><div><p className="eyebrow">{tr('TRON on-chain data', 'بيانات TRON على السلسلة')}</p><h1>{tr('Token monitor', 'مراقبة التوكن')}</h1></div></header>
      <section className="panel token-config-panel">
        <h2>{tr('TRONSCAN connection required', 'مطلوب اتصال TRONSCAN')}</h2>
        <p className="muted">{error}</p>
        <p className="muted">{tr('The integration is server-side so the TRONSCAN API key is never exposed in the browser.', 'التكامل يعمل من جهة الخادم حتى لا يظهر مفتاح TRONSCAN API في المتصفح.')}</p>
        <button className="primary" type="button" onClick={() => setReload((n) => n + 1)}>{tr('Try again', 'إعادة المحاولة')}</button>
      </section>
    </>;
  }

  if (!data) return <LoadingState label={tr('Loading TRONSCAN token data', 'جارٍ تحميل بيانات التوكن من TRONSCAN')} />;

  const token = data.token;
  const largest = data.summary.largestTransfer;

  return <>
    <header className="page-header token-monitor-header">
      <div>
        <p className="eyebrow">{tr('TRON on-chain data', 'بيانات TRON على السلسلة')}</p>
        <div className="token-title-row">
          {token.iconUrl && <img src={token.iconUrl} alt="" className="token-logo" />}
          <div><h1>{token.name || tr('Token monitor', 'مراقبة التوكن')}</h1><p className="muted page-subtitle"><strong dir="ltr">{token.symbol || 'TRC20'}</strong> · <span className="mono" dir="ltr">{data.contract}</span></p></div>
        </div>
      </div>
      <div className="header-status-group"><span className="status-pill positive">{tr('Live from TRONSCAN', 'مباشر من TRONSCAN')}</span>{token.riskTag && <span className="status-pill negative">{token.riskTag}</span>}</div>
    </header>

    <section className="metric-grid token-metrics">
      <article className="metric-card"><span>{tr('Holders', 'حاملو التوكن')}</span><strong>{compact.format(token.holdersCount)}</strong><small>{token.holdersCount.toLocaleString()} {tr('addresses', 'عنوان')}</small></article>
      <article className="metric-card"><span>{tr('Transfers · 24h', 'التحويلات · 24 ساعة')}</span><strong>{compact.format(token.transfers24h)}</strong><small>{token.transfer24hRate ? `${(token.transfer24hRate * 100).toFixed(2)}%` : tr('No change data', 'لا توجد بيانات تغير')}</small></article>
      <article className="metric-card"><span>{tr('Total supply', 'إجمالي المعروض')}</span><strong>{compact.format(token.totalSupply)}</strong><small>{number.format(token.totalSupply)} {token.symbol}</small></article>
      <article className="metric-card"><span>{tr('Price', 'السعر')}</span><strong>{token.priceUsd ? money.format(token.priceUsd) : '—'}</strong><small>{token.priceChange24h ? `${(token.priceChange24h * 100).toFixed(2)}% ${tr('24h', '24 ساعة')}` : tr('No market price reported', 'لا يوجد سعر سوق مُبلّغ')}</small></article>
      <article className="metric-card"><span>{tr('Market cap', 'القيمة السوقية')}</span><strong>{token.marketCapUsd ? money.format(token.marketCapUsd) : '—'}</strong><small>{tr('TRONSCAN reported', 'بحسب TRONSCAN')}</small></article>
      <article className="metric-card"><span>{tr('Latest 50 volume', 'حجم آخر 50 تحويل')}</span><strong>{compact.format(data.summary.recentVolume)}</strong><small>{data.summary.uniqueAddresses} {tr('unique addresses', 'عنوان فريد')}</small></article>
    </section>

    <section className="token-monitor-grid">
      <article className="panel token-chart-panel">
        <div className="section-heading"><div><p className="eyebrow">{tr('Recent transfers', 'التحويلات الأخيرة')}</p><h2>{tr('Transfer size', 'حجم التحويل')}</h2></div><span className="status-pill neutral">{data.summary.fetchedTransfers} {tr('fetched', 'تم جلبها')}</span></div>
        <TransferChart transfers={data.transfers} symbol={token.symbol} />
        <p className="muted token-chart-note">{tr('Each bar is one of the latest transfers. Taller bars represent larger token amounts.', 'يمثل كل عمود تحويلاً حديثاً، وكلما زاد ارتفاعه كان مبلغ التوكن أكبر.')}</p>
      </article>

      <article className="panel token-watch-panel">
        <p className="eyebrow">{tr('Transfer watch', 'مراقبة التحويلات')}</p><h2>{tr('Latest batch summary', 'ملخص آخر دفعة')}</h2>
        <div className="settings-list">
          <div><span>{tr('Largest transfer', 'أكبر تحويل')}</span><strong>{largest ? `${number.format(largest.amount)} ${token.symbol}` : '—'}</strong></div>
          <div><span>{tr('Unique addresses', 'العناوين الفريدة')}</span><strong>{data.summary.uniqueAddresses}</strong></div>
          <div><span>{tr('Failed transfers', 'التحويلات الفاشلة')}</span><strong>{data.summary.failedCount}</strong></div>
          <div><span>{tr('TRONSCAN risk flags', 'إشارات المخاطر من TRONSCAN')}</span><strong>{data.summary.riskCount}</strong></div>
          <div><span>{tr('Last refreshed', 'آخر تحديث')}</span><strong>{new Date(data.fetchedAt).toLocaleString(isArabic ? 'ar-LB' : undefined)}</strong></div>
        </div>
      </article>
    </section>

    <section className="table-card token-transfer-table">
      <div className="section-heading token-table-heading"><div><p className="eyebrow">{tr('Blockchain activity', 'نشاط البلوكشين')}</p><h2>{tr('Latest transfers', 'أحدث التحويلات')}</h2></div><a className="row-link" href="https://tronscan.org/#/token20/TEoUqbkBtzSbGmUspNP3ztqVx7AzqhCLJr/transfers" target="_blank" rel="noreferrer">TRONSCAN ↗</a></div>
      <div className="table-scroll"><table><thead><tr><th>{tr('Time', 'الوقت')}</th><th>{tr('From', 'من')}</th><th>{tr('To', 'إلى')}</th><th>{tr('Amount', 'المبلغ')}</th><th>{tr('Result', 'النتيجة')}</th><th>{tr('Transaction', 'المعاملة')}</th></tr></thead><tbody>
        {latest.map((item) => <tr key={item.transactionId}>
          <td>{new Date(item.timestamp).toLocaleString(isArabic ? 'ar-LB' : undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
          <td><a href={addressUrl(item.from)} target="_blank" rel="noreferrer" className="token-address-link" dir="ltr" title={item.from}>{addressLabel(item.from, item.fromTag)}</a>{item.fromIsContract && <small className="table-subtext">Contract</small>}</td>
          <td><a href={addressUrl(item.to)} target="_blank" rel="noreferrer" className="token-address-link" dir="ltr" title={item.to}>{addressLabel(item.to, item.toTag)}</a>{item.toIsContract && <small className="table-subtext">Contract</small>}</td>
          <td><strong>{number.format(item.amount)}</strong><small className="table-subtext">{token.symbol}</small></td>
          <td><span className={`status-pill ${item.result === 'SUCCESS' ? 'positive' : 'negative'}`}>{item.result}</span>{item.riskTransaction && <span className="status-pill negative token-risk-pill">Risk</span>}</td>
          <td><a className="row-link mono" href={transferUrl(item.transactionId)} target="_blank" rel="noreferrer">{item.transactionId.slice(0, 10)}… ↗</a></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </>;
}
