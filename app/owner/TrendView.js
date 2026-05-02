'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ── Constants ──────────────────────────────────────────────────
const CAT_LABELS = {
  pizza:'Pizza', sandwich:'Sandwich', burger:'Burger', maggi:'Maggi',
  pasta:'Pasta', fries:'Fries', garlic_bread:'Garlic Bread',
  shakes:'Shakes', cold_coffee:'Cold Coffee', hot_beverages:'Hot Beverages',
};
const CAT_ICONS = {
  pizza:'🍕', sandwich:'🥪', burger:'🍔', maggi:'🍜', pasta:'🍝',
  fries:'🍟', garlic_bread:'🥖', shakes:'🥤', cold_coffee:'🧋', hot_beverages:'☕',
};

// ── Helpers ────────────────────────────────────────────────────
function avg(arr) {
  const c = arr.filter(v => v != null);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
}

function toMs(d) {
  return d ? new Date(d.endsWith('Z') ? d : d + 'Z').getTime() : 0;
}

function formatIssue(label) {
  const map = {
    'Taste':'Taste is off','Hot enough':'Not hot enough',
    'Cold enough':'Not cold enough','Crispy':'Not crispy enough',
    'Crispy / grilled':'Not crispy enough','Fresh':'Not fresh',
    'Patty quality':'Poor patty quality','Consistency':'Consistency issue',
    'Filling enough':'Filling not enough','Quantity enough':'Quantity not enough',
    'Thick & creamy':'Not thick enough','Toppings quality':'Poor toppings quality',
    'Sauce quality':'Sauce issue','Garlic / cheese flavor':'Weak garlic/cheese flavor',
    'Well assembled':'Poorly assembled','Properly cooked':'Not cooked properly',
    'Cooked properly':'Not cooked properly','Properly made':'Not made properly',
  };
  return map[label] || label;
}

function getActionBullets(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('taste'))                             return ["Adjust seasoning — taste it now", "Check ingredient freshness"];
  if (l.includes('hot') && !l.includes('cold'))        return ["Serve immediately after cooking", "Don't hold longer than 3 min"];
  if (l.includes('cold') && !l.includes('hot'))        return ["Pre-chill glasses before serving", "Don't leave drinks out before serving"];
  if (l.includes('crispy'))                            return ["Serve immediately — don't stack or cover", "Check oil temp is 170–180°C"];
  if (l.includes('quantity') || l.includes('filling')) return ["Check portion against standard", "Brief staff to add more if in doubt"];
  if (l.includes('fresh'))                             return ["Check ingredient batch and date", "Replace anything that looks off"];
  if (l.includes('thick') || l.includes('cream'))     return ["Add more base mix or ice cream", "Blend longer for texture"];
  if (l.includes('patty'))                             return ["Cook fresh per order", "Check patty color and smell"];
  if (l.includes('sauce'))                             return ["Taste the sauce — fix ratio", "Check sauce batch freshness"];
  if (l.includes('garlic') || l.includes('cheese'))   return ["Spread garlic butter evenly", "Add 1–2 min more in oven if pale"];
  return ["Check prep against recipe card", "Taste before serving"];
}

// ── Analytics ──────────────────────────────────────────────────
function computeTrendStrip(rows, tab) {
  if (tab === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      const startMs = d.getTime(), endMs = startMs + 86400000;
      const label = d.toLocaleDateString('en-IN', { weekday: 'short' });
      const dayRows = rows.filter(r => { const t = toMs(r.created_at); return t >= startMs && t < endMs; });
      const vals = dayRows.flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null);
      return { label, avg: avg(vals), count: dayRows.length };
    });
  } else {
    return Array.from({ length: 4 }, (_, i) => {
      const endMs   = Date.now() - (3 - i) * 7 * 86400000;
      const startMs = endMs - 7 * 86400000;
      const wRows   = rows.filter(r => { const t = toMs(r.created_at); return t >= startMs && t < endMs; });
      const vals    = wRows.flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null);
      return { label: `Wk ${i + 1}`, avg: avg(vals), count: wRows.length };
    });
  }
}

