'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const RATING_FIELDS = [
  { key: 'taste',       label: 'Taste' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'quantity',    label: 'Quantity' },
  { key: 'hygiene',     label: 'Hygiene' },
  { key: 'experience',  label: 'Overall Experience' },
];

const defaultRatings = {
  taste: '',
  temperature: '',
  quantity: '',
  hygiene: '',
  experience: '',
};

export default function FeedbackPage() {
  const [mealType, setMealType]   = useState('');
  const [ratings, setRatings]     = useState(defaultRatings);
  const [comment, setComment]     = useState('');
  const [loading, setLoading]     = useState(false);

  function handleRatingChange(key, value) {
    setRatings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from('feedback').insert([
      {
        cafe_id:     null,          // will be wired up when cafes table is ready
        meal_type:   mealType,
        taste:       Number(ratings.taste),
        temperature: Number(ratings.temperature),
        quantity:    Number(ratings.quantity),
        hygiene:     Number(ratings.hygiene),
        experience:  Number(ratings.experience),
        comment,
      },
    ]);

    setLoading(false);

    if (error) {
      alert(error.message)
      console.log(error)
    } else {
      alert('Submitted');
      setMealType('');
      setRatings(defaultRatings);
      setComment('');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>RateMyMeal – Feedback</h1>

      {/* Meal Type */}
      <label>
        Meal Type
        <select
          id="meal-type-select"
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          required
        >
          <option value="" disabled>Select meal type…</option>
          {MEAL_TYPES.map((m) => (
            <option key={m} value={m.toLowerCase()}>{m}</option>
          ))}
        </select>
      </label>

      {/* Dynamic rating inputs */}
      {RATING_FIELDS.map(({ key, label }) => (
        <label key={key}>
          {label} (1 – 5)
          <input
            id={`${key}-input`}
            type="number"
            min="1"
            max="5"
            value={ratings[key]}
            onChange={(e) => handleRatingChange(key, e.target.value)}
            required
          />
        </label>
      ))}

      {/* Comment */}
      <label>
        Comment
        <textarea
          id="comment-input"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any additional feedback…"
        />
      </label>

      <button id="submit-btn" type="submit" disabled={loading}>
        {loading ? 'Submitting…' : 'Submit Feedback'}
      </button>
    </form>
  );
}
