import { createClient } from '@supabase/supabase-js';

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

// ── Action suggestions ────────────────────────────────────────
function getActionForLabel(label, category) {
  const l   = label.toLowerCase();
  const cat = CAT_LABELS[category] || category;
  if (l.includes('taste'))                       return `Taste of ${cat} is low. Ask kitchen to taste and adjust seasoning right now.`;
  if (l.includes('hot') && !l.includes('cold'))  return `${cat} is not hot enough. Serve above 65°C — check holding time and plating delay.`;
  if (l.includes('cold') && !l.includes('hot'))  return `${cat} is not cold enough. Check refrigeration and pre-chill before serving.`;
  if (l.includes('crispy'))                      return `${cat} losing crispiness. Check oil temp and serve immediately after cooking.`;
  if (l.includes('quantity') || l.includes('filling') || l.includes('enough'))
                                                 return `Portions of ${cat} feel small. Supervisor should verify serving sizes now.`;
  if (l.includes('fresh'))                       return `${cat} ingredients may not be fresh. Check and replace before next batch.`;
  if (l.includes('thick') || l.includes('cream')) return `${cat} consistency is off. Adjust mix ratio or ice cream quantity.`;
  if (l.includes('consist'))                     return `${cat} prep is inconsistent. Use measured quantities for every order.`;
  if (l.includes('topping'))                     return `Toppings on ${cat} are low-rated. Check quantity and freshness now.`;
  if (l.includes('patty'))                       return `Patty in ${cat} is poor. Check freshness and cooking time before next order.`;
  if (l.includes('sauce'))                       return `Sauce in ${cat} is off. Verify freshness and preparation ratio.`;
  if (l.includes('garlic') || l.includes('cheese')) return `Garlic/cheese flavor is weak in ${cat}. Check butter quantity and even spread.`;
  if (l.includes('assembled') || l.includes('proper')) return `${cat} assembly is poor. Brief kitchen on proper build and presentation.`;
  return `Quality issue flagged for ${cat}. Brief kitchen staff on standards before next service.`;
}

// ── Helpers ───────────────────────────────────────────────────
function avg(arr) {
  const clean = arr.filter((v) => v != null);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function rowAvg(r) { return avg([r.q1, r.q2, r.q3]); }

// Priority label + class
function getPriority(a) {
  if (a < 2.5) return { label: '🔴 CRITICAL',         cls: 'priority--critical' };
  if (a < 3.5) return { label: '🟠 NEEDS ATTENTION',  cls: 'priority--attention' };
  return             { label: '🟢 LOOKING GOOD',       cls: 'priority--good' };
}

// Worst category by avg q1+q2+q3 (min 2 entries)
function findWorstCategory(rows) {
  const byCat = {};
  for (const r of rows) {
    const cat = r.category || 'unknown';
    if (!byCat[cat]) byCat[cat] = [];
    [r.q1, r.q2, r.q3].filter((v) => v != null).forEach((v) => byCat[cat].push(v));
  }
  let worstCat = null, worstA = Infinity;
  for (const [cat, vals] of Object.entries(byCat)) {
    if (vals.length < 2) continue;
    const a = avg(vals);
    if (a < worstA) { worstA = a; worstCat = cat; }
  }
  return worstCat ? { category: worstCat, avg: worstA } : null;
}

// Worst question label in a category
function findWorstQuestion(rows, category) {
  const catRows = rows.filter((r) => r.category === category);
  const byLabel = {};
  for (const r of catRows) {
    for (const [q, label] of [[r.q1, r.q1_label], [r.q2, r.q2_label], [r.q3, r.q3_label]]) {
      if (q != null && label) {
        if (!byLabel[label]) byLabel[label] = [];
        byLabel[label].push(q);
      }
    }
  }
  let worstLabel = null, worstA = Infinity;
  for (const [label, vals] of Object.entries(byLabel)) {
    const a = avg(vals);
    if (a < worstA) { worstA = a; worstLabel = label; }
  }
  return worstLabel ? { label: worstLabel, avg: worstA } : null;
}

// Unhappy count: last 10 entries in category where any q ≤ 2
function getUnhappyCount(rows, category) {
  const catRows = rows.filter((r) => r.category === category).slice(0, 10);
  if (catRows.length < 2) return null;
  const unhappy = catRows.filter((r) =>
    [r.q1, r.q2, r.q3].filter((v) => v != null).some((v) => v <= 2)
  ).length;
  return unhappy > 0 ? { unhappy, total: catRows.length } : null;
}

// Trend: last 5 vs previous 5 for a category
function getTrend(rows, category) {
  const vals = rows
    .filter((r) => r.category === category)
    .map((r) => rowAvg(r))
    .filter((v) => v != null);
  if (vals.length < 6) return null;
  const recent = avg(vals.slice(0, 5));
  const older  = avg(vals.slice(5, 10));
  if (older === null) return null;
  if (recent < older - 0.3) return 'worse';
  if (recent > older + 0.3) return 'improving';
  return 'stable';
}

// Time of day where the issue is worst for a category
function getProblemTimePeriod(rows, category) {
  const catRows = rows.filter((r) => r.category === category);
  const periods = { Morning: [], Afternoon: [], Evening: [] };
  for (const r of catRows) {
    const h = new Date(r.created_at).getHours();
    const p = h >= 6 && h < 12 ? 'Morning' : h >= 12 && h < 18 ? 'Afternoon' : h >= 18 ? 'Evening' : null;
    if (p) {
      const a = rowAvg(r);
      if (a != null) periods[p].push(a);
    }
  }
  let worstPeriod = null, worstA = Infinity;
  for (const [p, vals] of Object.entries(periods)) {
    if (vals.length < 2) continue;
    const a = avg(vals);
    if (a < worstA) { worstA = a; worstPeriod = p; }
  }
  return worstPeriod;
}

// Relative time
function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return 'earlier today';
}

