import { createClient } from '@supabase/supabase-js';
import LiveTime from './LiveTime';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CAT_LABELS = {
  pizza: 'Pizza', sandwich: 'Sandwich', burger: 'Burger',
  maggi: 'Maggi', pasta: 'Pasta', fries: 'Fries',
  garlic_bread: 'Garlic Bread', shakes: 'Shakes',
  cold_coffee: 'Cold Coffee', hot_beverages: 'Hot Beverages',
};

const CAT_ICONS = {
  pizza: '🍕', sandwich: '🥪', burger: '🍔', maggi: '🍜',
  pasta: '🍝', fries: '🍟', garlic_bread: '🥖', shakes: '🥤',
  cold_coffee: '🧋', hot_beverages: '☕',
};

const GENERIC_LABELS = ['taste', 'crispy', 'fresh'];
const isGeneric = (label) => GENERIC_LABELS.includes(label.toLowerCase().trim());

// ── 2–3 bullet action points ──────────────────────────────────
function getActionBullets(label, category) {
  const l   = label.toLowerCase();
  const cat = CAT_LABELS[category] || category;
  if (l.includes('taste'))                             return [`Taste the ${cat} yourself right now`, 'Check seasoning — adjust salt, spice, or sauce', 'Verify ingredient freshness with kitchen'];
  if (l.includes('hot') && !l.includes('cold'))        return ['Check holding temp — must be above 65°C', 'Reduce time between cooking and plating to under 3 min', 'Warm serving containers before use'];
  if (l.includes('cold') && !l.includes('hot'))        return ['Check fridge temp — must be below 4°C', 'Pre-chill glasses and containers before serving', 'Never leave drinks out before serving'];
  if (l.includes('crispy'))                            return ['Check oil temp — 170–180°C for frying', 'Serve immediately, do not cover or stack', 'Replace oil if it looks dark or smells off'];
  if (l.includes('quantity') || l.includes('filling') || l.includes('enough'))
                                                       return [`Measure ${cat} portion against your standard`, 'Check if kitchen is using correct scoop/weight', 'Brief staff to add more if in doubt'];
  if (l.includes('fresh'))                             return ['Inspect ingredient batch — check expiry and smell', 'Replace anything that looks or smells off', "Check today's delivery date"];
  if (l.includes('thick') || l.includes('cream'))     return ['Check mix ratio — too much ice makes it watery', 'Add more ice cream or base mix', 'Blend longer for smooth consistency'];
  if (l.includes('consist'))                           return ['Use standard recipe card for every order', 'Measure milk/syrup with a measuring cup', 'Brief staff: no freestyling quantities'];
  if (l.includes('topping'))                           return ['Check topping quantity vs standard recipe', 'Distribute evenly — not bunched in one spot', 'Verify topping freshness, replace if stale'];
  if (l.includes('patty'))                             return ['Check patty freshness — color, smell, texture', 'Cook to 75°C internal temp, no shortcuts', 'Cook fresh per order — no pre-cooking'];
  if (l.includes('sauce'))                             return ['Taste the sauce — bland = fix ratio now', 'Check sauce batch freshness and expiry', 'Verify quantity matches standard recipe'];
  if (l.includes('garlic') || l.includes('cheese'))   return ['Use measured garlic butter spread per piece', 'Distribute cheese evenly before baking', 'Add 1–2 more minutes in oven if pale'];
  if (l.includes('assembled') || l.includes('proper')) return ['Follow assembly order on recipe card', 'Assemble fresh per order — not in advance', 'Check all components are present before serving'];
  return [`Check ${cat} prep against recipe card`, 'Taste before serving, adjust if needed', 'Brief kitchen on quality standards now'];
}

// ── Helpers ───────────────────────────────────────────────────
function avg(arr) {
  const c = arr.filter((v) => v != null);
  if (!c.length) return null;
  return c.reduce((a, b) => a + b, 0) / c.length;
}
function rowAvg(r) { return avg([r.q1, r.q2, r.q3]); }

