'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const CAT_LABELS = {
  pizza:'Pizza', sandwich:'Sandwich', burger:'Burger', maggi:'Maggi',
  pasta:'Pasta', fries:'Fries', garlic_bread:'Garlic Bread',
  shakes:'Shakes', cold_coffee:'Cold Coffee', hot_beverages:'Hot Beverages',
};
const CAT_ICONS = {
  pizza:'🍕', sandwich:'🥪', burger:'🍔', maggi:'🍜', pasta:'🍝',
  fries:'🍟', garlic_bread:'🥖', shakes:'🥤', cold_coffee:'🧋', hot_beverages:'☕',
};

// ── Pure helpers ───────────────────────────────────────────────
function avg(arr) {
  const c = arr.filter(v => v != null);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
}
function toMs(d) { return d ? new Date(d.endsWith('Z') ? d : d + 'Z').getTime() : 0; }
function fmtShort(ms) { return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function getMondayOf(ms) {
  const d = new Date(ms); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  return d;
}
function formatIssue(label) {
  const m = { 'Taste':'Taste is off','Hot enough':'Not hot enough','Cold enough':'Not cold enough',
    'Crispy':'Not crispy enough','Crispy / grilled':'Not crispy enough','Fresh':'Not fresh',
    'Patty quality':'Poor patty quality','Consistency':'Consistency issue',
    'Filling enough':'Filling not enough','Quantity enough':'Quantity not enough',
    'Thick & creamy':'Not thick enough','Toppings quality':'Poor toppings quality',
    'Sauce quality':'Sauce issue','Garlic / cheese flavor':'Weak garlic/cheese flavor',
    'Well assembled':'Poorly assembled','Properly cooked':'Not cooked properly',
    'Cooked properly':'Not cooked properly','Properly made':'Not made properly' };
  return m[label] || label;
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

// ── Calendar computations ──────────────────────────────────────
// 7-day: calendar week (Mon-Sun) based on weekOffset
function computeWeekDays(rows, weekOffset) {
  const thisMonday = getMondayOf(Date.now());
  const startOfWeek = new Date(thisMonday.getTime() - weekOffset * 7 * 86400000);
  const today = new Date();
  today.setHours(0,0,0,0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek.getTime() + i * 86400000);
    const startMs = d.getTime();
    const endMs = startMs + 86400000;
    const isFuture = d > today;

    const dayRows = rows.filter(r => { const t = toMs(r.created_at); return t >= startMs && t < endMs; });
    const vals = dayRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null);
    
    return { 
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }), 
      dateLabel: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), 
      avg: isFuture ? null : avg(vals), 
      count: isFuture ? 0 : dayRows.length,
      isFuture,
      date: d
    };
  });
}

// 30-day: real Mon–Sun calendar weeks, oldest → latest
function computeCalWeeks(rows) {
  const thisMonday = getMondayOf(Date.now());
  const cutoff     = Date.now() - 30 * 86400000;
  const weeks = [];
  for (let w = 4; w >= 0; w--) {
    const weekStart = new Date(thisMonday.getTime() - w * 7 * 86400000);
    const weekEnd   = new Date(weekStart.getTime() + 7 * 86400000);
    if (weekEnd.getTime() <= cutoff) continue;
    const wRows = rows.filter(r => { const t = toMs(r.created_at); return t >= weekStart.getTime() && t < weekEnd.getTime(); });
    const vals  = wRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null);
    const sun   = new Date(weekEnd.getTime() - 86400000);
    weeks.push({ label: `${fmtShort(weekStart)} – ${fmtShort(sun)}`, barLabel: fmtShort(weekStart), weekStart, weekEnd, avg: avg(vals), count: wRows.length, rows: wRows });
  }
  return weeks;
}