// Negative comment snippets for a category
function getNegativeSnippets(rows, category) {
  const POSITIVE = ['great','good','excellent','amazing','awesome','perfect',
    'love','loved','wonderful','fantastic','best','delicious','nice',
    'happy','satisfied','enjoy','enjoyed','fresh','clean','thank','thanks'];
  const isPos = (t) => POSITIVE.some((w) => t.toLowerCase().includes(w));
  const catRows = rows.filter((r) => r.category === category);
  const fromLow = catRows.filter((r) => rowAvg(r) <= 3 && r.comment?.trim()).map((r) => r.comment.trim()).filter((c) => !isPos(c));
  const fallback = catRows.map((r) => r.comment?.trim()).filter(Boolean).filter((c) => !isPos(c));
  return [...new Set([...fromLow, ...fallback])].slice(0, 3).map((c) => c.length > 52 ? c.slice(0, 50) + '…' : c);
}

// ── Data ──────────────────────────────────────────────────────
async function getTodayFeedback() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('feedback')
    .select('category, q1, q1_label, q2, q2_label, q3, q3_label, comment, created_at')
    .gte('created_at', startOfDay.toISOString())
    .not('q1', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const revalidate = 60;

// ── Page ──────────────────────────────────────────────────────
export default async function OwnerPage() {
  let rows = [], fetchError = null;
  try { rows = await getTodayFeedback(); }
  catch (err) { fetchError = err.message ?? 'Unknown error'; }

  const total   = rows.length;
  const overall = avg(rows.flatMap((r) => [r.q1, r.q2, r.q3]));
  const worst   = total > 0 ? findWorstCategory(rows) : null;

  let worstQ = null, trend = null, unhappy = null;
  let timePeriod = null, action = '', lastSeenLabel = '', snippets = [];
  let priority = null;

  if (worst) {
    worstQ        = findWorstQuestion(rows, worst.category);
    trend         = getTrend(rows, worst.category);
    unhappy       = getUnhappyCount(rows, worst.category);
    timePeriod    = getProblemTimePeriod(rows, worst.category);
    action        = worstQ ? getActionForLabel(worstQ.label, worst.category) : '';
    lastSeenLabel = rows[0]?.created_at ? timeAgo(rows[0].created_at) : '';
    snippets      = getNegativeSnippets(rows, worst.category);
    priority      = getPriority(worst.avg);
  }

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const TREND_TEXT = { worse: '↓ getting worse', improving: '↑ improving', stable: '→ stable' };
  const TREND_CLS  = { worse: 'badge badge--drop', improving: 'badge badge--up', stable: 'badge badge--flat' };

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

      {/* ── Main alert ── */}
      {worst && priority && (
        <div className={`ow-card ow-alert ow-alert--${priority.cls.replace('priority--', '')}`}>

          <div className="ow-alert-top">
            <span className={`ow-priority-label ${priority.cls}`}>{priority.label}</span>
            {lastSeenLabel && <span className="ow-timestamp">Last feedback {lastSeenLabel}</span>}
          </div>

          <p className="ow-alert-metric">
            {CAT_LABELS[worst.category] || worst.category}
            <span className="ow-alert-score">{worst.avg.toFixed(1)}<small>/5</small></span>
          </p>

          {worstQ && (
            <p className="ow-alert-sublabel">Lowest: {worstQ.label} ({worstQ.avg.toFixed(1)}/5)</p>
          )}

          <div className="ow-context-row">
            {unhappy && (
              <span className="badge badge--freq">
                ⚠️ {unhappy.unhappy} of last {unhappy.total} customers unhappy
              </span>
            )}
            {trend && <span className={TREND_CLS[trend]}>{TREND_TEXT[trend]}</span>}
            {timePeriod && (
              <span className="badge badge--time">🕒 Mostly in {timePeriod}</span>
            )}
          </div>

          <p className="ow-alert-action">→ {action}</p>
        </div>
      )}

      {/* ── Summary strip ── */}
      {total > 0 && (
        <div className="ow-card ow-summary">
          <div className="ow-stat">
            <span className="ow-stat-value">{total}</span>
            <span className="ow-stat-label">responses today</span>
          </div>
          <div className="ow-divider" />
          <div className="ow-stat">
            <span className="ow-stat-value">
              {overall !== null ? overall.toFixed(1) : '—'}<small>/5</small>
            </span>
            <span className="ow-stat-label">avg rating</span>
          </div>
        </div>
      )}

      {/* ── Customer comments ── */}
      {snippets.length > 0 && (
        <div className="ow-card ow-comments">
          <p className="ow-comments-label">💬 What customers are saying</p>
          <ul className="ow-comment-list">
            {snippets.map((s, i) => (
              <li key={i} className="ow-comment-item">"{s}"</li>
            ))}
          </ul>
        </div>
      )}

      <p className="ow-refresh">Refreshes every 60 s</p>
    </div>
  );
}
