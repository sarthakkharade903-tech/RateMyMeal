import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const METRICS = ['taste', 'temperature', 'quantity', 'hygiene', 'experience'];

const META = {
  taste:       { label: 'Taste',       icon: '🍽️' },
  temperature: { label: 'Temperature', icon: '🌡️' },
  quantity:    { label: 'Quantity',     icon: '⚖️'  },
  hygiene:     { label: 'Hygiene',      icon: '🧹'  },
  experience:  { label: 'Experience',  icon: '✨'  },
};

// More specific, practical action suggestions
function getAction(metricKey, mealLabel) {
  const meal = mealLabel ? ` during ${mealLabel}` : '';
  const map = {
    taste:       `Taste is low${meal}. Ask the kitchen to taste today's food — check seasoning, freshness, and cooking consistency right now.`,
    temperature: `Food is arriving cold${meal}. Holding temperature should be above 65°C — check the time between plating and serving immediately.`,
    quantity:    `Portions feel insufficient${meal}. Have a supervisor verify serving sizes against your standard before the next batch goes out.`,
    hygiene:     `Hygiene concerns flagged${meal}. Walk through the kitchen now — check staff cleanliness, utensil condition, and surface hygiene.`,
    experience:  `Overall experience is low${meal}. Check service speed with your team and find out if wait times have increased today.`,
  };
  return map[metricKey];
}

// ── helpers ───────────────────────────────────────────────────

function avg(arr) {
  const clean = arr.filter((v) => v != null);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function lowestMetric(rows) {
  let worst = null, worstAvg = Infinity;
  for (const m of METRICS) {
    const a = avg(rows.map((r) => r[m]));
    if (a !== null && a < worstAvg) { worstAvg = a; worst = m; }
  }
  return worst ? { key: worst, avg: worstAvg } : null;
}

function overallAvg(rows) {
  return avg(rows.flatMap((r) => METRICS.map((m) => r[m])));
}

// Which meal type has the lowest avg for a given metric (min 2 responses)
function worstMealType(rows, metricKey) {
  const byMeal = {};
  for (const r of rows) {
    const mt = r.meal_type || 'unknown';
    if (!byMeal[mt]) byMeal[mt] = [];
    if (r[metricKey] != null) byMeal[mt].push(r[metricKey]);
  }
  let worst = null, worstA = Infinity;
  for (const [meal, vals] of Object.entries(byMeal)) {
    if (vals.length < 2) continue;
    const a = avg(vals);
    if (a < worstA) { worstA = a; worst = meal; }
  }
  return worst;
}

// Trend: compare last-3 avg vs previous-3 avg (rows ordered newest-first)
function getTrend(rows, metricKey) {
  const vals = rows.map((r) => r[metricKey]).filter((v) => v != null);
  if (vals.length < 4) return null; // not enough data — show nothing
  const recent = avg(vals.slice(0, 3));
  const older  = avg(vals.slice(3, 6));
  if (older === null) return null;
  if (recent < older - 0.4) return 'dropping';
  if (recent > older + 0.4) return 'improving';
  return null; // was "stable" — now suppressed
}

// Frequency: how many of the last 6 rated this metric <= 3 (low)
function getFrequency(rows, metricKey) {
  const last6 = rows.slice(0, 6);
  if (last6.length < 2) return null;
  const low = last6.filter(
    (r) => r[metricKey] != null && r[metricKey] <= 3
  ).length;
  if (low === 0) return null;
  return { low, total: last6.length };
}

// Impact: is overall experience also suffering? (only when worst isn't experience)
function getImpactHint(rows, worstKey) {
  if (worstKey === 'experience') return null;
  const expVals = rows.slice(0, 6).map((r) => r.experience).filter((v) => v != null);
  if (!expVals.length) return null;
  const expAvg = avg(expVals);
  return expAvg < 3.5 ? 'overall experience affected' : null;
}

// Relative time
function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return 'earlier today';
}