// ── Problem items ──────────────────────────────────────────────
function buildProblemItems(rows, prevRows) {
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const results = [];
  for (const cat of cats) {
    const catRows = rows.filter(r => r.category === cat);
    if (!catRows.length) continue;
    const allVals = catRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null);
    const catAvg  = avg(allVals);
    if (catAvg === null) continue;

    // Trend & tag
    let insightTag, trend = 'stable';
    if (prevRows) {
      // 30-day mode: compare vs previous week
      const prevVals = prevRows.filter(r => r.category === cat).flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null);
      const pAvg = avg(prevVals);
      if (pAvg !== null) {
        const delta = catAvg - pAvg;
        if (delta > 0.2)  { trend = 'better'; insightTag = { label: 'Improving vs last week', cls: 'tr-tag--better' }; }
        else              { trend = 'stable'; insightTag = { label: 'This week issue',         cls: 'tr-tag--low'    }; }
      } else              { insightTag = { label: 'This week issue', cls: 'tr-tag--low' }; }
    } else {
      // 7-day mode: split-half trend
      const half = Math.floor(catRows.length / 2);
      const ra   = avg(catRows.slice(0,half).flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null));
      const oa   = avg(catRows.slice(half).flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null));
      if (ra !== null && oa !== null) {
        if      (ra < oa - 0.3) { trend = 'worse';  insightTag = { label: 'Getting Worse',    cls: 'tr-tag--worse'  }; }
        else if (ra > oa + 0.3) { trend = 'better'; insightTag = { label: 'Improving',        cls: 'tr-tag--better' }; }
        else                    { trend = 'stable'; insightTag = { label: 'Consistent Issue', cls: 'tr-tag--low'    }; }
      } else { insightTag = { label: 'Consistent Issue', cls: 'tr-tag--low' }; }
    }

    const isLow = catAvg < 3.5, isWorsening = trend === 'worse';
    if (!isLow && !isWorsening && insightTag.cls !== 'tr-tag--low') continue;

    const byLabel = {};
    for (const r of catRows)
      for (const [q,lbl] of [[r.q1,r.q1_label],[r.q2,r.q2_label],[r.q3,r.q3_label]])
        if (q != null && lbl) { if (!byLabel[lbl]) byLabel[lbl]=[]; byLabel[lbl].push(q); }
    let worstLabel = null, worstA = Infinity;
    for (const [lbl,vals] of Object.entries(byLabel)) { const a=avg(vals); if(a<worstA){worstA=a;worstLabel=lbl;} }
    results.push({ cat, avg: catAvg, trend, worstLabel, count: catRows.length, isWorsening, insightTag });
  }
  return results.sort((a,b) => a.avg - b.avg).slice(0,5);
}

// ── Insights ───────────────────────────────────────────────────
function generateWeekInsights(rows) {
  const ins = [], cats = [...new Set(rows.map(r=>r.category).filter(Boolean))];
  const catStats = cats.map(cat => {
    const cr = rows.filter(r=>r.category===cat);
    const h  = Math.floor(cr.length/2);
    const a  = avg(cr.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));
    const ra = avg(cr.slice(0,h).flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));
    const oa = avg(cr.slice(h).flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));
    return { name: CAT_LABELS[cat]||cat, avg: a, delta: (ra&&oa)?ra-oa:null, count: cr.length };
  }).filter(s=>s.avg!==null);

  const lowItems = catStats.filter(s=>s.avg<3.5).sort((a,b)=>a.avg-b.avg);
  if (lowItems.length>=2) ins.push(`${lowItems.slice(0,2).map(s=>s.name).join(' and ')} are consistently pulling ratings down this week.`);
  else if (lowItems.length===1) ins.push(`${lowItems[0].name} has been consistently low at ${lowItems[0].avg.toFixed(1)}/5 this week.`);

  for (const s of catStats) { if(ins.length>=3)break; if(s.delta!==null&&s.delta<-0.4&&s.count>=4) ins.push(`${s.name} ratings dropped in the second half of the week.`); }
  for (const s of catStats) { if(ins.length>=4)break; if(s.delta!==null&&s.delta>0.4&&s.count>=4) ins.push(`${s.name} improved towards recent days.`); }

  const tg = {Morning:[],Afternoon:[],Evening:[]};
  for (const r of rows) {
    const h=new Date(toMs(r.created_at)).getHours(), a=avg([r.q1,r.q2,r.q3].filter(v=>v!=null));
    if(a===null)continue;
    if(h>=6&&h<12)tg.Morning.push(a); else if(h>=12&&h<17)tg.Afternoon.push(a); else if(h>=17)tg.Evening.push(a);
  }
  let wt=null,wa=Infinity,bt=null;
  for(const[t,v] of Object.entries(tg)){if(v.length<3)continue;const a=avg(v);if(a<wa){wa=a;wt=t;}if(bt===null)bt=t;}
  if(wt&&wa<3.5&&ins.length<4) ins.push(`${wt} orders show lower ratings than ${bt||'other'} service.`);

  if(!ins.length){const a=avg(rows.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));if(a!==null)ins.push(`Overall performance is ${a>=4?'strong':a>=3?'moderate':'below expectations'} this week.`);}
  return ins.slice(0,4);
}

