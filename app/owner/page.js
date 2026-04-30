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

// ── Action suggestion based on question label keywords ────────
function getActionForLabel(label, category) {
  const l = label.toLowerCase();
  const cat = CAT_LABELS[category] || category;
  if (l.includes('taste'))                         return `Taste of ${cat} is low. Ask kitchen to taste and adjust seasoning or recipe immediately.`;
  if (l.includes('hot') && !l.includes('cold'))    return `${cat} is not hot enough. Check holding temperature — serve above 65°C and reduce plating delay.`;
  if (l.includes('cold') && !l.includes('hot'))    return `${cat} is not cold enough. Verify refrigeration and ensure drinks are pre-chilled before serving.`;
  if (l.includes('crispy'))                        return `${cat} is losing crispiness. Check oil temperature and serve immediately after cooking.`;
  if (l.includes('quantity') || l.includes('filling') || l.includes('enough')) return `Portions of ${cat} feel insufficient. Have a supervisor verify serving sizes right now.`;
  if (l.includes('fresh'))                         return `${cat} ingredients may not be fresh. Check and replace anything past its prime immediately.`;
  if (l.includes('thick') || l.includes('cream'))  return `${cat} consistency is off. Adjust the mix ratio or ice cream quantity to fix it.`;
  if (l.includes('consist'))                       return `${cat} preparation is inconsistent. Brief staff to use measured quantities for every order.`;
  if (l.includes('topping'))                       return `Toppings on ${cat} are low-rated. Check quantity, freshness, and even distribution.`;
  if (l.includes('patty'))                         return `Patty quality in ${cat} is poor. Check freshness and cooking time before the next batch.`;
  if (l.includes('sauce'))                         return `Sauce quality in ${cat} is low. Verify freshness and preparation ratio with kitchen.`;
  if (l.includes('garlic') || l.includes('cheese')) return `Garlic/cheese flavor is weak in ${cat}. Check butter quantity and ensure even spread before baking.`;
  if (l.includes('assembled') || l.includes('proper')) return `${cat} assembly quality is low. Brief kitchen on proper build and presentation now.`;
  return `Quality issue with ${cat}. Brief kitchen staff on standards before the next service.`;
}

// ── Helpers ───────────────────────────────────────────────────
function avg(arr) {
  const clean = arr.filter((v) => v != null);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

// Find worst category by avg of q1+q2+q3 (min 2 entries)
function findWorstCategory(rows) {
  const byCat = {};
  for (const r of rows) {
    const cat = r.category || 'unknown';
    if (!byCat[cat]) byCat[cat] = [];
    [r.q1, r.q2, r.q3].filter((v) => v != null).forEach((v) => byCat[cat].push(v));
  }
  let worstCat = null, worstAvg = Infinity;
  for (const [cat, vals] of Object.entries(byCat)) {
    if (vals.length < 2) continue;
    const a = avg(vals);
    if (a < worstAvg) { worstAvg = a; worstCat = cat; }
  }
  return worstCat ? { category: worstCat, avg: worstAvg } : null;
}

// Within a category, find the worst specific question label
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
  let worstLabel = null, worstAvg = Infinity;
  for (const [label, vals] of Object.entries(byLabel)) {
    const a = avg(vals);
    if (a < worstAvg) { worstAvg = a; worstLabel = label; }
  }
  return worstLabel ? { label: worstLabel, avg: worstAvg } : null;
}

// Frequency: how many of last 6 in this category had avg q1+q2+q3 <= 3
function getFrequency(rows, category) {
  const catRows = rows.filter((r) => r.category === category).slice(0, 6);
  if (catRows.length < 2) return null;
  const low = catRows.filter((r) => {
    const a = avg([r.q1, r.q2, r.q3]);
    return a !== null && a <= 3;
  }).length;
  if (low === 0) return null;
  return { low, total: catRows.length };
}

