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
  taste: null,
  temperature: null,
  quantity: null,
  hygiene: null,
  experience: null,
};

export default function FeedbackPage() {
  const [mealType, setMealType] = useState(null);
  const [ratings, setRatings]   = useState(defaultRatings);
  const [comment, setComment]   = useState('');
  const [loading, setLoading]   = useState(false);

  const allRated = RATING_FIELDS.every(({ key }) => ratings[key] !== null);
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

    setLoading(false);

    if (error) {
      alert('Error submitting');
      console.error(error);
    } else {
      alert('Submitted! Thank you 🙌');
      setMealType(null);
      setRatings(defaultRatings);
      setComment('');
    }
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
                const value = idx + 1;
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

        {/* Submit */}
        <button
          id="submit-btn"
          type="button"
          className={`fb-submit ${canSubmit ? 'fb-submit--ready' : ''}`}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? 'Submitting…' : canSubmit ? 'Submit Feedback 🚀' : 'Select all ratings to continue'}
        </button>

      </div>
    </div>
  );
}