function getMonthlyStats(calWeeks) {
  const validWeeks = calWeeks.filter(w => w.count > 0);
  if (!validWeeks.length) return { bestWeek: null, weakestWeek: null, consistencyItems: [], weeklyCardsData: [] };

  const bestWeek = validWeeks.reduce((max, w) => w.avg > max.avg ? w : max, validWeeks[0]);
  const weakestWeek = validWeeks.reduce((min, w) => w.avg < min.avg ? w : min, validWeeks[0]);

  const consistencyMap = {};
  const consistencyTimeMap = {};
  const catWeekAvgs = {};

  calWeeks.forEach(w => {
    const cats = [...new Set(w.rows.map(r => r.category).filter(Boolean))];
    cats.forEach(cat => {
      const catRows = w.rows.filter(r => r.category === cat);
      const a = avg(catRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null));
      if (a !== null) {
        if (!catWeekAvgs[cat]) catWeekAvgs[cat] = [];
        catWeekAvgs[cat].push(a);

        if (a < 3.5) {
          if (!consistencyMap[cat]) consistencyMap[cat] = 0;
          consistencyMap[cat]++;
        }
      }
    });

    const timeGrp = { Morning: 0, Afternoon: 0, Evening: 0 };
    w.rows.forEach(r => {
      const a = avg([r.q1,r.q2,r.q3].filter(v => v != null));
      if (a !== null && a < 3.5) {
        const h = new Date(toMs(r.created_at)).getHours();
        if (h >= 6 && h < 12) timeGrp.Morning++;
        else if (h >= 12 && h < 17) timeGrp.Afternoon++;
        else timeGrp.Evening++;
      }
    });
    
    let peakT = null; let maxC = 0;
    Object.entries(timeGrp).forEach(([t, c]) => { if (c > maxC) { maxC = c; peakT = t; } });
    if (peakT) {
      if (!consistencyTimeMap[peakT]) consistencyTimeMap[peakT] = 0;
      consistencyTimeMap[peakT]++;
    }
  });

  const consistencyItems = Object.entries(consistencyMap)
    .map(([cat, count]) => ({ cat, count }))
    .filter(item => item.count >= 2)
    .sort((a, b) => b.count - a.count);

  const stabilityMap = {};
  Object.entries(catWeekAvgs).forEach(([cat, avgs]) => {
    if (avgs.length >= 2) {
      const maxA = Math.max(...avgs);
      const minA = Math.min(...avgs);
      if (maxA - minA >= 0.7) stabilityMap[cat] = 'Unstable';
      else if (maxA - minA <= 0.2) stabilityMap[cat] = 'Stable';
    }
  });

  const weeklyCardsData = [...calWeeks].map((w, index, arr) => {
    const prevWeek = index > 0 ? arr[index - 1] : null;
    
    const catCounts = {};
    w.rows.forEach(r => { if(r.category) { catCounts[r.category] = (catCounts[r.category] || 0) + 1; } });
    let mostReviewed = null; let maxCount = 0;
    Object.entries(catCounts).forEach(([cat, cnt]) => { if(cnt > maxCount) { maxCount = cnt; mostReviewed = cat; } });

    let lowestRated = null; let lowestAvg = Infinity;
    const catAvgs = {};
    Object.keys(catCounts).forEach(cat => {
      const catRows = w.rows.filter(r => r.category === cat);
      const a = avg(catRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null));
      catAvgs[cat] = a;
      if (a !== null && a < lowestAvg) { lowestAvg = a; lowestRated = cat; }
    });

    let biggestImprovement = null; let maxImp = 0; let impPrevAvg = 0; let impCurrAvg = 0;
    let biggestDecline = null; let maxDec = 0;
    if (prevWeek) {
      Object.keys(catCounts).forEach(cat => {
        const a = catAvgs[cat];
        const pRows = prevWeek.rows.filter(r => r.category === cat);
        const pAvg = avg(pRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null));
        if (a !== null && pAvg !== null) {
          const diff = a - pAvg;
          if (diff > 0.3 && diff > maxImp) { maxImp = diff; biggestImprovement = cat; impPrevAvg = pAvg; impCurrAvg = a; }
          if (diff < -0.3 && diff < maxDec) { maxDec = diff; biggestDecline = cat; }
        }
      });
    }

    const timeGrp = { Morning: 0, Afternoon: 0, Evening: 0 };
    w.rows.forEach(r => {
      const a = avg([r.q1,r.q2,r.q3].filter(v => v != null));
      if (a !== null && a < 3.5) {
        const h = new Date(toMs(r.created_at)).getHours();
        if (h >= 6 && h < 12) timeGrp.Morning++;
        else if (h >= 12 && h < 17) timeGrp.Afternoon++;
        else timeGrp.Evening++;
      }
    });
    let peakComplaintTime = null; let maxC = 0;
    Object.entries(timeGrp).forEach(([t, c]) => { if (c > maxC) { maxC = c; peakComplaintTime = t; } });

    return { ...w, mostReviewed, maxCount, lowestRated, lowestAvg, biggestImprovement, maxImp, impPrevAvg, impCurrAvg, biggestDecline, maxDec, peakComplaintTime };
  }).reverse(); 

  return { bestWeek, weakestWeek, consistencyItems, weeklyCardsData, validWeeks, consistencyTimeMap, stabilityMap };
}

