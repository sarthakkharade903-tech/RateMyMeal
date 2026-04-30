'use client';

import { useState } from 'react';
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

function ThankYouScreen({ stats, onDone }) {
  return (
    <div className="fb-shell">
      <div className="fb-card ty-card">
        <div className="ty-confetti">🎉</div>
        <div className="ty-circle">✓</div>
        <h1 className="ty-title">Thank you!</h1>
        <p className="ty-sub">Your voice makes every meal better 🙏</p>
        {stats ? (
          <div className="ty-stats">
            <div className="ty-stat-box">
              <Stars value={stats.avg} />
              <p className="ty-stat-label">Today's rating: <strong>{stats.avg} / 5</strong></p>
            </div>
            <div className="ty-divider" />
            <p className="ty-people">
              🙌 You're among <strong>{stats.count}</strong>{' '}
              {stats.count === 1 ? 'person' : 'people'} who rated today
            </p>
            <p className="ty-msg">
              {stats.avg >= 4
                ? "Glad you're enjoying the food! Keep the feedback coming 🌟"
                : 'Your feedback is helping the team improve — we appreciate it!'}
            </p>
          </div>
        ) : (
          <p className="ty-people">Your feedback has been recorded 📝</p>
        )}
        <button id="done-btn" className="fb-submit fb-submit--done ty-done" onClick={onDone}>
          Done 👍
        </button>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const [category, setCategory]     = useState(null);
  const [q1, setQ1]                 = useState(null);
  const [q2, setQ2]                 = useState(null);
  const [q3, setQ3]                 = useState(null);
  const [comment, setComment]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [todayStats, setTodayStats] = useState(null);

  const questions = category ? CATEGORY_QUESTIONS[category] : [];
  const ratings   = [q1, q2, q3];
  const setters   = [setQ1, setQ2, setQ3];
  const canSubmit = category && q1 !== null && q2 !== null && q3 !== null && !loading;

  function handleCategorySelect(key) {
    setCategory(key);
    setQ1(null); setQ2(null); setQ3(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    const { error } = await supabase.from('feedback').insert([{
      cafe_id: null, category,
      q1, q1_label: questions[0],
      q2, q2_label: questions[1],
      q3, q3_label: questions[2],
      comment: comment || null,
    }]);
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

  function handleDone() {
    setCategory(null);
    setQ1(null); setQ2(null); setQ3(null);
    setComment(''); setSubmitted(false); setTodayStats(null);
  }

  if (submitted) return <ThankYouScreen stats={todayStats} onDone={handleDone} />;

  return (
    <div className="fb-shell">
      <div className="fb-card">
        <div className="fb-header">
          <span className="fb-logo">🍴</span>
          <h1>How was your order?</h1>
          <p>Pick an item and rate it in seconds.</p>
        </div>

        {/* Category grid */}
        <div className="fb-section">
          <p className="fb-label">What did you have?</p>
          <div className="cat-grid">
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                id={`cat-${key}`}
                type="button"
                className={`cat-btn ${category === key ? 'cat-btn--active' : ''}`}
                onClick={() => handleCategorySelect(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic questions */}
        {category && (
          <>
            <div className="fb-section-divider" />
            {questions.map((qLabel, idx) => (
              <div className="fb-section" key={idx}>
                <p className="fb-label">{qLabel}</p>
                <div className="emoji-row">
                  {EMOJIS.map((emoji, ei) => {
                    const val = ei + 1;
                    return (
                      <button
                        key={val}
                        id={`q${idx + 1}-${val}`}
                        type="button"
                        className={`emoji-btn ${ratings[idx] === val ? 'emoji-btn--active' : ''}`}
                        onClick={() => setters[idx](val)}
                        aria-label={`${qLabel} ${val} out of 5`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="fb-section">
              <p className="fb-label">Any comments? <span className="fb-optional">(optional)</span></p>
              <textarea
                id="comment-input"
                className="fb-textarea"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more…"
              />
            </div>
          </>
        )}

        <button
          id="submit-btn"
          type="button"
          className={`fb-submit ${canSubmit ? 'fb-submit--ready' : ''}`}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? 'Submitting…'
            : !category ? 'Select an item above to start'
            : canSubmit ? 'Submit Feedback 🚀'
            : 'Rate all 3 questions to continue'}
        </button>
      </div>
    </div>
  );
}
