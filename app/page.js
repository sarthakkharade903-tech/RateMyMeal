'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

const CATEGORIES = [
  { key: 'pizza',         label: '🍕 Pizza'         },
  { key: 'sandwich',      label: '🥪 Sandwich'      },
  { key: 'burger',        label: '🍔 Burger'        },
  { key: 'maggi',         label: '🍜 Maggi'         },
  { key: 'pasta',         label: '🍝 Pasta'         },
  { key: 'fries',         label: '🍟 Fries'         },
  { key: 'garlic_bread',  label: '🥖 Garlic Bread'  },
  { key: 'shakes',        label: '🥤 Shakes'        },
  { key: 'cold_coffee',   label: '🧋 Cold Coffee'   },
  { key: 'hot_beverages', label: '☕ Hot Beverages' },
];

const CATEGORY_QUESTIONS = {
  pizza:         ['Taste', 'Hot enough', 'Toppings quality'],
  sandwich:      ['Taste', 'Crispy / grilled', 'Filling enough'],
  burger:        ['Taste', 'Patty quality', 'Well assembled'],
  maggi:         ['Taste', 'Properly cooked', 'Quantity enough'],
  pasta:         ['Taste', 'Cooked properly', 'Sauce quality'],
  fries:         ['Crispy', 'Fresh', 'Quantity enough'],
  garlic_bread:  ['Taste', 'Crispy', 'Garlic / cheese flavor'],
  shakes:        ['Taste', 'Thick & creamy', 'Cold enough'],
  cold_coffee:   ['Taste', 'Cold enough', 'Consistency'],
  hot_beverages: ['Taste', 'Hot enough', 'Properly made'],
};

const EMOJIS = ['😡', '😕', '😐', '🙂', '😍'];

async function fetchTodayStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('feedback')
    .select('q1, q2, q3')
    .gte('created_at', startOfDay.toISOString())
    .not('q1', 'is', null);
  if (error || !data?.length) return null;
  const allVals = data.flatMap((r) => [r.q1, r.q2, r.q3].filter((v) => v != null));
  const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
  return { count: data.length, avg: Math.round(avg * 10) / 10 };
}

function Stars({ value }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="stars">
      {Array.from({ length: 5 }, (_, i) => {
        if (i < full)           return <span key={i} className="star star--full">★</span>;
        if (i === full && half) return <span key={i} className="star star--half">★</span>;
        return                         <span key={i} className="star star--empty">★</span>;
      })}
    </span>
  );
}

