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

const CAT_ICONS = {
  pizza: '🍕', sandwich: '🥪', burger: '🍔', maggi: '🍜',
  pasta: '🍝', fries: '🍟', garlic_bread: '🥖', shakes: '🥤',
  cold_coffee: '🧋', hot_beverages: '☕',
};

// ── Action suggestions ────────────────────────────────────────
function getAction(label, category) {
  const l   = label.toLowerCase();
  const cat = CAT_LABELS[category] || category;
  if (l.includes('taste'))                            return `Ask kitchen to taste the ${cat} and fix seasoning or freshness immediately.`;
  if (l.includes('hot') && !l.includes('cold'))       return `Serve ${cat} above 65°C. Reduce time between cooking and serving.`;
  if (l.includes('cold') && !l.includes('hot'))       return `Pre-chill ${cat} before serving. Check refrigeration.`;
  if (l.includes('crispy'))                           return `Check oil temp and serve ${cat} immediately after cooking.`;
  if (l.includes('quantity') || l.includes('filling') || l.includes('enough'))
                                                      return `Portions of ${cat} feel small. Verify serving sizes with kitchen.`;
  if (l.includes('fresh'))                            return `Check ingredient freshness for ${cat}. Replace anything past prime.`;
  if (l.includes('thick') || l.includes('cream'))    return `Adjust mix ratio or ice cream quantity for ${cat}.`;
  if (l.includes('consist'))                          return `Use measured quantities for every ${cat} order.`;
  if (l.includes('topping'))                          return `Check topping quantity, distribution, and freshness on ${cat}.`;
  if (l.includes('patty'))                            return `Check patty freshness and cooking time for ${cat}.`;
  if (l.includes('sauce'))                            return `Verify sauce freshness and preparation ratio for ${cat}.`;
  if (l.includes('garlic') || l.includes('cheese'))  return `Check garlic butter/cheese quantity and even spread on ${cat}.`;
  if (l.includes('assembled') || l.includes('proper')) return `Brief kitchen on proper ${cat} assembly and presentation.`;
  return `Brief kitchen on quality standards for ${cat} before next service.`;
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

// ── Per-category analysis ─────────────────────────────────────

function catAvg(rows, cat) {
  const vals = rows.filter((r) => r.category === cat)
    .flatMap((r) => [r.q1, r.q2, r.q3]).filter((v) => v != null);
  return avg(vals);
}

function worstQuestion(rows, cat) {
  const catRows = rows.filter((r) => r.category === cat);
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

// Unhappy = rows where any q ≤ 2, last 10 per category
function unhappyCount(rows, cat) {
  const catRows = rows.filter((r) => r.category === cat).slice(0, 10);
  if (catRows.length < 2) return null;
  const u = catRows.filter((r) => [r.q1, r.q2, r.q3].filter((v) => v != null).some((v) => v <= 2)).length;
  return u > 0 ? { unhappy: u, total: catRows.length } : null;
}

// Trend: last 5 vs prev 5 for worst question
function getTrend(rows, cat, worstLabel) {
  const catRows = rows.filter((r) => r.category === cat);
  const vals = catRows.map((r) => {
    const pairs = [[r.q1, r.q1_label], [r.q2, r.q2_label], [r.q3, r.q3_label]];
    const match = pairs.find(([, l]) => l === worstLabel);
    return match ? match[0] : null;
  }).filter((v) => v != null);
  if (vals.length < 6) return null;
  const recent = avg(vals.slice(0, 5));
  const older  = avg(vals.slice(5, 10));
  if (older === null) return null;
  if (recent < older - 0.3) return 'worse';
  if (recent > older + 0.3) return 'improving';
  return 'stable';
}

// Peak issue time period
function peakIssuePeriod(rows, cat) {
  const catRows = rows.filter((r) => r.category === cat);
  const periods = { Morning: [], Afternoon: [], Evening: [] };
  for (const r of catRows) {
    const h = new Date(r.created_at).getHours();
    const p = h >= 6 && h < 12 ? 'Morning' : h >= 12 && h < 18 ? 'Afternoon' : h >= 18 && h < 23 ? 'Evening' : null;
    if (p) { const a = rowAvg(r); if (a != null) periods[p].push(a); }
  }
  let worstP = null, worstA = Infinity;
  for (const [p, vals] of Object.entries(periods)) {
    if (vals.length < 2) continue;
    const a = avg(vals);
    if (a < worstA) { worstA = a; worstP = p; }
  }
  if (!worstP) return null;
  const detail = worstP === 'Morning' ? '(8–12 AM)' : worstP === 'Afternoon' ? '(12–6 PM)' : '(6–11 PM)';
  return `${worstP} rush ${detail}`;
}

// Urgency: trend is worse OR unhappy ≥ 50% of recent
function isUrgent(trend, unhappy) {
  if (trend === 'worse') return true;
  if (unhappy && unhappy.unhappy / unhappy.total >= 0.5) return true;
  return false;
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
function negativeSnippets(rows, cat) {
  const POSITIVE = ['great','good','excellent','amazing','awesome','perfect','love',
    'loved','wonderful','fantastic','best','delicious','nice','happy','satisfied',
    'enjoy','enjoyed','clean','thank','thanks'];
  const isPos = (t) => POSITIVE.some((w) => t.toLowerCase().includes(w));
  const catRows = rows.filter((r) => r.category === cat);
  const fromLow = catRows.filter((r) => rowAvg(r) <= 3 && r.comment?.trim()).map((r) => r.comment.trim()).filter((c) => !isPos(c));
  const fallback = catRows.map((r) => r.comment?.trim()).filter(Boolean).filter((c) => !isPos(c));
  return [...new Set([...fromLow, ...fallback])].slice(0, 2).map((c) => c.length > 55 ? c.slice(0, 53) + '…' : c);
}

// ── Build per-category insights ───────────────────────────────
function buildCategoryCards(rows) {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const cards = cats.map((cat) => {
    const a        = catAvg(rows, cat);
    if (a === null) return null;
    const priority = getPriority(a);
    const wq       = worstQuestion(rows, cat);
    const unhappy  = unhappyCount(rows, cat);
    const trend    = wq ? getTrend(rows, cat, wq.label) : null;
    const period   = peakIssuePeriod(rows, cat);
    const action   = wq ? getAction(wq.label, cat) : '';
    const urgent   = isUrgent(trend, unhappy);
    const snippets = negativeSnippets(rows, cat);
    const count    = rows.filter((r) => r.category === cat).length;
    return { cat, avg: a, priority, wq, unhappy, trend, period, action, urgent, snippets, count };
  }).filter(Boolean);

  // Sort: CRITICAL first → NEEDS ATTENTION → GOOD, then by avg ascending
  cards.sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority.level] - PRIORITY_ORDER[b.priority.level];
    return po !== 0 ? po : a.avg - b.avg;
  });

  return cards;
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

// ── Trend badge ───────────────────────────────────────────────
const TREND_CFG = {
  worse:     { text: '↓ getting worse', cls: 'badge badge--drop' },
  improving: { text: '↑ improving',     cls: 'badge badge--up'   },
  stable:    { text: '→ stable',        cls: 'badge badge--flat' },
};

// ── Page ──────────────────────────────────────────────────────
export default async function OwnerPage() {
  let rows = [], fetchError = null;
  try { rows = await getTodayFeedback(); }
  catch (err) { fetchError = err.message ?? 'Unknown error'; }

  const total   = rows.length;
  const overall = avg(rows.flatMap((r) => [r.q1, r.q2, r.q3]));
  const cards   = total > 0 ? buildCategoryCards(rows) : [];
  const lastSeen = rows[0]?.created_at ? timeAgo(rows[0].created_at) : null;

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

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
          {lastSeen && (
            <>
              <div className="ow-divider" />
              <div className="ow-stat">
                <span className="ow-stat-value ow-stat-value--sm">{lastSeen}</span>
                <span className="ow-stat-label">last feedback</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Category cards ── */}
      {cards.map(({ cat, avg: catA, priority, wq, unhappy, trend, period, action, urgent, snippets, count }) => (
        <div
          key={cat}
          className={`ow-card ow-cat-card ow-cat-card--${priority.level} ${urgent ? 'ow-cat-card--urgent' : ''}`}
        >
          {/* Card header */}
          <div className="ow-cat-header">
            <span className="ow-cat-icon">{CAT_ICONS[cat] || '🍴'}</span>
            <span className="ow-cat-name">{CAT_LABELS[cat] || cat}</span>
            <span className={`ow-priority-label ${priority.cls}`}>{priority.label}</span>
          </div>

          {/* Score row */}
          <div className="ow-cat-score-row">
            <span className="ow-cat-score">{catA.toFixed(1)}<small>/5</small></span>
            <span className="ow-cat-count">{count} {count === 1 ? 'response' : 'responses'}</span>
          </div>

          {/* Worst question */}
          {wq && (
            <p className="ow-cat-worst">Lowest: {wq.label} — {wq.avg.toFixed(1)}/5</p>
          )}

          {/* Badges */}
          <div className="ow-context-row">
            {unhappy && (
              <span className="badge badge--freq">
                ⚠️ {unhappy.unhappy} of last {unhappy.total} customers unhappy with {wq?.label}
              </span>
            )}
            {trend && <span className={TREND_CFG[trend].cls}>{TREND_CFG[trend].text}</span>}
            {period && <span className="badge badge--time">🕒 Issues peak during {period}</span>}
          </div>

          {/* Action */}
          {action && <p className="ow-alert-action">→ {action}</p>}

          {/* Negative comments */}
          {snippets.length > 0 && (
            <ul className="ow-comment-list ow-comment-list--compact">
              {snippets.map((s, i) => (
                <li key={i} className="ow-comment-item">"{s}"</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <p className="ow-refresh">Sorted by priority · Refreshes every 60 s</p>
    </div>
  );
}