function computeProblemItems(rows) {
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const results = [];
  for (const cat of cats) {
    const catRows = rows.filter(r => r.category === cat);
    if (catRows.length < 2) continue;
    const allVals = catRows.flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null);
    const catAvg  = avg(allVals);
    if (catAvg === null) continue;

    const half       = Math.floor(catRows.length / 2);
    const recentAvg  = avg(catRows.slice(0, half).flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null));
    const olderAvg   = avg(catRows.slice(half).flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null));
    const trend      = (recentAvg !== null && olderAvg !== null)
      ? (recentAvg < olderAvg - 0.3 ? 'worse' : recentAvg > olderAvg + 0.3 ? 'better' : 'stable')
      : 'stable';

    const isLow      = catAvg < 3.5;
    const isWorsening = trend === 'worse';
    if (!isLow && !isWorsening) continue;

    const byLabel = {};
    for (const r of catRows)
      for (const [q, lbl] of [[r.q1, r.q1_label], [r.q2, r.q2_label], [r.q3, r.q3_label]])
        if (q != null && lbl) { if (!byLabel[lbl]) byLabel[lbl] = []; byLabel[lbl].push(q); }

    let worstLabel = null, worstA = Infinity;
    for (const [lbl, vals] of Object.entries(byLabel)) {
      const a = avg(vals); if (a < worstA) { worstA = a; worstLabel = lbl; }
    }
    results.push({ cat, avg: catAvg, trend, worstLabel, count: catRows.length, isWorsening });
  }
  return results.sort((a, b) => a.avg - b.avg).slice(0, 5);
}

function generateRuleInsights(rows, tab) {
  const ins = [];
  const period = tab === 'week' ? 'week' : 'month';
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];

  for (const cat of cats) {
    if (ins.length >= 2) break;
    const vals = rows.filter(r => r.category === cat).flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null);
    const a = avg(vals);
    if (a !== null && a < 3.0)
      ins.push(`${CAT_LABELS[cat] || cat} has consistently low ratings (${a.toFixed(1)}/5) this ${period}.`);
  }

  for (const cat of cats) {
    if (ins.length >= 3) break;
    const catRows = rows.filter(r => r.category === cat);
    if (catRows.length < 6) continue;
    const half = Math.floor(catRows.length / 2);
    const ra = avg(catRows.slice(0, half).flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null));
    const oa = avg(catRows.slice(half).flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null));
    if (ra !== null && oa !== null) {
      if (ra < oa - 0.4) ins.push(`${CAT_LABELS[cat] || cat} quality is declining recently.`);
      else if (ra > oa + 0.4) ins.push(`${CAT_LABELS[cat] || cat} has improved this ${period}.`);
    }
  }

  const timeGroups = { Morning: [], Afternoon: [], Evening: [] };
  for (const r of rows) {
    const h = new Date(toMs(r.created_at)).getHours();
    const a = avg([r.q1, r.q2, r.q3].filter(v => v != null));
    if (a === null) continue;
    if (h >= 6 && h < 12) timeGroups.Morning.push(a);
    else if (h >= 12 && h < 17) timeGroups.Afternoon.push(a);
    else if (h >= 17) timeGroups.Evening.push(a);
  }
  let worstTime = null, worstAvg = Infinity;
  for (const [t, vals] of Object.entries(timeGroups)) {
    const a = avg(vals);
    if (a !== null && vals.length >= 3 && a < worstAvg) { worstAvg = a; worstTime = t; }
  }
  if (worstTime && worstAvg < 3.5 && ins.length < 4)
    ins.push(`${worstTime} service has the lowest ratings (${worstAvg.toFixed(1)}/5) this ${period}.`);

  if (!ins.length) {
    const a = avg(rows.flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null));
    ins.push(`Overall performance is ${a >= 4 ? 'strong' : a >= 3 ? 'moderate' : 'below expectations'} this ${period}.`);
  }
  return ins.slice(0, 4);
}