function generateMonthInsights(consistencyItems, validWeeks, consistencyTimeMap, weeklyCardsData) {
  const ins = [];
  if (consistencyItems.length > 0) {
    const topCat = CAT_LABELS[consistencyItems[0].cat] || consistencyItems[0].cat;
    ins.push(`${topCat} weak for ${consistencyItems[0].count} weeks.`);
  } else {
    ins.push("No recurring kitchen issues detected this month.");
  }
  
  if (consistencyTimeMap) {
    const times = Object.entries(consistencyTimeMap).sort((a,b) => b[1]-a[1]);
    if (times.length > 0 && times[0][1] >= 2) {
      ins.push(`${times[0][0]} complaints recurring.`);
    }
  }
  
  const latestWeek = weeklyCardsData && weeklyCardsData[0];
  if (latestWeek && latestWeek.biggestImprovement) {
    const impCatName = CAT_LABELS[latestWeek.biggestImprovement] || latestWeek.biggestImprovement;
    ins.push(`${impCatName} quality improved week-over-week.`);
  } else if (validWeeks.length >= 2) {
    const latest = validWeeks[validWeeks.length - 1];
    const prev = validWeeks[validWeeks.length - 2];
    if (latest.avg && prev.avg) {
      const diff = latest.avg - prev.avg;
      if (diff > 0.1) ins.push(`Ratings improved compared to previous week.`);
      else if (diff < -0.1) ins.push(`Kitchen consistency slipped this week.`);
    }
  }
  return ins.slice(0, 3);
}

