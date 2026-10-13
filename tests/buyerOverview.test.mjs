import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const formatters = await readFile(new URL('../src/utils/formatters.js', import.meta.url), 'utf8');
const currencyFunction = formatters.slice(formatters.indexOf('export function formatCurrency'), formatters.indexOf('export function titleCase')).replace('export ', '');
const formatCurrency = new Function(`${currencyFunction};return formatCurrency;`)();

const source = await readFile(new URL('../src/features/buyer/BuyerDashboard.jsx', import.meta.url), 'utf8');
const start = source.indexOf('<div className="buyer-order-summary');
const markup = source.slice(start, source.indexOf('</section>', start)).trim();
const { code } = await transformWithOxc(`function Overview() { return (${markup}); }`, 'Overview.jsx', { jsx: { runtime: 'classic' } });
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(text).join('');
function render(isLoading = false) {
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    Link: 'link', ClipboardList: 'clipboard', Clock3: 'clock', CheckCircle2: 'check', Wallet: 'wallet', ArrowRight: 'arrow',
    orders: Array(108), pendingOrders: Array(41), completedOrders: Array(27), totalSpend: 2584.94, formatCurrency, isLoading,
    BuyerSummaryTrend: 'summary-trend', spendTrend: [{ label: 'Today', revenue: 100 }],
    orderTrend: [{ label: 'Today', count: 2 }], pendingTrend: [{ label: 'Today', count: 1 }],
    completedTrend: [{ label: 'Today', count: 1 }], recentOrderCount: 12, recentPendingCount: 6, recentCompletedCount: 8,
    onlinePaymentTotal: 878.44, onlinePaymentTrend: [{ label: 'Today', revenue: 50 }], onlinePaymentIcon: '/payment.png',
  };
  return new Function('scope', `with(scope){${code};return Overview();}`)(scope);
}

test('buyer overview retains live values and existing currency formatting', () => {
  const tree = render();
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'strong').map(text), [formatCurrency(2584.94), formatCurrency(878.44), '108', '41', '27']);
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'small').map(text), [
    'Paid orders', 'Paid via GCash', '12 orders placed', '6 awaiting confirmation', '8 orders received',
  ]);
});

test('every card retains its existing destination and filter state', () => {
  const links = nodes(render()).filter((node) => node.type === 'link');
  assert.equal(links.length, 5);
  assert.ok(links.every((node) => node.props.to === '/buyer-orders'));
  assert.deepEqual(links.map((node) => node.props.state), [{ paymentFilter: 'paid' }, { paymentFilter: 'paid', paymentMethodFilter: 'gcash' }, undefined, { stage: 'pending' }, { stage: 'completed' }]);
});

test('loading still displays placeholders instead of example values', () => {
  assert.deepEqual(nodes(render(true)).filter((node) => node.type === 'strong').map(text), ['...', '...', '...', '...', '...']);
});

test('all five summary cards show seven-day trends, and order helper counts use real order data', () => {
  const trends = nodes(render()).filter((node) => node.type === 'summary-trend');
  assert.deepEqual(trends.map((node) => node.props.points), [
    [{ label: 'Today', revenue: 100 }],
    [{ label: 'Today', revenue: 50 }],
    [{ label: 'Today', count: 2 }],
    [{ label: 'Today', count: 1 }],
    [{ label: 'Today', count: 1 }],
  ]);
  assert.match(source, /getReportRevenue\(orders, '7d'\)/);
  assert.match(source, /ariaLabel="Paid order spending over the last 7 days"/);
  assert.match(source, /getSevenDayOrderCounts\(orders\)/);
  assert.match(source, /getSevenDayOrderCounts\(orders, \{ status: 'pending' \}\)/);
  assert.match(source, /getSevenDayOrderCounts\(orders, \{ status: 'completed', dateField: 'updatedAt' \}\)/);
  assert.match(source, /recentOrderCount} orders placed/);
  assert.match(source, /recentPendingCount} awaiting confirmation/);
  assert.match(source, /recentCompletedCount} orders received/);
});

test('Dark summary-card surfaces remain restrained and scoped to the five cards', async () => {
  const css = await readFile(new URL('../src/features/buyer/BuyerOverview.css', import.meta.url), 'utf8');
  const darkSurfaces = [...css.matchAll(/([^{}]+)\{([^{}]*--summary-background:[^{}]*)\}/g)];
  assert.equal(darkSurfaces.length, 6);
  for (const [, selector, body] of darkSurfaces) {
    assert.ok(selector.includes("[data-theme='dark']"));
    assert.ok(selector.includes('.buyer-order-summary.buyer-summary-cards .buyer-summary-item'));
    assert.doesNotMatch(body, /linear-gradient|box-shadow/);
  }
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /stroke-width: 1\.6/);
  assert.match(css, /\.buyer-summary-trend-line\s*\{[^}]*stroke-linecap: round/);
  assert.match(css, /\.buyer-summary-item > small\s*\{[^}]*grid-row: 4/);
  assert.match(css, /\.buyer-summary-item \{[\s\S]*?grid-template-rows: minmax\(21px, auto\) minmax\(38px, auto\) 46px minmax\(20px, auto\);[\s\S]*?min-height: 156px;[\s\S]*?padding: 12px 14px;[\s\S]*?border-radius: 10px/);
  assert.match(css, /\.buyer-summary-trend svg \{[\s\S]*?height: 26px/);
  assert.match(css, /@container \(max-width: 680px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 440px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test('Trend charts distinguish real activity, empty periods and loading', async () => {
  const trendSource = source.slice(source.indexOf('function BuyerSummaryTrend'), source.indexOf('export default function BuyerDashboard'));
  const { code: trendCode } = await transformWithOxc(trendSource, 'Trend.jsx', { jsx: { runtime: 'classic' } });
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const renderTrend = new Function('React', `${trendCode}; return BuyerSummaryTrend;`)(React);
  const empty = renderTrend({ points: [{ count: 0 }, { count: 0 }], valueKey: 'count' });
  assert.match(text(empty), /Last 7 daysNo recent activity/);
  assert.equal(nodes(empty).filter((node) => node.type === 'svg').length, 0);
  const loading = renderTrend({ points: [], valueKey: 'count', isLoading: true });
  assert.match(text(loading), /Loading/);
  assert.doesNotMatch(text(loading), /No recent activity/);
  const active = renderTrend({ points: [{ count: 0 }, { count: 3 }], valueKey: 'count', ariaLabel: 'Recent orders' });
  assert.equal(nodes(active).filter((node) => node.type === 'path').length, 1);
  assert.equal(nodes(active).find((node) => node.type === 'svg').props['aria-label'], 'Recent orders');
});

test('Summary typography uses the native system stack with clear, scoped hierarchy', async () => {
  const css = await readFile(new URL('../src/features/buyer/BuyerOverview.css', import.meta.url), 'utf8');
  assert.match(css, /\.buyer-overview \.buyer-order-summary\.buyer-summary-cards\s*\{[^}]*font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(css, /\.buyer-summary-label\s*\{[^}]*font-size: 14px;[^}]*font-weight: 600/);
  assert.match(css, /\.buyer-summary-item > strong\s*\{[^}]*font-size: 30px;[^}]*font-weight: 600/);
  assert.match(css, /\.buyer-summary-item > small\s*\{[^}]*font-size: 13px;[^}]*font-weight: 400/);
  assert.doesNotMatch(css, /text-shadow:|letter-spacing:\s*-/);
});