// ── Component ──────────────────────────────────────────────────
export default function TrendView({ rows, tab }) {
  const [insights, setInsights]       = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [prevAvg, setPrevAvg]         = useState(null);

  const trendStrip    = computeTrendStrip(rows, tab);
  const problemItems  = computeProblemItems(rows);
  const overallAvg    = avg(rows.flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null));
  const total         = rows.length;
  const period        = tab === 'week' ? 'week' : 'month';

  // Fetch previous period avg for comparison
  useEffect(() => {
    const days     = tab === 'week' ? 7 : 30;
    const prevStart = new Date(Date.now() - 2 * days * 86400000).toISOString();
    const prevEnd   = new Date(Date.now() - days * 86400000).toISOString();
    supabase.from('feedback').select('q1,q2,q3')
      .gte('created_at', prevStart).lt('created_at', prevEnd).not('q1', 'is', null)
      .then(({ data }) => {
        if (data?.length) {
          const vals = data.flatMap(r => [r.q1, r.q2, r.q3]).filter(v => v != null);
          setPrevAvg(avg(vals));
        }
      });
  }, [tab]);

  // Fetch Groq insights (with rule fallback)
  useEffect(() => {
    if (!rows.length) { setInsightsLoading(false); return; }
    const ruleInsights = generateRuleInsights(rows, tab);
    fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab,
        overallAvg: overallAvg?.toFixed(2),
        totalResponses: total,
        problemItems: problemItems.slice(0, 3).map(p => ({
          category: CAT_LABELS[p.cat] || p.cat,
          avg: p.avg?.toFixed(2),
          trend: p.trend,
          issue: p.worstLabel || 'unknown',
        })),
        ruleInsights,
      }),
    })
      .then(r => r.json())
      .then(d => setInsights(d.insights?.length ? d.insights : ruleInsights))
      .catch(() => setInsights(ruleInsights))
      .finally(() => setInsightsLoading(false));
  }, [rows, tab]);

  const change = (overallAvg !== null && prevAvg !== null) ? (overallAvg - prevAvg) : null;
  const changeSign = change === null ? '' : change > 0.05 ? '+' : change < -0.05 ? '' : '±';

  return (
    <div className="tr-root">

      {/* ── Summary ── */}
      <div className="ow-card tr-summary">
        <div className="tr-stat">
          <span className="tr-stat-val">{overallAvg?.toFixed(1) ?? '—'}<small>/5</small></span>
          <span className="tr-stat-lbl">avg rating</span>
        </div>
        <div className="tr-vdivider" />
        <div className="tr-stat">
          <span className="tr-stat-val">{total}</span>
          <span className="tr-stat-lbl">responses</span>
        </div>
        {change !== null && (
          <>
            <div className="tr-vdivider" />
            <div className="tr-stat">
              <span className={`tr-stat-val tr-chg ${change > 0.05 ? 'tr-chg--up' : change < -0.05 ? 'tr-chg--down' : 'tr-chg--flat'}`}>
                {changeSign}{change.toFixed(1)}
              </span>
              <span className="tr-stat-lbl">vs prev {period}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Key Insights ── */}
      <div className="ow-card tr-card">
        <p className="tr-section-title">💡 Key Insights</p>
        {insightsLoading ? (
          <div className="tr-dots">
            <span className="ow-loading-dot" /><span className="ow-loading-dot" /><span className="ow-loading-dot" />
          </div>
        ) : insights?.length ? (
          <ul className="tr-insight-list">
            {insights.map((ins, i) => <li key={i}>{ins}</li>)}
          </ul>
        ) : (
          <p className="tr-empty-note">Not enough data for insights yet.</p>
        )}
      </div>

      {/* ── Trend Strip ── */}
      <div className="ow-card tr-card">
        <p className="tr-section-title">📈 Rating Trend</p>
        <div className="tr-chart">
          {trendStrip.map(({ label, avg: colAvg, count }, i) => {
            const h   = colAvg !== null ? Math.max(4, Math.round((colAvg / 5) * 44)) : 4;
            const clr = colAvg === null ? '#e5e7eb' : colAvg >= 4 ? '#10b981' : colAvg >= 3 ? '#f59e0b' : '#ef4444';
            return (
              <div key={i} className="tr-chart-col">
                <span className="tr-chart-val">{colAvg !== null ? colAvg.toFixed(1) : ''}</span>
                <div className="tr-bar-wrap">
                  <div className="tr-bar" style={{ height: `${h}px`, background: clr }} />
                </div>
                <span className="tr-chart-lbl">{label}</span>
                {count > 0 && <span className="tr-chart-cnt">{count}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Problem Items ── */}
      {problemItems.length > 0 ? (
        <div className="ow-card tr-card tr-problems">
          <p className="tr-section-title">⚠️ Problem Items <span className="tr-section-count">({problemItems.length})</span></p>
          {problemItems.map(({ cat, avg: catAvg, trend, worstLabel, count, isWorsening }) => {
            const bullets = getActionBullets(worstLabel);
            return (
              <div key={cat} className={`tr-prob ${isWorsening ? 'tr-prob--worse' : ''}`}>
                <div className="tr-prob-header">
                  <span className="tr-prob-icon">{CAT_ICONS[cat] || '🍴'}</span>
                  <span className="tr-prob-name">{CAT_LABELS[cat] || cat}</span>
                  <span className="tr-prob-avg">{catAvg.toFixed(1)}<small>/5</small></span>
                  <span className={`tr-trend ${trend === 'worse' ? 'tr-trend--down' : trend === 'better' ? 'tr-trend--up' : 'tr-trend--flat'}`}>
                    {trend === 'worse' ? '↓' : trend === 'better' ? '↑' : '→'}
                  </span>
                </div>
                {worstLabel && (
                  <p className="tr-prob-issue">
                    {formatIssue(worstLabel)}
                    <span className="tr-prob-cnt"> · {count} {count === 1 ? 'resp' : 'resp'}</span>
                  </p>
                )}
                <ul className="tr-prob-fixes">
                  {bullets.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ow-card tr-all-good">
          ✅ No persistent issues this {period}
        </div>
      )}

    </div>
  );
}
