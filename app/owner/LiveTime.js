'use client';

import { useState, useEffect } from 'react';

function timeAgo(dateStr) {
  // Append 'Z' to force UTC parsing — Supabase returns ISO strings without timezone suffix
  const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const secs = Math.floor((Date.now() - new Date(utcStr).getTime()) / 1000);
  if (secs < 90)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return 'earlier today';
}

export default function LiveTime({ dateStr, className }) {
  const [label, setLabel] = useState(() => timeAgo(dateStr));

  useEffect(() => {
    // Recalculate immediately on mount (client time may differ from server)
    setLabel(timeAgo(dateStr));

    // Keep updating every 30 seconds
    const id = setInterval(() => setLabel(timeAgo(dateStr)), 30_000);
    return () => clearInterval(id);
  }, [dateStr]);

  return <span className={className}>{label}</span>;
}