function getPriority(a) {
  if (a < 2.5) return { level: 'critical',   label: '🔴 CRITICAL',        cls: 'priority--critical'  };
  if (a < 3.5) return { level: 'attention',  label: '🟠 NEEDS ATTENTION', cls: 'priority--attention' };
  return             { level: 'good',        label: '🟢 GOOD',            cls: 'priority--good'      };
}
const PRIORITY_ORDER = { critical: 0, attention: 1, good: 2 };

function catAvg(rows, cat) {
  const vals = rows.filter((r) => r.category === cat).flatMap((r) => [r.q1, r.q2, r.q3]).filter((v) => v != null);
  return avg(vals);
}

function worstQuestion(rows, cat) {
  const catRows = rows.filter((r) => r.category === cat);
  const byLabel = {};
  for (const r of catRows)
    for (const [q, label] of [[r.q1, r.q1_label],[r.q2, r.q2_label],[r.q3, r.q3_label]])
      if (q != null && label) { if (!byLabel[label]) byLabel[label] = []; byLabel[label].push(q); }
  let worstLabel = null, worstA = Infinity;
  for (const [label, vals] of Object.entries(byLabel)) { const a = avg(vals); if (a < worstA) { worstA = a; worstLabel = label; } }
  return worstLabel ? { label: worstLabel, avg: worstA } : null;
}

function unhappyCount(rows, cat, worstLabel) {
  const catRows = rows.filter((r) => r.category === cat).slice(0, 10);
  if (catRows.length < 2) return null;
  const u = catRows.filter((r) => {
    const pairs = [[r.q1,r.q1_label],[r.q2,r.q2_label],[r.q3,r.q3_label]];
    const match = pairs.find(([,l]) => l === worstLabel);
    return match && match[0] <= 2;
  }).length;
  return u > 0 ? { unhappy: u, total: catRows.length } : null;
}

function getTrend(rows, cat, worstLabel) {
  const vals = rows.filter((r) => r.category === cat).map((r) => {
    const match = [[r.q1,r.q1_label],[r.q2,r.q2_label],[r.q3,r.q3_label]].find(([,l]) => l === worstLabel);
    return match ? match[0] : null;
  }).filter((v) => v != null);
  if (vals.length < 6) return null;
  const recent = avg(vals.slice(0, 5)), older = avg(vals.slice(5, 10));
  if (older === null) return null;
  if (recent < older - 0.3) return 'worse';
  if (recent > older + 0.3) return 'improving';
  return 'stable';
}

function lastIssueTime(rows, cat) {
  const catRows = rows.filter((r) => r.category === cat);
  if (!catRows.length) return null;
  return catRows[0].created_at;
}

function isUrgent(trend, unhappy) {
  if (trend === 'worse') return true;
  if (unhappy && unhappy.unhappy / unhappy.total >= 0.5) return true;
  return false;
}

function timeAgo(dateStr) {
  const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const secs = Math.floor((Date.now() - new Date(utcStr).getTime()) / 1000);
  if (secs < 90)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return 'earlier today';
}



function buildCards(rows) {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  return cats.map((cat) => {
    const a = catAvg(rows, cat);
    if (a === null) return null;
    const priority = getPriority(a);
    const wq       = worstQuestion(rows, cat);
    const unhappy  = wq ? unhappyCount(rows, cat, wq.label) : null;
    const trend    = wq ? getTrend(rows, cat, wq.label) : null;
    const lastIssue = lastIssueTime(rows, cat);
    const bullets  = wq ? getActionBullets(wq.label, cat) : [];
    const urgent   = isUrgent(trend, unhappy);
    const count    = rows.filter((r) => r.category === cat).length;
    const generic  = wq ? isGeneric(wq.label) : false;
    return { cat, avg: a, priority, wq, unhappy, trend, lastIssue, bullets, urgent, count, generic };
  }).filter(Boolean).sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority.level] - PRIORITY_ORDER[b.priority.level];
    return po !== 0 ? po : a.avg - b.avg;
  });
}