// Negative-only comment snippets:
// prioritise comments from entries where the worst metric scored ≤ 3
function getNegativeSnippets(rows, metricKey) {
  const POSITIVE_WORDS = [
    'great', 'good', 'excellent', 'amazing', 'awesome', 'perfect',
    'love', 'loved', 'wonderful', 'fantastic', 'best', 'delicious',
    'nice', 'happy', 'satisfied', 'enjoy', 'enjoyed', 'fresh', 'clean',
    'thank', 'thanks', 'well done', 'keep it up',
  ];

  function isPositive(text) {
    const lower = text.toLowerCase();
    return POSITIVE_WORDS.some((w) => lower.includes(w));
  }

  // First: comments from rows where that metric was low
  const fromLow = rows
    .filter((r) => r[metricKey] != null && r[metricKey] <= 3 && r.comment?.trim())
    .map((r) => r.comment.trim())
    .filter((c) => !isPositive(c));

  // Fallback: any comment that isn't purely positive
  const fallback = rows
    .map((r) => r.comment?.trim())
    .filter(Boolean)
    .filter((c) => !isPositive(c));

  const combined = [...new Set([...fromLow, ...fallback])].slice(0, 3);
  return combined.map((c) => (c.length > 52 ? c.slice(0, 50) + '…' : c));
}

// ── data ──────────────────────────────────────────────────────

async function getTodayFeedback() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('feedback')
    .select('taste, temperature, quantity, hygiene, experience, meal_type, comment, created_at')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ── page ──────────────────────────────────────────────────────

export const revalidate = 60;

export default async function OwnerPage() {
  let rows = [], fetchError = null;

  try { rows = await getTodayFeedback(); }
  catch (err) { fetchError = err.message ?? 'Unknown error'; }

  const total   = rows.length;
  const overall = overallAvg(rows);
  const worst   = total > 0 ? lowestMetric(rows) : null;

  let worstMeal = null, trend = null, action = '';
  let freq = null, impactHint = null, lastSeenLabel = '';
  let snippets = [];

  if (worst) {
    worstMeal     = worstMealType(rows, worst.key);
    trend         = getTrend(rows, worst.key);
    action        = getAction(worst.key, worstMeal);
    freq          = getFrequency(rows, worst.key);
    impactHint    = getImpactHint(rows, worst.key);
    lastSeenLabel = rows[0]?.created_at ? timeAgo(rows[0].created_at) : '';
    snippets      = getNegativeSnippets(rows, worst.key);
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

      {/* Top bar */}
      <header className="ow-header">
        <span className="ow-brand">RateMyMeal</span>
        <span className="ow-date">{todayLabel}</span>
      </header>

      {/* Error */}
      {fetchError && (
        <div className="ow-card ow-error">⚠️ Could not load data: {fetchError}</div>
      )}

      {/* No data */}
      {!fetchError && total === 0 && (
        <div className="ow-card ow-empty">
          <p className="ow-empty-icon">☕</p>
          <p className="ow-empty-title">No feedback yet today</p>
          <p className="ow-empty-sub">Check back after the first meal service.</p>
        </div>
      )}

      {/* ── Main alert ── */}
      {worst && (
        <div className={`ow-card ow-alert ow-alert--${alertLevel}`}>

          {/* Eyebrow + timestamp */}
          <div className="ow-alert-top">
            <span className="ow-alert-eyebrow">
              {alertLevel === 'critical' ? '🚨 Needs Immediate Attention'
               : alertLevel === 'warning'  ? '⚠️ Watch This Now'
               : '✅ Looking Good'}
            </span>
            {lastSeenLabel && (
              <span className="ow-timestamp">Last feedback {lastSeenLabel}</span>
            )}
          </div>

          {/* Metric + score */}
          <p className="ow-alert-metric">
            {META[worst.key].icon} {META[worst.key].label}
            <span className="ow-alert-score">
              {worst.avg.toFixed(1)}<small>/5</small>
            </span>
          </p>

          {/* Context badges */}
          <div className="ow-context-row">
            {worstMeal && (
              <span className="badge badge--meal">🍴 Mostly in {worstMeal}</span>
            )}
            {trend === 'dropping' && (
              <span className="badge badge--drop">↓ dropping recently</span>
            )}
            {trend === 'improving' && (
              <span className="badge badge--up">↑ improving</span>
            )}
            {freq && (
              <span className="badge badge--freq">
                {freq.low} of last {freq.total} customers rated this low
              </span>
            )}
            {impactHint && (
              <span className="badge badge--impact">⚠ {impactHint}</span>
            )}
          </div>

          {/* Specific action */}
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

      {/* ── What customers are saying (negative only) ── */}
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