// Trend: last-3 avg vs prev-3 avg for a category
function getTrend(rows, category) {
  const vals = rows
    .filter((r) => r.category === category)
    .map((r) => avg([r.q1, r.q2, r.q3]))
    .filter((v) => v != null);
  if (vals.length < 4) return null;
  const recent = avg(vals.slice(0, 3));
  const older  = avg(vals.slice(3, 6));
  if (older === null) return null;
  if (recent < older - 0.4) return 'dropping';
  if (recent > older + 0.4) return 'improving';
  return null;
}

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return 'earlier today';
}

// Negative comments: from low-rated entries in the worst category
function getNegativeSnippets(rows, category) {
  const POSITIVE = ['great','good','excellent','amazing','awesome','perfect','love',
    'loved','wonderful','fantastic','best','delicious','nice','happy','satisfied',
    'enjoy','enjoyed','fresh','clean','thank','thanks'];

  const isPositive = (t) => POSITIVE.some((w) => t.toLowerCase().includes(w));

  const catRows = rows.filter((r) => r.category === category);
  const fromLow = catRows
    .filter((r) => avg([r.q1, r.q2, r.q3]) <= 3 && r.comment?.trim())
    .map((r) => r.comment.trim())
    .filter((c) => !isPositive(c));

  const fallback = catRows
    .map((r) => r.comment?.trim()).filter(Boolean)
    .filter((c) => !isPositive(c));

  return [...new Set([...fromLow, ...fallback])]
    .slice(0, 3)
    .map((c) => (c.length > 52 ? c.slice(0, 50) + '…' : c));
}

// ── Data fetch ────────────────────────────────────────────────
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

  let worstQ = null, trend = null, freq = null;
  let action = '', lastSeenLabel = '', snippets = [];

  if (worst) {
    worstQ         = findWorstQuestion(rows, worst.category);
    trend          = getTrend(rows, worst.category);
    freq           = getFrequency(rows, worst.category);
    action         = worstQ ? getActionForLabel(worstQ.label, worst.category) : '';
    lastSeenLabel  = rows[0]?.created_at ? timeAgo(rows[0].created_at) : '';
    snippets       = getNegativeSnippets(rows, worst.category);
  }

  const alertLevel =
    !worst            ? 'none'
    : worst.avg < 2.5 ? 'critical'
    : worst.avg < 3.5 ? 'warning'
    : 'good';

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="ow-shell">
      <header className="ow-header">
        <span className="ow-brand">RateMyMeal</span>
        <span className="ow-date">{todayLabel}</span>
      </header>

      {fetchError && (
        <div className="ow-card ow-error">⚠️ Could not load data: {fetchError}</div>
      )}

      {!fetchError && total === 0 && (
        <div className="ow-card ow-empty">
          <p className="ow-empty-icon">☕</p>
          <p className="ow-empty-title">No feedback yet today</p>
          <p className="ow-empty-sub">Check back after the first meal service.</p>
        </div>
      )}

      {/* Main alert */}
      {worst && (
        <div className={`ow-card ow-alert ow-alert--${alertLevel}`}>
          <div className="ow-alert-top">
            <span className="ow-alert-eyebrow">
              {alertLevel === 'critical' ? '🚨 Needs Immediate Attention'
               : alertLevel === 'warning' ? '⚠️ Watch This Now'
               : '✅ Looking Good'}
            </span>
            {lastSeenLabel && (
              <span className="ow-timestamp">Last feedback {lastSeenLabel}</span>
            )}
          </div>

          <p className="ow-alert-metric">
            {CAT_LABELS[worst.category] || worst.category}
            <span className="ow-alert-score">
              {worst.avg.toFixed(1)}<small>/5</small>
            </span>
          </p>

          {worstQ && (
            <p className="ow-alert-sublabel">Lowest: {worstQ.label} ({worstQ.avg.toFixed(1)}/5)</p>
          )}

          <div className="ow-context-row">
            {trend === 'dropping'  && <span className="badge badge--drop">↓ dropping recently</span>}
            {trend === 'improving' && <span className="badge badge--up">↑ improving</span>}
            {freq && (
              <span className="badge badge--freq">
                {freq.low} of last {freq.total} customers rated this low
              </span>
            )}
          </div>

          <p className="ow-alert-action">→ {action}</p>
        </div>
      )}

      {/* Summary strip */}
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

      {/* Customer comments */}
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