async function getTodayFeedback() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('feedback')
    .select('category,q1,q1_label,q2,q2_label,q3,q3_label,created_at')
    .gte('created_at', startOfDay.toISOString())
    .not('q1', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const dynamic   = 'force-dynamic';
export const revalidate = 0;


const TREND_CFG = {
  worse:     { text: '↓ getting worse', cls: 'trend-badge trend-badge--down' },
  improving: { text: '↑ improving',     cls: 'trend-badge trend-badge--up'   },
  stable:    { text: '→ stable',         cls: 'trend-badge trend-badge--flat' },
};

function severityHint(a) {
  if (a < 2.5) return 'critical';
  if (a < 3.5) return 'low';
  return 'good';
}

export default async function OwnerPage() {
  let rows = [], fetchError = null;
  try { rows = await getTodayFeedback(); }
  catch (err) { fetchError = err.message ?? 'Unknown error'; }

  const total        = rows.length;
  const overall      = avg(rows.flatMap((r) => [r.q1, r.q2, r.q3]));
  const cards        = total > 0 ? buildCards(rows) : [];
  const lastSeenAt   = rows[0]?.created_at ?? null;
  const todayLabel   = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="ow-shell">
      <header className="ow-header">
        <span className="ow-brand">RateMyMeal</span>
        <span className="ow-date">{todayLabel}</span>
      </header>

      {fetchError && <div className="ow-card ow-error">⚠️ Could not load data: {fetchError}</div>}

      {!fetchError && total === 0 && (
        <div className="ow-card ow-empty">
          <p className="ow-empty-icon">☕</p>
          <p className="ow-empty-title">No feedback yet today</p>
          <p className="ow-empty-sub">Check back after the first meal service.</p>
        </div>
      )}

      {total > 0 && (
        <div className="ow-card ow-summary">
          <div className="ow-stat"><span className="ow-stat-value">{total}</span><span className="ow-stat-label">responses</span></div>
          <div className="ow-divider" />
          <div className="ow-stat"><span className="ow-stat-value">{overall?.toFixed(1) ?? '—'}<small>/5</small></span><span className="ow-stat-label">avg rating</span></div>
          {lastSeenAt && <><div className="ow-divider" /><div className="ow-stat"><LiveTime dateStr={lastSeenAt} className="ow-stat-value ow-stat-value--sm" /><span className="ow-stat-label">last feedback</span></div></>}
        </div>
      )}

      {cards.map(({ cat, avg: catA, priority, wq, unhappy, trend, lastIssue, bullets, urgent, count, generic }) => (
        <div key={cat} className={`ow-card ow-cat-card ow-cat-card--${priority.level} ${urgent && priority.level === 'critical' ? 'ow-cat-card--urgent' : ''}`}>

          <div className="ow-cat-header">
            <span className="ow-cat-icon">{CAT_ICONS[cat] || '🍴'}</span>
            <span className="ow-cat-name">{CAT_LABELS[cat] || cat}</span>
            <span className={`ow-priority-label ${priority.cls}`}>{priority.label}</span>
            {trend && <span className={TREND_CFG[trend].cls}>{TREND_CFG[trend].text}</span>}
          </div>

          <div className="ow-score-row">
            <span className="ow-cat-score">{catA.toFixed(1)}<small>/5</small></span>
            <span className={`ow-severity-hint ow-severity-hint--${severityHint(catA)}`}>({severityHint(catA)})</span>
            <span className="ow-cat-count">{count} {count === 1 ? 'response' : 'responses'}</span>
          </div>

          {unhappy && wq && (
            <p className={`ow-warning-line ${generic ? 'ow-warning-line--muted' : ''}`}>
              ⚠️ <strong>{unhappy.unhappy} of last {unhappy.total}</strong> customers unhappy with <strong>{wq.label}</strong>
            </p>
          )}

          {lastIssue && (
            <p className="ow-peak-line">🕒 Last issue: <LiveTime dateStr={lastIssue} /></p>
          )}

          {bullets.length > 0 && (
            <>
              <p className="ow-fix-label">→ Fix now:</p>
              <ul className="ow-fix-list">
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </>
          )}
        </div>
      ))}

      <p className="ow-refresh">Sorted by priority · Refreshes every 60 s</p>
    </div>
  );
}
