/*    taskkill /PID 33408 /F       npm run dev     */
/* http://localhost:3000/owner */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const METRICS = ['taste', 'temperature', 'quantity', 'hygiene', 'experience'];
const LABELS = {
  taste:       'Taste',
  temperature: 'Temperature',
  quantity:    'Quantity',
  hygiene:     'Hygiene',
  experience:  'Overall Experience',
};

// ---------- helpers ----------

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcAverages(rows) {
  const result = {};
  for (const m of METRICS) {
    const vals = rows.map((r) => r[m]).filter((v) => v != null);
    result[m] = avg(vals);
  }
  return result;
}

function detectProblems(todayAverages, last5Rows) {
  const problems = [];

  // Rule 1 – any metric average below 3 today
  for (const m of METRICS) {
    const a = todayAverages[m];
    if (a !== null && a < 3) {
      problems.push({
        severity: 'high',
        msg: `${LABELS[m]} is low today (avg ${a.toFixed(1)}/5) — needs immediate attention.`,
      });
    }
  }

  // Rule 2 – significant drop in last 5 entries (most recent vs prev 4)
  if (last5Rows.length >= 3) {
    for (const m of METRICS) {
      const vals = last5Rows.map((r) => r[m]).filter((v) => v != null);
      if (vals.length < 3) continue;
      const mostRecent = vals[0];
      const prevAvg    = avg(vals.slice(1));
      if (prevAvg - mostRecent >= 1.5) {
        problems.push({
          severity: 'medium',
          msg: `Recent drop in ${LABELS[m]}: last entry was ${mostRecent}/5 vs previous avg of ${prevAvg.toFixed(1)}/5.`,
        });
      }
    }
  }

  // Sort: high first, then medium — return top 3
  const order = { high: 0, medium: 1 };
  problems.sort((a, b) => order[a.severity] - order[b.severity]);
  return problems.slice(0, 3);
}

// ---------- data fetching ----------

async function getTodayFeedback() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('feedback')
    .select('taste, temperature, quantity, hygiene, experience, meal_type, created_at')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function getLast5Entries() {
  const { data, error } = await supabase
    .from('feedback')
    .select('taste, temperature, quantity, hygiene, experience, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data ?? [];
}

// ---------- page ----------

export const revalidate = 60; // re-fetch every 60 s on the server

export default async function OwnerPage() {
  let todayRows = [];
  let last5Rows = [];
  let fetchError = null;

  try {
    [todayRows, last5Rows] = await Promise.all([
      getTodayFeedback(),
      getLast5Entries(),
    ]);
  } catch (err) {
    fetchError = err.message ?? 'Unknown error fetching data.';
  }

  const todayAverages = calcAverages(todayRows);
  const problems      = fetchError ? [] : detectProblems(todayAverages, last5Rows);

  // Meal type breakdown
  const mealCounts = {};
  for (const row of todayRows) {
    const mt = row.meal_type ?? 'unknown';
    mealCounts[mt] = (mealCounts[mt] ?? 0) + 1;
  }

  return (
    <main className="owner-page">
      <h1>Owner Dashboard</h1>
      <p className="subtitle">
        {new Date().toLocaleDateString('en-IN', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        })}
      </p>

      {fetchError && (
        <section className="section error-box">
          <p>⚠️ Could not load data: {fetchError}</p>
        </section>
      )}

      {/* --- Summary --- */}
      <section className="section">
        <h2>Today at a Glance</h2>
        <p>Total responses: <strong>{todayRows.length}</strong></p>

        {Object.keys(mealCounts).length > 0 && (
          <p>
            Meal breakdown:{' '}
            {Object.entries(mealCounts)
              .map(([mt, count]) => `${mt} (${count})`)
              .join(', ')}
          </p>
        )}

        {todayRows.length === 0 && !fetchError && (
          <p className="muted">No feedback submitted yet today.</p>
        )}
      </section>

      {/* --- Averages --- */}
      {todayRows.length > 0 && (
        <section className="section">
          <h2>Average Ratings Today</h2>
          <table className="ratings-table">
            <tbody>
              {METRICS.map((m) => {
                const a = todayAverages[m];
                const flag = a !== null && a < 3 ? ' ⚠️' : '';
                return (
                  <tr key={m}>
                    <td>{LABELS[m]}</td>
                    <td>
                      <strong>{a !== null ? `${a.toFixed(1)} / 5${flag}` : 'N/A'}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* --- Problems --- */}
      <section className="section">
        <h2>Issues Detected</h2>
        {problems.length === 0 ? (
          <p className="ok-msg">✅ No major issues found.</p>
        ) : (
          <ol className="problem-list">
            {problems.map((p, i) => (
              <li key={i} className={`problem-item ${p.severity}`}>
                {p.msg}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* --- Last 5 entries raw --- */}
      {last5Rows.length > 0 && (
        <section className="section">
          <h2>Last 5 Entries (for trend check)</h2>
          <table className="ratings-table">
            <thead>
              <tr>
                <th>#</th>
                {METRICS.map((m) => <th key={m}>{LABELS[m]}</th>)}
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {last5Rows.map((row, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {METRICS.map((m) => <td key={m}>{row[m] ?? '—'}</td>)}
                  <td className="muted">
                    {new Date(row.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="footer-note">Auto-refreshes every 60 seconds. Visit this page anytime.</p>
    </main>
  );
}
