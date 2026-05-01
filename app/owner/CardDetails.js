'use client';

import { useState } from 'react';

function stars(avg) {
  const full  = Math.round(avg);
  const empty = 5 - full;
  return '★'.repeat(Math.max(0, full)) + '☆'.repeat(Math.max(0, empty));
}

export default function CardDetails({ questions, recentAvg }) {
  const [open, setOpen] = useState(false);

  if (!questions?.length) return null;

  return (
    <div className="ow-details">
      <button
        className="ow-details-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Details ▲' : 'Details ▼'}
      </button>

      {open && (
        <div className="ow-details-body">
          <p className="ow-details-divider">— Details —</p>

          <div className="ow-details-rows">
            {questions.map(({ label, avg: a }, i) => (
              <div key={label} className="ow-details-row">
                <span className="ow-details-label">{label}</span>
                <span className={`ow-details-score ${i === 0 ? 'ow-details-score--worst' : ''}`}>
                  {a.toFixed(1)}{i === 0 ? ' ↓' : ''}
                </span>
              </div>
            ))}
          </div>

          {recentAvg != null && (
            <p className="ow-details-recent">
              👉 Recent: <span className="ow-details-stars">{stars(recentAvg)}</span> ({recentAvg.toFixed(1)})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