// ── Component ──────────────────────────────────────────────────
export default function TrendView({ rows, tab }) {
  const [insights, setInsights]             = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [prevAvg, setPrevAvg]               = useState(null);
  
  // Week navigation state
  const [weekOffset, setWeekOffset] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const [expandedWeeks, setExpandedWeeks] = useState({});
  const toggleWeek = (i) => setExpandedWeeks(prev => ({ ...prev, [i]: !prev[i] }));

  const period  = tab==='week'?'week':'month';

  // ── Data per tab ──
  const weekDays   = tab==='week' ? computeWeekDays(rows, weekOffset) : null;
  const calWeeks   = tab==='month'? computeCalWeeks(rows)   : null;
  const monthStats = tab==='month'? getMonthlyStats(calWeeks) : null;
  
  // For 'week', filter rows to only those in the current week view
  const weekRows = tab==='week' ? rows.filter(r => {
    const t = toMs(r.created_at);
    return t >= weekDays[0].date.getTime() && t < weekDays[6].date.getTime() + 86400000;
  }) : [];
  
  const currRows   = tab==='month'? (calWeeks[calWeeks.length-1]?.rows||[]) : weekRows;
  
  // For 'week' tab problem items, we compare to previous week.
  const weekPrevRows = tab==='week' ? rows.filter(r => {
    const t = toMs(r.created_at);
    return t >= weekDays[0].date.getTime() - 7 * 86400000 && t < weekDays[0].date.getTime();
  }) : [];
  
  const prevRows   = tab==='month'? (calWeeks[calWeeks.length-2]?.rows||[]) : weekPrevRows;
  const problemItems = buildProblemItems(currRows, prevRows);
  
  const total   = tab==='week'? currRows.length : rows.length;
  const overall = tab==='week'? avg(currRows.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null)) : avg(rows.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));

  // Previous period avg (for summary change indicator)
  useEffect(()=>{
    if (tab === 'week') {
      setPrevAvg(avg(weekPrevRows.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null)));
    } else {
      const days=30;
      const ps=new Date(Date.now()-2*days*86400000).toISOString();
      const pe=new Date(Date.now()-days*86400000).toISOString();
      supabase.from('feedback').select('q1,q2,q3').eq('cafe_id', process.env.NEXT_PUBLIC_CAFE_ID).gte('created_at',ps).lt('created_at',pe).not('q1','is',null)
        .then(({data})=>{ if(data?.length){const v=data.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null);setPrevAvg(avg(v));} });
    }
  },[tab, weekOffset, rows]);

  // Groq / rule insights
  useEffect(()=>{
    if(!currRows.length){setInsightsLoading(false);return;}
    setInsightsLoading(true);
    const ruleInsights=tab==='week'?generateWeekInsights(currRows):generateMonthInsights(monthStats?.consistencyItems || [], monthStats?.validWeeks || [], monthStats?.consistencyTimeMap || {}, monthStats?.weeklyCardsData || []);
    fetch('/api/insights',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tab,overallAvg:overall?.toFixed(2),totalResponses:total,ruleInsights})})
      .then(r=>r.json()).then(d=>setInsights(d.insights?.length?d.insights:ruleInsights))
      .catch(()=>setInsights(ruleInsights)).finally(()=>setInsightsLoading(false));
  },[rows,tab,weekOffset]);

  const change     = (overall!==null&&prevAvg!==null)?overall-prevAvg:null;
  const changeSign = change===null?'':change>0.05?'+':change<-0.05?'':'±';

  // Weekday range subtitle for 7-day
  const weekSubtitle = (() => {
    if (tab !== 'week' || !weekDays) return '';
    return `${weekDays[0].dateLabel} – ${weekDays[6].dateLabel}`;
  })();

  const barColor = (v, isFuture) => isFuture ? '#f3f4f6' : v===null?'#e5e7eb':v>=4?'#10b981':v>=3?'#f59e0b':'#ef4444';

  const onTouchStart = (e) => setTouchStart(e.targetTouches[0].clientX);
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const dist = touchStart - touchEnd;
    const swipeThreshold = 50;
    if (dist > swipeThreshold && weekOffset > 0) setWeekOffset(w => w - 1);
    if (dist < -swipeThreshold && weekOffset < 8) setWeekOffset(w => w + 1);
    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <div className="tr-root">

      {/* ── SUMMARY / SNAPSHOT ── */}
      {tab === 'week' ? (
        <div className="ow-card tr-summary">
          <div className="tr-stat"><span className="tr-stat-val">{overall?.toFixed(1)??'—'}<small>/5</small></span><span className="tr-stat-lbl">avg rating</span></div>
          <div className="tr-vdivider"/>
          <div className="tr-stat"><span className="tr-stat-val">{total}</span><span className="tr-stat-lbl">responses</span></div>
          {change!==null&&(<><div className="tr-vdivider"/><div className="tr-stat"><span className={`tr-stat-val tr-chg ${change>0.05?'tr-chg--up':change<-0.05?'tr-chg--down':'tr-chg--flat'}`}>{changeSign}{change.toFixed(1)}</span><span className="tr-stat-lbl">vs prev {period}</span></div></>)}
        </div>
      ) : (
        <div className="ow-card tr-summary" style={{gap: '0.5rem', flexWrap: 'wrap'}}>
          <div className="tr-stat" style={{flexBasis: '40%'}}><span className="tr-stat-val">{overall?.toFixed(1)??'—'}<small>/5</small></span><span className="tr-stat-lbl">avg rating</span></div>
          <div className="tr-vdivider"/>
          <div className="tr-stat" style={{flexBasis: '40%'}}><span className="tr-stat-val">{total}</span><span className="tr-stat-lbl">responses</span></div>
          <div style={{width: '100%', height: '1px', background: '#ebebf5', margin: '0.2rem 0'}}/>
          <div className="tr-stat" style={{flexBasis: '40%'}}><span className="tr-stat-val" style={{color:'#10b981'}}>{monthStats?.bestWeek?.avg?.toFixed(1)??'—'}</span><span className="tr-stat-lbl">best week</span></div>
          <div className="tr-vdivider"/>
          <div className="tr-stat" style={{flexBasis: '40%'}}><span className="tr-stat-val" style={{color:'#ef4444'}}>{monthStats?.weakestWeek?.avg?.toFixed(1)??'—'}</span><span className="tr-stat-lbl">weakest week</span></div>
        </div>
      )}

      {/* ── INSIGHTS ── */}
      <div className="ow-card tr-card">
        <p className="tr-section-title">💡 {tab === 'week' ? 'Key Insights' : 'Monthly Insights'}</p>
        {insightsLoading?(<div className="tr-dots"><span className="ow-loading-dot"/><span className="ow-loading-dot"/><span className="ow-loading-dot"/></div>)
          :insights?.length?(<ul className="tr-insight-list">{insights.map((ins,i)=><li key={i}>{ins}</li>)}</ul>)
          :(<p className="tr-empty-note">Not enough data for insights yet.</p>)}
      </div>

      {/* ── RATING TREND (Keep 30-day Chart) ── */}
      <div className="ow-card tr-card">
        <div className="tr-trend-header" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="tr-section-title" style={{margin:0}}>📈 Rating Trend</p>
            <span className="tr-trend-sub">{tab==='week'?`Week · ${weekSubtitle}`:'Last 30 days · by calendar week'}</span>
          </div>
          {tab === 'week' && (
            <div className="tr-week-nav">
              <button onClick={() => setWeekOffset(w => Math.min(w + 1, 8))} disabled={weekOffset >= 8} className="tr-nav-btn">‹</button>
              <span className="tr-nav-lbl">{weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Last Week' : `${weekOffset}w ago`}</span>
              <button onClick={() => setWeekOffset(w => Math.max(w - 1, 0))} disabled={weekOffset === 0} className="tr-nav-btn">›</button>
            </div>
          )}
        </div>

        {tab==='week'&&weekDays&&(
          <div className="tr-chart" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            {weekDays.map(({label,dateLabel,avg:colAvg,count,isFuture},i)=>{
              const h=colAvg!==null?Math.max(4,Math.round((colAvg/5)*70)):isFuture?70:4;
              return(
                <div key={i} className={`tr-chart-col ${isFuture?'tr-chart-col--future':''}`}>
                  <div className="tr-bar-wrap">
                    <span className="tr-chart-val">{colAvg!==null?colAvg.toFixed(1):''}</span>
                    <div className="tr-bar" style={{height:`${h}px`,background:barColor(colAvg, isFuture), opacity: isFuture ? 0.3 : 1}}/>
                  </div>
                  <span className="tr-chart-lbl">{label}</span>
                  <span className="tr-chart-lbl" style={{color:'#c4c4d0'}}>{dateLabel}</span>
                  {(!isFuture || count > 0) && <span className="tr-chart-cnt">{count} resp</span>}
                </div>
              );
            })}
          </div>
        )}

        {tab==='month'&&calWeeks&&(
          <div className="tr-cal-chart">
            {calWeeks.map(({label,avg:wAvg,count},i)=>{
              const h=wAvg!==null?Math.max(4,Math.round((wAvg/5)*44)):4;
              return(
                <div key={i} className="tr-cal-col">
                  <span className="tr-chart-val">{wAvg!==null?wAvg.toFixed(1):''}</span>
                  <div className="tr-bar-wrap"><div className="tr-bar" style={{height:`${h}px`,background:barColor(wAvg, false)}}/></div>
                  <span className="tr-cal-lbl">{label}</span>
                  {count>0&&<span className="tr-chart-cnt">{count} resp</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CONSISTENCY TRACKER (Month Only) ── */}
      {tab === 'month' && monthStats?.consistencyItems?.length > 0 && (
        <div className="ow-card tr-card">
          <p className="tr-section-title">🔄 Consistency Tracker</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
            {monthStats.consistencyItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: '#fffbf5', border: '1px solid #ffedd5', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>{CAT_ICONS[item.cat]||'🍴'}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1a1a2e' }}>{CAT_LABELS[item.cat]||item.cat}</span>
                </div>
                <span className="tr-tag tr-tag--worse">Issues in {item.count}/{monthStats.validWeeks.length} weeks</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── WEEKLY TIMELINE CARDS (Month Only) ── */}
      {tab === 'month' && monthStats?.weeklyCardsData?.length > 0 && (
        <div className="ow-card tr-card" style={{ paddingBottom: '0.5rem' }}>
          <p className="tr-section-title">📅 Weekly Timeline</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.6rem' }}>
            {monthStats.weeklyCardsData.map((w, i) => {
              if (w.count === 0) {
                return (
                  <div key={i} style={{ padding: '0.6rem 0.75rem', border: '1px dashed #cbd5e1', borderRadius: '8px', opacity: 0.6, background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#64748b' }}>{w.label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>No feedback this week</div>
                  </div>
                );
              }

              const isRecurringItem = w.lowestRated && monthStats.consistencyItems.some(ci => ci.cat === w.lowestRated);
              const isRecurringTime = w.peakComplaintTime && monthStats.consistencyTimeMap[w.peakComplaintTime] >= 2;

              return (
                <div key={i} style={{ padding: '0.75rem', border: '1px solid #ebebf5', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => toggleWeek(i)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a2e', marginBottom: '0.3rem' }}>{w.label}</div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span>{w.count} resp</span>
                        {w.lowestRated && <span style={{color:'#dc2626', fontWeight:600}}>· ⚠️ {CAT_LABELS[w.lowestRated]||w.lowestRated}</span>}
                        {isRecurringItem && <span style={{ background: '#fef2f2', color: '#991b1b', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>🔁 Repeated</span>}
                        {isRecurringTime && <span style={{ background: '#fffbeb', color: '#b45309', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>⚠ {w.peakComplaintTime}s recurring</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: barColor(w.avg, false) }}>{w.avg !== null ? w.avg.toFixed(1) : '—'}</span>
                      <span style={{ fontSize: '0.9rem', color: '#ccc', transition: 'transform 0.2s', transform: expandedWeeks[i] ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </div>
                  </div>
                  {expandedWeeks[i] && (
                    <div style={{ marginTop: '0.7rem', borderTop: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: '#f8fafc', padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '3px solid #94a3b8' }}>
                      {w.biggestImprovement && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.2rem 0.2rem' }}><span style={{color:'#64748b'}}>Most Improved:</span> <span style={{fontWeight:600,color:'#059669'}}>{CAT_LABELS[w.biggestImprovement]||w.biggestImprovement} ({w.impPrevAvg.toFixed(1)} → {w.impCurrAvg.toFixed(1)})</span></div>}
                      {w.lowestRated && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', background: '#fef2f2', padding: '0.4rem 0.4rem', borderRadius: '4px', margin: '0.1rem 0' }}><span style={{fontWeight:700, color:'#991b1b'}}>Lowest Rated:</span> <span style={{fontWeight:700,color:'#dc2626'}}>{CAT_LABELS[w.lowestRated]||w.lowestRated} ({w.lowestAvg.toFixed(1)}) {monthStats.stabilityMap[w.lowestRated] === 'Unstable' ? '· Unstable' : ''}</span></div>}
                      {w.peakComplaintTime && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', background: '#fffbeb', padding: '0.4rem 0.4rem', borderRadius: '4px', margin: '0.1rem 0' }}><span style={{fontWeight:700, color:'#b45309'}}>Peak Complaints:</span> <span style={{fontWeight:700, color:'#b45309'}}>{w.peakComplaintTime}s</span></div>}
                      {w.biggestDecline && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.2rem 0.2rem' }}><span style={{color:'#64748b'}}>Biggest Decline:</span> <span style={{fontWeight:600,color:'#dc2626'}}>{CAT_LABELS[w.biggestDecline]||w.biggestDecline} ({w.maxDec.toFixed(1)})</span></div>}
                      {w.mostReviewed && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.2rem 0.2rem' }}><span style={{color:'#64748b'}}>Most Reviewed:</span> <span style={{fontWeight:600, color:'#334155'}}>{CAT_LABELS[w.mostReviewed]||w.mostReviewed} ({w.maxCount}) {monthStats.stabilityMap[w.mostReviewed] ? <span style={{color: monthStats.stabilityMap[w.mostReviewed] === 'Stable' ? '#059669' : '#dc2626'}}>· {monthStats.stabilityMap[w.mostReviewed]}</span> : ''}</span></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PROBLEM ITEMS (Week Only) ── */}
      {tab === 'week' && (problemItems.length > 0 ? (
        <div className="ow-card tr-card tr-problems">
          <p className="tr-section-title">⚠️ Problem Items <span className="tr-section-count">({problemItems.length})</span></p>
          {problemItems.map(({cat,avg:catAvg,trend,worstLabel,count,isWorsening,insightTag})=>{
            const bullets=getActionBullets(cat, worstLabel);
            return(
              <div key={cat} className={`tr-prob ${isWorsening?'tr-prob--worse':''}`}>
                <div className="tr-prob-header">
                  <span className="tr-prob-icon">{CAT_ICONS[cat]||'🍴'}</span>
                  <span className="tr-prob-name">{CAT_LABELS[cat]||cat}</span>
                  {insightTag&&<span className={`tr-tag ${insightTag.cls}`}>{insightTag.label}</span>}
                  <span className="tr-prob-avg">{catAvg.toFixed(1)}<small>/5</small></span>
                  <span className={`tr-trend ${trend==='worse'?'tr-trend--down':trend==='better'?'tr-trend--up':'tr-trend--flat'}`}>{trend==='worse'?'↓':trend==='better'?'↑':'→'}</span>
                </div>
                {worstLabel&&(<p className="tr-prob-issue">{formatIssue(worstLabel)}<span className="tr-prob-cnt"> · {count} resp</span></p>)}
                <ul className="tr-prob-fixes">{bullets.slice(0,2).map((b,i)=><li key={i}>{b}</li>)}</ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ow-card tr-all-good">✅ No persistent issues this week</div>
      ))}

    </div>
  );
}
