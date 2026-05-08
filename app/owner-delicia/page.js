'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import LiveTime    from './LiveTime';
import CardDetails from './CardDetails';
import TrendView   from './TrendView';

// ── Labels & Icons ─────────────────────────────────────────────
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

// ── Tabs config ────────────────────────────────────────────────
const TABS = [
  { key: 'today', label: 'Today',   shortLabel: 'today'       },
  { key: 'week',  label: '7 Days',  shortLabel: 'last 7 days' },
  { key: 'month', label: '30 Days', shortLabel: 'last 30 days'},
];

function getStartDate(tab) {
  if (tab === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (tab === 'week')  return new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  return                      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

// ── Formatters ─────────────────────────────────────────────────
function formatIssue(label) {
  const map = {
    'Taste':                  'Taste is off',
    'Hot enough':             'Not hot enough',
    'Cold enough':            'Not cold enough',
    'Crispy':                 'Not crispy enough',
    'Crispy / grilled':       'Not crispy enough',
    'Fresh':                  'Not fresh',
    'Patty quality':          'Poor patty quality',
    'Consistency':            'Consistency issue',
    'Filling enough':         'Filling not enough',
    'Quantity enough':        'Quantity not enough',
    'Thick & creamy':         'Not thick enough',
    'Toppings quality':       'Poor toppings quality',
    'Sauce quality':          'Sauce issue',
    'Garlic / cheese flavor': 'Weak garlic/cheese flavor',
    'Well assembled':         'Poorly assembled',
    'Properly cooked':        'Not cooked properly',
    'Cooked properly':        'Not cooked properly',
    'Properly made':          'Not made properly',
  };
  return map[label] || label;
}

const FIX_TEMPLATES = {
  pizza: { 'Taste': ["Taste one slice now — adjust salt/sauce", "Check if ingredients are fresh"], 'Hot enough': ["Send immediately after baking", "Don’t keep waiting on counter"], 'Toppings quality': ["Don’t be stingy with toppings", "Use fresh toppings, not old batch"] },
  sandwich: { 'Taste': ["Taste once before serving", "Fix chutney/sauce balance"], 'Crispy / grilled': ["Grill properly — don’t rush", "Serve immediately, don’t keep packed"], 'Filling enough': ["Add proper filling — don’t reduce", "Keep portion same every time"] },
  burger: { 'Taste': ["Check sauce balance", "Taste once before serving"], 'Patty quality': ["Don’t use old patties", "Cook fresh, don’t keep ready"], 'Well assembled': ["Assemble properly — don’t rush", "Keep layers neat, not messy"] },
  maggi: { 'Taste': ["Adjust masala properly", "Taste before serving"], 'Properly cooked': ["Don’t overcook or make too dry", "Follow same cooking time every time"], 'Quantity enough': ["Don’t reduce quantity", "Keep serving consistent"] },
  pasta: { 'Taste': ["Taste before serving", "Fix salt/sauce balance"], 'Cooked properly': ["Don’t overcook — keep texture right", "Follow same timing"], 'Sauce quality': ["Check sauce taste before serving", "Don’t use old sauce batch"] },
  fries: { 'Crispy': ["Fry properly — don’t rush batch", "Don’t keep ready, serve fresh"], 'Fresh': ["Don’t use old stock", "Check oil — change if needed"], 'Quantity enough': ["Don’t reduce portion", "Serve full quantity every time"] },
  garlic_bread: { 'Taste': ["Check butter & seasoning", "Taste once before serving"], 'Crispy': ["Toast properly — don’t rush", "Serve immediately"], 'Garlic / cheese flavor': ["Apply enough garlic butter", "Don’t undercook — bake properly"] },
  shakes: { 'Taste': ["Adjust sugar/flavor", "Taste before serving"], 'Thick & creamy': ["Add more ice cream/base", "Blend properly"], 'Cold enough': ["Use chilled milk", "Serve immediately"] },
  cold_coffee: { 'Taste': ["Adjust coffee/sugar balance", "Taste before serving"], 'Cold enough': ["Add enough ice", "Don’t let it sit before serving"], 'Consistency': ["Blend properly", "Keep same ratio every time"] },
  hot_beverages: { 'Taste': ["Adjust sugar/coffee/tea balance", "Taste before serving"], 'Hot enough': ["Serve immediately", "Don’t let it sit"], 'Properly made': ["Follow same method every time", "Don’t rush preparation"] },
};

function getActionBullets(cat, label) {
  return FIX_TEMPLATES[cat]?.[label] || ["Check prep against recipe card", "Taste before serving"];
}

function getIssueDisplay(cat, wq) {
  if (!wq || wq.avg >= 4.5)
    return { type: 'happy', text: 'Customers are happy', bullets: [] };
  if (wq.avg >= 4.0) {
    const soft = {
      'Taste':'Could tweak the taste slightly','Hot enough':'Could serve a bit hotter',
      'Cold enough':'Could be a bit colder','Crispy':'Could improve crispiness slightly',
      'Crispy / grilled':'Could improve crispiness slightly','Fresh':'Minor freshness area',
      'Patty quality':'Patty could be slightly better','Consistency':'Minor consistency area',
      'Filling enough':'Filling could be slightly more','Quantity enough':'Portion could be slightly more',
      'Thick & creamy':'Could be a bit thicker','Toppings quality':'Toppings could be slightly better',
      'Sauce quality':'Sauce could be slightly improved','Garlic / cheese flavor':'Flavor could be slightly stronger',
      'Well assembled':'Assembly could be slightly neater','Properly cooked':'Could improve cooking slightly',
      'Cooked properly':'Could improve cooking slightly','Properly made':'Could be prepared slightly better',
    };
    return { type: 'soft', text: soft[wq.label] || 'Minor improvement area', bullets: [] };
  }
  return { type: 'real', text: formatIssue(wq.label), avgText: wq.avg.toFixed(1), bullets: getActionBullets(cat, wq.label) };
}

// ── Analytics helpers ──────────────────────────────────────────
function avg(arr) {
  const c = arr.filter((v) => v != null);
  if (!c.length) return null;
  return c.reduce((a, b) => a + b, 0) / c.length;
}

function getPriority(a) {
  if (a < 2.5) return { level: 'critical',  label: '🔴 CRITICAL',        cls: 'priority--critical'  };
  if (a < 3.5) return { level: 'attention', label: '🟠 NEEDS ATTENTION', cls: 'priority--attention' };
  return             { level: 'good',       label: '🟢 GOOD',            cls: 'priority--good'      };
}
const PRIORITY_ORDER = { critical: 0, attention: 1, good: 2 };

function catAvg(rows, cat) {
  const vals = rows.filter((r) => r.category === cat).flatMap((r) => [r.q1, r.q2, r.q3]).filter((v) => v != null);
  return avg(vals);
}

function worstQuestion(rows, cat) {
  const byLabel = {};
  for (const r of rows.filter((r) => r.category === cat))
    for (const [q, label] of [[r.q1,r.q1_label],[r.q2,r.q2_label],[r.q3,r.q3_label]])
      if (q != null && label) { if (!byLabel[label]) byLabel[label] = []; byLabel[label].push(q); }
  let worstLabel = null, worstA = Infinity;
  for (const [label, vals] of Object.entries(byLabel)) { const a = avg(vals); if (a < worstA) { worstA = a; worstLabel = label; } }
  return worstLabel ? { label: worstLabel, avg: worstA } : null;
}

function unhappyCount(rows, cat, worstLabel) {
  const catRows = rows.filter((r) => r.category === cat).slice(0, 10);
  if (catRows.length < 2) return null;
  const u = catRows.filter((r) => {
    const match = [[r.q1,r.q1_label],[r.q2,r.q2_label],[r.q3,r.q3_label]].find(([,l]) => l === worstLabel);
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

function getQuestionAverages(rows, cat) {
  const byLabel = {};
  for (const r of rows.filter((r) => r.category === cat))
    for (const [q, label] of [[r.q1,r.q1_label],[r.q2,r.q2_label],[r.q3,r.q3_label]])
      if (q != null && label) { if (!byLabel[label]) byLabel[label] = []; byLabel[label].push(q); }
  return Object.entries(byLabel)
    .map(([label, vals]) => ({ label, avg: avg(vals) }))
    .sort((a, b) => a.avg - b.avg);
}

function getRecentEntryAvg(rows, cat) {
  const latest = rows.find((r) => r.category === cat);
  if (!latest) return null;
  return avg([latest.q1, latest.q2, latest.q3]);
}

function isUrgent(trend, unhappy) {
  if (trend === 'worse') return true;
  if (unhappy && unhappy.unhappy / unhappy.total >= 0.5) return true;
  return false;
}

function buildCards(rows) {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  return cats.map((cat) => {
    const a = catAvg(rows, cat);
    if (a === null) return null;
    const priority      = getPriority(a);
    const wq            = worstQuestion(rows, cat);
    const unhappy       = wq ? unhappyCount(rows, cat, wq.label) : null;
    const trend         = wq ? getTrend(rows, cat, wq.label) : null;
    const lastIssue     = rows.filter((r) => r.category === cat)[0]?.created_at ?? null;
    const questions     = getQuestionAverages(rows, cat);
    const recentEntryAvg= getRecentEntryAvg(rows, cat);
    const issueDisplay  = getIssueDisplay(cat, wq);
    const urgent        = isUrgent(trend, unhappy);
    const count         = rows.filter((r) => r.category === cat).length;
    return { cat, avg: a, priority, wq, unhappy, trend, lastIssue, questions, recentEntryAvg, issueDisplay, urgent, count };
  }).filter(Boolean).sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority.level] - PRIORITY_ORDER[b.priority.level];
    return po !== 0 ? po : a.avg - b.avg;
  });
}

const TREND_CFG = {
  worse:     { text: '↓', cls: 'trend-badge trend-badge--down' },
  improving: { text: '↑', cls: 'trend-badge trend-badge--up'   },
  stable:    { text: '→', cls: 'trend-badge trend-badge--flat' },
};

// ── Sort helpers (Today tab only) ─────────────────────────────
const SORT_OPTIONS = [
  { key: 'worst',  label: 'Low Ratings',    icon: '↓', isDefault: true  },
  { key: 'best',   label: 'High Ratings',   icon: '↑', isDefault: false },
  { key: 'latest', label: 'Latest',         icon: '🕒', isDefault: false },
  { key: 'most',   label: 'Most Feedback',  icon: '💬', isDefault: false },
  { key: 'least',  label: 'Least Feedback', icon: '💬', isDefault: false },
];

function applySortBy(cards, sort) {
  const c = [...cards];
  if (sort === 'best')   return c.sort((a, b) => b.avg - a.avg);
  if (sort === 'latest') return c.sort((a, b) => {
    const toMs = (d) => d ? new Date(d.endsWith('Z') ? d : d + 'Z').getTime() : 0;
    return toMs(b.lastIssue) - toMs(a.lastIssue);
  });
  if (sort === 'most')  return c.sort((a, b) => b.count - a.count);
  if (sort === 'least') return c.sort((a, b) => a.count - b.count);
  // 'worst' — avg ascending (lowest first)
  return c.sort((a, b) => a.avg - b.avg);
}

// ── Main Component ─────────────────────────────────────────────
export default function OwnerPage() {
  const [activeTab, setActiveTab]     = useState('today');
  const [sortBy, setSortBy]           = useState('worst');
  const [sortOpen, setSortOpen]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [visible, setVisible]       = useState(true);   // drives opacity transition
  const [initialLoad, setInitialLoad] = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    // Fade out, load, fade in
    setVisible(false);

    // cancel any in-flight fetch
    if (abortRef.current) abortRef.current = false;
    const token = { alive: true };
    abortRef.current = token;

    const since = getStartDate(activeTab);

    supabase
      .from('feedback')
      .select('category,q1,q1_label,q2,q2_label,q3,q3_label,created_at')
      .eq('cafe_id', process.env.NEXT_PUBLIC_CAFE_ID)
      .gte('created_at', since)
      .not('q1', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!token.alive) return;
        if (error) {
          setFetchError(error.message ?? 'Unknown error');
        } else {
          setRows(data ?? []);
          setFetchError(null);
        }
        setInitialLoad(false);
        // Small delay so fade-out is perceptible before new data fades in
        setTimeout(() => { if (token.alive) setVisible(true); }, 80);
      });

    return () => { token.alive = false; };
  }, [activeTab]);

  const total        = rows.length;
  const overall      = avg(rows.flatMap((r) => [r.q1, r.q2, r.q3]));
  const cards        = total > 0 ? buildCards(rows) : [];
  const displayCards = activeTab === 'today' ? applySortBy(cards, sortBy) : cards;
  const lastSeenAt   = rows[0]?.created_at ?? null;
  const dateLabel    = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const periodLabel  = TABS.find((t) => t.key === activeTab)?.shortLabel ?? 'today';

  return (
    <div className="ow-shell">

      {/* ── Header ── */}
      <header className="ow-header">
        <span className="ow-brand">RateMyMeal</span>
        <span className="ow-date">{dateLabel}</span>
      </header>

      {/* ── Tab bar ── */}
      <div className="ow-tabs" role="tablist">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={activeTab === key}
            className={`ow-tab-btn ${activeTab === key ? 'ow-tab-btn--active' : ''}`}
            onClick={() => activeTab !== key && setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content (fades between tabs) ── */}
      <div className={`ow-tab-content ${visible ? 'ow-tab-content--in' : 'ow-tab-content--out'}`}>

        {initialLoad && (
          <div className="ow-card ow-loading-card">
            <span className="ow-loading-dot" /><span className="ow-loading-dot" /><span className="ow-loading-dot" />
          </div>
        )}

        {!initialLoad && fetchError && (
          <div className="ow-card ow-error">⚠️ Could not load data: {fetchError}</div>
        )}

        {!initialLoad && !fetchError && total === 0 && (
          <div className="ow-card ow-empty">
            <p className="ow-empty-icon">☕</p>
            <p className="ow-empty-title">No feedback for {periodLabel}</p>
            <p className="ow-empty-sub">Check back after the first meal service.</p>
          </div>
        )}

        {!initialLoad && total > 0 && activeTab !== 'today' && (
          <TrendView rows={rows} tab={activeTab} />
        )}

        {!initialLoad && total > 0 && activeTab === 'today' && (
          <>
            {/* Summary strip */}
            <div className="ow-card ow-summary">
              <div className="ow-stat"><span className="ow-stat-value">{total}</span><span className="ow-stat-label">responses</span></div>
              <div className="ow-divider" />
              <div className="ow-stat"><span className="ow-stat-value">{overall?.toFixed(1) ?? '—'}<small>/5</small></span><span className="ow-stat-label">avg rating</span></div>
              {lastSeenAt && (<><div className="ow-divider" /><div className="ow-stat"><LiveTime dateStr={lastSeenAt} className="ow-stat-value ow-stat-value--sm" /><span className="ow-stat-label">last feedback</span></div></>)}
            </div>

            {/* Sort bar */}
            <div className="ow-sort-bar">
              {!sortOpen ? (
                <button id="sort-trigger" className="ow-sort-trigger" onClick={() => setSortOpen(true)} aria-expanded={false}>
                  <span className="ow-sort-icon">{SORT_OPTIONS.find((o) => o.key === sortBy)?.icon}</span>
                  Sort by: <strong>{SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Low Ratings'}</strong>
                  <span className="ow-sort-arrow">▼</span>
                </button>
              ) : (
                <div className="ow-sort-options" aria-label="Sort options">
                  {SORT_OPTIONS.map(({ key, label, icon, isDefault }) => (
                    <button key={key} id={`sort-${key}`} className={`ow-sort-btn ${sortBy === key ? 'ow-sort-btn--active' : ''} ${key === 'least' ? 'ow-sort-btn--muted-icon' : ''}`} onClick={() => { setSortBy(key); setSortOpen(false); }}>
                      <span className="ow-sort-opt-icon">{icon}</span>
                      {label}
                      {isDefault && <span className="ow-sort-default">default</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category cards */}
            {displayCards.map(({ cat, avg: catA, priority, wq, unhappy, trend, lastIssue, questions, recentEntryAvg, issueDisplay, urgent, count }) => (
              <div key={cat} className={`ow-card ow-cat-card ow-cat-card--${priority.level} ${urgent && priority.level === 'critical' ? 'ow-cat-card--urgent' : ''}`}>
                <div className="ow-cat-header">
                  <span className="ow-cat-icon">{CAT_ICONS[cat] || '🍴'}</span>
                  <span className="ow-cat-name">{CAT_LABELS[cat] || cat}</span>
                  <span className={`ow-priority-label ${priority.cls}`}>{priority.label}</span>
                  {trend && <span className={TREND_CFG[trend].cls}>{TREND_CFG[trend].text}</span>}
                </div>
                {lastIssue && (<p className="ow-card-time">🕒 {priority.level === 'good' ? 'Updated' : 'Last issue'} <LiveTime dateStr={lastIssue} /></p>)}
                <div className="ow-score-row">
                  <span className="ow-cat-score">{catA.toFixed(1)}<small>/5</small></span>
                  <span className="ow-cat-count">{count} {count === 1 ? 'response' : 'responses'}</span>
                </div>
                {issueDisplay.type === 'real' && unhappy && (<p className="ow-warning-line">⚠️ <strong>{unhappy.unhappy} of last {unhappy.total}</strong> unhappy</p>)}
                {issueDisplay.type === 'happy' && (<p className="ow-happy-line">✅ Customers are happy</p>)}
                {issueDisplay.type === 'soft'  && (<p className="ow-soft-line">~ {issueDisplay.text}</p>)}
                {issueDisplay.type === 'real'  && (<p className="ow-worst-line"><strong>{issueDisplay.text}</strong> <span className="ow-worst-score">({issueDisplay.avgText})</span>{trend === 'worse' ? ' ↓' : trend === 'improving' ? ' ↑' : ''}</p>)}
                {issueDisplay.type === 'real' && issueDisplay.bullets.length > 0 && (<><p className="ow-fix-label">→ Fix now:</p><ul className="ow-fix-list">{issueDisplay.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul></>)}
                <CardDetails questions={questions} recentAvg={recentEntryAvg} cardAvg={catA} />
              </div>
            ))}
          </>
        )}

        <p className="ow-refresh">
          {activeTab === 'today' ? 'Sorted by priority · Live data' : `${periodLabel} · tap Today for live data`}
        </p>
      </div>
    </div>
  );
}