function ThankYouScreen({ stats }) {
  return (
    <div className="fb-shell ty-shell">
      <div className="ty-card">

        {/* Checkmark circle — pops in */}
        <div className="ty-check-wrap">
          <div className="ty-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"
                 strokeLinecap="round" strokeLinejoin="round" width="36" height="36">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        {/* Title — fades in */}
        <h1 className="ty-title ty-fade ty-fade--1">
          Thank you!
        </h1>
        <p className="ty-sub ty-fade ty-fade--2">
          Your feedback helps improve every meal 🙌
        </p>

        {/* Stats block — fades in */}
        {stats ? (
          <div className="ty-stats ty-fade ty-fade--3">
            <div className="ty-avg-row">
              <span className="ty-avg-num">{stats.avg}</span>
              <span className="ty-avg-denom">&thinsp;/ 5</span>
            </div>
            <Stars value={stats.avg} />
            <p className="ty-avg-label">Today's average rating</p>

            <div className="ty-divider" />

            <p className="ty-people">
              🙌 You're among <strong>{stats.count}</strong>{' '}
              {stats.count === 1 ? 'person' : 'people'} who rated today
            </p>
          </div>
        ) : (
          <p className="ty-people ty-fade ty-fade--3">Your feedback has been recorded 📝</p>
        )}

        {/* Close hint — fades in last */}
        <p className="ty-close-hint ty-fade ty-fade--4">You can close this page</p>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [answers, setAnswers]                       = useState({});
  const [loading, setLoading]                       = useState(false);
  const [submitted, setSubmitted]                   = useState(false);
  const [todayStats, setTodayStats]                 = useState(null);
  const questionsRef                                = useRef(null);

  const allAnswered =
    selectedCategories.length > 0 &&
    selectedCategories.every(
      (cat) => answers[cat]?.q1 != null && answers[cat]?.q2 != null && answers[cat]?.q3 != null
    );
  const canSubmit = allAnswered && !loading;

  function handleCategoryToggle(key) {
    const isSelected = selectedCategories.includes(key);
    if (isSelected) {
      setSelectedCategories((prev) => prev.filter((k) => k !== key));
      setAnswers((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      const wasEmpty = selectedCategories.length === 0;
      setSelectedCategories((prev) => [...prev, key]);
      setAnswers((prev) => ({ ...prev, [key]: { q1: null, q2: null, q3: null } }));
      if (wasEmpty) {
        setTimeout(() => questionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      }
    }
  }

  function setAnswer(cat, field, val) {
    setAnswers((prev) => ({ ...prev, [cat]: { ...prev[cat], [field]: val } }));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);

    const rows = selectedCategories.map((cat, idx) => {
      const qs  = CATEGORY_QUESTIONS[cat];
      const ans = answers[cat];
      return {
        cafe_id: null, category: cat,
        q1: ans.q1, q1_label: qs[0],
        q2: ans.q2, q2_label: qs[1],
        q3: ans.q3, q3_label: qs[2],
      };
    });

    const { error } = await supabase.from('feedback').insert(rows);
    if (error) {
      setLoading(false);
      alert('Error submitting');
      console.error(error);
      return;
    }
    const stats = await fetchTodayStats();
    setTodayStats(stats);
    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) return <ThankYouScreen stats={todayStats} />;

  return (
    <div className="fb-shell">
      <div className="fb-card">
        <div className="fb-header">
          <span className="fb-logo">🍴</span>
          <h1>How was your order?</h1>
          <p>Select all items you had and rate them.</p>
        </div>

        {/* Category multi-select */}
        <div className="fb-section">
          <p className="fb-label">
            What did you have?{' '}
            {selectedCategories.length > 0 && (
              <span className="fb-badge-count">{selectedCategories.length} selected</span>
            )}
          </p>
          <div className="cat-grid">
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                id={`cat-${key}`}
                type="button"
                className={`cat-btn ${selectedCategories.includes(key) ? 'cat-btn--active' : ''}`}
                onClick={() => handleCategoryToggle(key)}
              >
                {selectedCategories.includes(key) && <span className="cat-check">✓ </span>}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Per-category questions */}
        {selectedCategories.length > 0 && (
          <div ref={questionsRef}>
            <div className="fb-section-divider" />
            {selectedCategories.map((cat) => {
              const qs  = CATEGORY_QUESTIONS[cat];
              const ans = answers[cat] || {};
              const catLabel = CATEGORIES.find((c) => c.key === cat)?.label;
              return (
                <div key={cat} className="fb-cat-block">
                  <p className="fb-cat-heading">{catLabel}</p>
                  {qs.map((qLabel, idx) => {
                    const field   = `q${idx + 1}`;
                    const current = ans[field];
                    return (
                      <div className="fb-section" key={idx}>
                        <p className="fb-label">{qLabel}</p>
                        <div className="emoji-row">
                          {EMOJIS.map((emoji, ei) => {
                            const val = ei + 1;
                            return (
                              <button
                                key={val}
                                id={`${cat}-${field}-${val}`}
                                type="button"
                                className={`emoji-btn ${current === val ? 'emoji-btn--active' : ''}`}
                                onClick={() => setAnswer(cat, field, val)}
                                aria-label={`${qLabel} ${val} out of 5`}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

          </div>
        )}

        <button
          id="submit-btn"
          type="button"
          className={`fb-submit ${canSubmit ? 'fb-submit--ready' : ''}`}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? 'Submitting…'
            : selectedCategories.length === 0 ? 'Select items above to start'
            : canSubmit ? `Submit ${selectedCategories.length > 1 ? `${selectedCategories.length} ratings` : 'Feedback'} 🚀`
            : 'Answer all questions to continue'}
        </button>
      </div>
    </div>
  );
}
