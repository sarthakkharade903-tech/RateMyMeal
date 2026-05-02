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
function getActionBullets(label) {
  const l = (label||'').toLowerCase();
  if (l.includes('taste'))                             return ["Adjust seasoning — taste it now","Check ingredient freshness"];
  if (l.includes('hot')&&!l.includes('cold'))         return ["Serve immediately after cooking","Don't hold longer than 3 min"];
  if (l.includes('cold')&&!l.includes('hot'))         return ["Pre-chill glasses before serving","Don't leave drinks out before serving"];
  if (l.includes('crispy'))                           return ["Serve immediately — don't stack","Check oil temp is 170–180°C"];
  if (l.includes('quantity')||l.includes('filling'))  return ["Check portion against standard","Brief staff to add more if in doubt"];
  if (l.includes('fresh'))                            return ["Check ingredient batch and date","Replace anything that looks off"];
  if (l.includes('thick')||l.includes('cream'))       return ["Add more base mix or ice cream","Blend longer for texture"];
  if (l.includes('patty'))                            return ["Cook fresh per order","Check patty color and smell"];
  if (l.includes('sauce'))                            return ["Taste the sauce — fix ratio","Check sauce batch freshness"];
  if (l.includes('garlic')||l.includes('cheese'))     return ["Spread garlic butter evenly","Add 1–2 min more in oven if pale"];
  return ["Check prep against recipe card","Taste before serving"];
}

// ── Calendar computations ──────────────────────────────────────
// 7-day: last 7 calendar days including today
function computeDayStrip(rows) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (6 - i));
    const startMs = d.getTime(), endMs = startMs + 86400000;
    const dayRows = rows.filter(r => { const t = toMs(r.created_at); return t >= startMs && t < endMs; });
    const vals = dayRows.flatMap(r => [r.q1,r.q2,r.q3]).filter(v => v != null);
    return { label: d.toLocaleDateString('en-IN',{weekday:'short'}), dateNum: d.getDate(), avg: avg(vals), count: dayRows.length };
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

function generateMonthInsights(calWeeks) {
  if (calWeeks.length < 2) return generateWeekInsights(calWeeks.flatMap(w=>w.rows));
  const curr = calWeeks[calWeeks.length-1], prev = calWeeks[calWeeks.length-2];
  const ins = [];

  if (curr.avg!==null && prev.avg!==null) {
    const diff = curr.avg - prev.avg;
    if (Math.abs(diff)>0.1) ins.push(`Overall rating ${diff>0?'improved':'dropped'} from ${prev.avg.toFixed(1)} → ${curr.avg.toFixed(1)} this week.`);
  }
  const cats=[...new Set([...curr.rows,...prev.rows].map(r=>r.category).filter(Boolean))];
  const improving=[],worsening=[],persistentLow=[];
  for(const cat of cats){
    const ca=avg(curr.rows.filter(r=>r.category===cat).flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));
    const pa=avg(prev.rows.filter(r=>r.category===cat).flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));
    const n=CAT_LABELS[cat]||cat;
    if(ca!==null&&pa!==null){
      if(ca-pa>0.4)improving.push(n);
      else if(pa-ca>0.4)worsening.push(n);
      if(ca<3.5&&pa<3.5)persistentLow.push(n);
    }
  }
  if(improving.length&&ins.length<3) ins.push(`${improving.slice(0,2).join(' and ')} improved this week.`);
  if(worsening.length&&ins.length<3) ins.push(`${worsening.slice(0,2).join(' and ')} dropped in ratings this week.`);
  if(persistentLow.length&&ins.length<4) ins.push(`${persistentLow.slice(0,2).join(' and ')} ${persistentLow.length===1?'has':'have'} been low for 2+ weeks.`);
  if(!ins.length) return generateWeekInsights(curr.rows);
  return ins.slice(0,4);
}

