import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const METRICS = ['taste', 'temperature', 'quantity', 'hygiene', 'experience'];

const META = {
  taste:       { label: 'Taste',       icon: '🍽️', action: 'Review today\'s seasoning or recipe with the kitchen team.' },
  temperature: { label: 'Temperature', icon: '🌡️', action: 'Ensure food is being served hot — check holding temperatures.' },
  quantity:    { label: 'Quantity',    icon: '⚖️', action: 'Portion sizes may feel insufficient — review with kitchen staff.' },
  hygiene:     { label: 'Hygiene',     icon: '🧹', action: 'Inspect the kitchen and service area cleanliness right away.' },
  experience:  { label: 'Experience',  icon: '✨', action: 'Check service speed and staff friendliness with your team.' },
};

// ── helpers ───────────────────────────────────────────────────

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function lowestMetric(rows) {
  let worst = null;
  let worstAvg = Infinity;

  for (const m of METRICS) {
    const vals = rows.map((r) => r[m]).filter((v) => v != null);
    const a = avg(vals);
    if (a !== null && a < worstAvg) {
      worstAvg = a;
      worst = m;
    }
  }

  return worst ? { key: worst, avg: worstAvg } : null;
}

function overallAvg(rows) {
  const all = rows.flatMap((r) =>
    METRICS.map((m) => r[m]).filter((v) => v != null)
  );
  return avg(all);
}

// ── data ──────────────────────────────────────────────────────

async function getTodayFeedback() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('feedback')
    .select('taste, temperature, quantity, hygiene, experience')
    .gte('created_at', startOfDay.toISOString());

  if (error) throw error;
  return data ?? [];
}

// ── page ──────────────────────────────────────────────────────

export const revalidate = 60;

export default async function OwnerPage() {
  let rows = [];
  let fetchError = null;

  try {
    rows = await getTodayFeedback();
  } catch (err) {
    fetchError = err.message ?? 'Unknown error';
  }

  const total   = rows.length;
  const overall = overallAvg(rows);
  const worst   = total > 0 ? lowestMetric(rows) : null;

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // Determine alert level
  const alertLevel =
    !worst             ? 'none'
    : worst.avg < 2.5  ? 'critical'
    : worst.avg < 3.5  ? 'warning'
    : 'good';

  return (
    <div className="ow-shell">

      {/* Top bar */}
      <header className="ow-header">
        <span className="ow-brand">RateMyMeal</span>
        <span className="ow-date">{todayLabel}</span>
      </header>

      {/* Error */}
      {fetchError && (
        <div className="ow-card ow-error">
          ⚠️ Could not load data: {fetchError}
        </div>
      )}

      {/* No data yet */}
      {!fetchError && total === 0 && (
        <div className="ow-card ow-empty">
          <p className="ow-empty-icon">☕</p>
          <p className="ow-empty-title">No feedback yet today</p>
          <p className="ow-empty-sub">Check back after the first meal service.</p>
        </div>
      )}

      {/* Main focus alert */}
      {worst && (
        <div className={`ow-card ow-alert ow-alert--${alertLevel}`}>
          <p className="ow-alert-eyebrow">
            {alertLevel === 'critical' ? '🚨 Needs Immediate Attention'
            : alertLevel === 'warning'  ? '⚠️ Watch This Today'
            : '✅ Looking Good'}
          </p>

          <p className="ow-alert-metric">
            {META[worst.key].icon} {META[worst.key].label}
            <span className="ow-alert-score">{worst.avg.toFixed(1)}<small>/5</small></span>
          </p>

          <p className="ow-alert-action">→ {META[worst.key].action}</p>
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
              {overall !== null ? overall.toFixed(1) : '—'}
              <small>/5</small>
            </span>
            <span className="ow-stat-label">avg rating</span>
          </div>
        </div>
      )}

      <p className="ow-refresh">Refreshes every 60 s</p>
    </div>
  );
}
