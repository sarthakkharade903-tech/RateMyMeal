/*    taskkill /PID 33408 /F       npm run dev     */
/* http://localhost:3000/owner */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const METRICS = ['taste', 'temperature', 'quantity', 'hygiene', 'experience'];

const META = {
  taste:       { label: 'Taste',        icon: '🍽️' },
  temperature: { label: 'Temperature',  icon: '🌡️' },
  quantity:    { label: 'Quantity',      icon: '⚖️'  },
  hygiene:     { label: 'Hygiene',       icon: '🧹'  },
  experience:  { label: 'Experience',   icon: '✨'  },
};

// Meal-type-aware action strings
function getAction(metricKey, mealLabel) {
  const m = mealLabel ? `during ${mealLabel}` : '';
  const map = {
    taste:       `Taste is low${m ? ' ' + m : ''}. Ask the kitchen to check today's seasoning and freshness.`,
    temperature: `Food is arriving cold${m ? ' ' + m : ''}. Check holding temperatures and reduce time between plating and serving.`,
    quantity:    `Portions feel small${m ? ' ' + m : ''}. Review serving sizes with kitchen staff before the next service.`,
    hygiene:     `Hygiene is flagged${m ? ' ' + m : ''}. Inspect kitchen, utensils, and the service area right now.`,
    experience:  `Overall experience is low${m ? ' ' + m : ''}. Check wait times and staff attitude with your team today.`,
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

// Which meal type scores worst on a given metric (min 2 responses)
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
  return worst; // e.g. "lunch"
}

// Compare last-3 avg vs previous-3 avg  (rows ordered newest-first)
function getTrend(rows, metricKey) {
  const vals = rows.map((r) => r[metricKey]).filter((v) => v != null);
  if (vals.length < 4) return 'stable';
  const recent = avg(vals.slice(0, 3));
  const older  = avg(vals.slice(3, 6));
  if (older === null) return 'stable';
  if (recent < older - 0.4) return 'dropping';
  if (recent > older + 0.4) return 'improving';
  return 'stable';
}

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return 'earlier today';
}

// Return up to 3 trimmed comment snippets (non-empty)
function getCommentSnippets(rows) {
  return rows
    .map((r) => r.comment?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((c) => (c.length > 52 ? c.slice(0, 50) + '…' : c));
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

  // Enriched context for the alert
  let worstMeal = null, trend = 'stable', action = '', lastSeenLabel = '';

  if (worst) {
    worstMeal       = worstMealType(rows, worst.key);
    trend           = getTrend(rows, worst.key);
    action          = getAction(worst.key, worstMeal);
    lastSeenLabel   = rows[0]?.created_at ? timeAgo(rows[0].created_at) : '';
  }

  const snippets    = getCommentSnippets(rows);

  const alertLevel  =
    !worst            ? 'none'
    : worst.avg < 2.5 ? 'critical'
    : worst.avg < 3.5 ? 'warning'
    : 'good';

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const TREND_BADGE = {
    dropping:  { text: '↓ dropping recently', cls: 'badge badge--drop' },
    improving: { text: '↑ improving',         cls: 'badge badge--up'   },
    stable:    { text: '→ stable',             cls: 'badge badge--flat' },
  };

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

          {/* Eyebrow row: label + timestamp */}
          <div className="ow-alert-top">
            <span className="ow-alert-eyebrow">
              {alertLevel === 'critical' ? '🚨 Needs Immediate Attention'
               : alertLevel === 'warning'  ? '⚠️ Watch This Today'
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

          {/* Context row: meal type + trend */}
          <div className="ow-context-row">
            {worstMeal && (
              <span className="badge badge--meal">
                🍴 Mostly in {worstMeal}
              </span>
            )}
            <span className={TREND_BADGE[trend].cls}>
              {TREND_BADGE[trend].text}
            </span>
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

      {/* ── What customers are saying ── */}
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
