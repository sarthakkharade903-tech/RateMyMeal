'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const RATING_FIELDS = [
  { key: 'taste',       label: '🍽️  Taste' },
  { key: 'temperature', label: '🌡️  Temperature' },
  { key: 'quantity',    label: '⚖️  Quantity' },
  { key: 'hygiene',     label: '🧹  Hygiene' },
  { key: 'experience',  label: '✨  Experience' },
];

const EMOJIS = ['😡', '😕', '😐', '🙂', '😍'];

const defaultRatings = {
  taste: null, temperature: null,
  quantity: null, hygiene: null, experience: null,
};

// ── today's stats after submit ────────────────────────────────
async function fetchTodayStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('feedback')
    .select('taste, temperature, quantity, hygiene, experience')
    .gte('created_at', startOfDay.toISOString());

  if (error || !data?.length) return null;

  const allVals = data.flatMap((r) =>
    [r.taste, r.temperature, r.quantity, r.hygiene, r.experience].filter(
      (v) => v != null
    )
  );
  const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
  return { count: data.length, avg: Math.round(avg * 10) / 10 };
}

// ── star display ───────────────────────────────────────────────
function Stars({ value }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        if (i < full)              return <span key={i} className="star star--full">★</span>;
        if (i === full && half)    return <span key={i} className="star star--half">★</span>;
        return                            <span key={i} className="star star--empty">★</span>;
      })}
    </span>
  );
}

// ── thank-you screen ──────────────────────────────────────────
function ThankYouScreen({ stats, onDone }) {
  return (
    <div className="fb-shell">
      <div className="fb-card ty-card">
        <div className="ty-confetti" aria-hidden>🎉</div>
        <div className="ty-circle">✓</div>
        <h1 className="ty-title">Thank you!</h1>
        <p className="ty-sub">Your voice makes every meal better 🙏</p>

        {stats ? (
          <div className="ty-stats">
            <div className="ty-stat-box">
              <Stars value={stats.avg} />
              <p className="ty-stat-label">
                Today's rating: <strong>{stats.avg} / 5</strong>
              </p>
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

        <button
          id="done-btn"
          className="fb-submit fb-submit--done ty-done"
          onClick={onDone}
        >
          Done 👍
        </button>
      </div>
    </div>
  );
}

// ── main form ─────────────────────────────────────────────────
export default function FeedbackPage() {
  const [mealType, setMealType]     = useState(null);
  const [ratings, setRatings]       = useState(defaultRatings);
  const [comment, setComment]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [todayStats, setTodayStats] = useState(null);

  const allRated  = RATING_FIELDS.every(({ key }) => ratings[key] !== null);
  const canSubmit = mealType && allRated && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);

    const { error } = await supabase.from('feedback').insert([
      {
        cafe_id:     null,
        meal_type:   mealType,
        taste:       ratings.taste,
        temperature: ratings.temperature,
        quantity:    ratings.quantity,
        hygiene:     ratings.hygiene,
        experience:  ratings.experience,
        comment:     comment || null,
      },
    ]);

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
    setMealType(null);
    setRatings(defaultRatings);
    setComment('');
    setSubmitted(false);
    setTodayStats(null);
  }

  if (submitted) {
    return <ThankYouScreen stats={todayStats} onDone={handleDone} />;
  }

  return (
    <div className="fb-shell">
      <div className="fb-card">

        {/* Header */}
        <div className="fb-header">
          <span className="fb-logo">🍴</span>
          <h1>How was your meal?</h1>
          <p>Tap to rate. Takes under 5 seconds.</p>
        </div>

        {/* Meal Type */}
        <div className="fb-section">
          <p className="fb-label">Meal Type</p>
          <div className="pill-row">
            {MEAL_TYPES.map((m) => (
              <button
                key={m}
                id={`meal-${m.toLowerCase()}`}
                type="button"
                className={`pill ${mealType === m.toLowerCase() ? 'pill--active' : ''}`}
                onClick={() => setMealType(m.toLowerCase())}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Rating Fields */}
        {RATING_FIELDS.map(({ key, label }) => (
          <div className="fb-section" key={key}>
            <p className="fb-label">{label}</p>
            <div className="emoji-row">
              {EMOJIS.map((emoji, idx) => {
                const value    = idx + 1;
                const selected = ratings[key] === value;
                return (
                  <button
                    key={value}
                    id={`${key}-${value}`}
                    type="button"
                    className={`emoji-btn ${selected ? 'emoji-btn--active' : ''}`}
                    onClick={() =>
                      setRatings((prev) => ({ ...prev, [key]: value }))
                    }
                    aria-label={`${label} ${value} out of 5`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Optional Comment */}
        <div className="fb-section">
          <p className="fb-label">
            Any comments? <span className="fb-optional">(optional)</span>
          </p>
          <textarea
            id="comment-input"
            className="fb-textarea"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us more…"
          />
        </div>

        {/* Submit */}
        <button
          id="submit-btn"
          type="button"
          className={`fb-submit ${canSubmit ? 'fb-submit--ready' : ''}`}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading
            ? 'Submitting…'
            : canSubmit
            ? 'Submit Feedback 🚀'
            : 'Select all ratings to continue'}
        </button>

      </div>
    </div>
  );
}