// ── Component ──────────────────────────────────────────────────
export default function TrendView({ rows, tab }) {
  const [insights, setInsights]             = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [prevAvg, setPrevAvg]               = useState(null);

  const period  = tab==='week'?'week':'month';
  const total   = rows.length;
  const overall = avg(rows.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null));

  // ── Data per tab ──
  const dayStrip   = tab==='week' ? computeDayStrip(rows)   : null;
  const calWeeks   = tab==='month'? computeCalWeeks(rows)   : null;
  const currRows   = tab==='month'? (calWeeks[calWeeks.length-1]?.rows||[]) : rows;
  const prevRows   = tab==='month'? (calWeeks[calWeeks.length-2]?.rows||[]) : null;
  const problemItems = tab==='week' ? buildProblemItems(rows,null) : buildProblemItems(currRows,prevRows);

  // Previous period avg (for summary change indicator)
  useEffect(()=>{
    const days=tab==='week'?7:30;
    const ps=new Date(Date.now()-2*days*86400000).toISOString();
    const pe=new Date(Date.now()-days*86400000).toISOString();
    supabase.from('feedback').select('q1,q2,q3').eq('cafe_id', process.env.NEXT_PUBLIC_CAFE_ID).gte('created_at',ps).lt('created_at',pe).not('q1','is',null)
      .then(({data})=>{ if(data?.length){const v=data.flatMap(r=>[r.q1,r.q2,r.q3]).filter(v=>v!=null);setPrevAvg(avg(v));} });
  },[tab]);

  // Groq / rule insights
  useEffect(()=>{
    if(!rows.length){setInsightsLoading(false);return;}
    const ruleInsights=tab==='week'?generateWeekInsights(rows):generateMonthInsights(calWeeks||[]);
    fetch('/api/insights',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tab,overallAvg:overall?.toFixed(2),totalResponses:total,ruleInsights})})
      .then(r=>r.json()).then(d=>setInsights(d.insights?.length?d.insights:ruleInsights))
      .catch(()=>setInsights(ruleInsights)).finally(()=>setInsightsLoading(false));
  },[rows,tab]);

  const change     = (overall!==null&&prevAvg!==null)?overall-prevAvg:null;
  const changeSign = change===null?'':change>0.05?'+':change<-0.05?'':'±';

  // Weekday range subtitle for 7-day
  const weekSubtitle = (() => {
    const mon=getMondayOf(Date.now()), sun=new Date(mon.getTime()+6*86400000);
    return `${fmtShort(mon)} – ${fmtShort(sun)}`;
  })();

  const barColor = v => v===null?'#e5e7eb':v>=4?'#10b981':v>=3?'#f59e0b':'#ef4444';

  return (
    <div className="tr-root">

      {/* Summary */}
      <div className="ow-card tr-summary">
        <div className="tr-stat"><span className="tr-stat-val">{overall?.toFixed(1)??'—'}<small>/5</small></span><span className="tr-stat-lbl">avg rating</span></div>
        <div className="tr-vdivider"/>
        <div className="tr-stat"><span className="tr-stat-val">{total}</span><span className="tr-stat-lbl">responses</span></div>
        {change!==null&&(<><div className="tr-vdivider"/><div className="tr-stat"><span className={`tr-stat-val tr-chg ${change>0.05?'tr-chg--up':change<-0.05?'tr-chg--down':'tr-chg--flat'}`}>{changeSign}{change.toFixed(1)}</span><span className="tr-stat-lbl">vs prev {period}</span></div></>)}
      </div>

      {/* Key Insights */}
      <div className="ow-card tr-card">
        <p className="tr-section-title">💡 Key Insights</p>
        {insightsLoading?(<div className="tr-dots"><span className="ow-loading-dot"/><span className="ow-loading-dot"/><span className="ow-loading-dot"/></div>)
          :insights?.length?(<ul className="tr-insight-list">{insights.map((ins,i)=><li key={i}>{ins}</li>)}</ul>)
          :(<p className="tr-empty-note">Not enough data for insights yet.</p>)}
      </div>

      {/* Rating Trend */}
      <div className="ow-card tr-card">
        <div className="tr-trend-header">
          <p className="tr-section-title" style={{margin:0}}>📈 Rating Trend</p>
          <span className="tr-trend-sub">{tab==='week'?`This week · ${weekSubtitle}`:'Last 30 days · by calendar week'}</span>
        </div>

        {/* 7-day bar chart */}
        {tab==='week'&&dayStrip&&(
          <div className="tr-chart">
            {dayStrip.map(({label,dateNum,avg:colAvg,count},i)=>{
              const h=colAvg!==null?Math.max(4,Math.round((colAvg/5)*44)):4;
              return(
                <div key={i} className="tr-chart-col">
                  <span className="tr-chart-val">{colAvg!==null?colAvg.toFixed(1):''}</span>
                  <div className="tr-bar-wrap"><div className="tr-bar" style={{height:`${h}px`,background:barColor(colAvg)}}/></div>
                  <span className="tr-chart-lbl">{label}</span>
                  <span className="tr-chart-lbl" style={{color:'#c4c4d0'}}>{dateNum}</span>
                  {count>0&&<span className="tr-chart-cnt">{count}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* 30-day calendar weeks chart */}
        {tab==='month'&&calWeeks&&(
          <div className="tr-cal-chart">
            {calWeeks.map(({label,avg:wAvg,count},i)=>{
              const h=wAvg!==null?Math.max(4,Math.round((wAvg/5)*44)):4;
              return(
                <div key={i} className="tr-cal-col">
                  <span className="tr-chart-val">{wAvg!==null?wAvg.toFixed(1):''}</span>
                  <div className="tr-bar-wrap"><div className="tr-bar" style={{height:`${h}px`,background:barColor(wAvg)}}/></div>
                  <span className="tr-cal-lbl">{label}</span>
                  {count>0&&<span className="tr-chart-cnt">{count} resp</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Problem Items */}
      {problemItems.length>0?(
        <div className="ow-card tr-card tr-problems">
          <p className="tr-section-title">⚠️ Problem Items <span className="tr-section-count">({problemItems.length})</span>
            {tab==='month'&&currRows.length>0&&<span className="tr-section-sub"> · based on current week</span>}
          </p>
          {problemItems.map(({cat,avg:catAvg,trend,worstLabel,count,isWorsening,insightTag})=>{
            const bullets=getActionBullets(worstLabel);
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
      ):(
        <div className="ow-card tr-all-good">✅ No persistent issues this {period}</div>
      )}

    </div>
  );
}
