import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const body = await req.json();
  const { tab, overallAvg, totalResponses, problemItems, ruleInsights } = body;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ insights: ruleInsights });

  const period   = tab === 'week' ? '7 days' : '30 days';
  const probStr  = (problemItems || [])
    .map(p => `${p.category} (${p.avg}/5, ${p.trend}, issue: "${p.issue}")`)
    .join('; ') || 'none';

  const prompt = `You are a café quality analyst. Write 3-4 short insights for a café owner.
Period: Last ${period}
Overall rating: ${overallAvg}/5 (${totalResponses} responses)
Problem items: ${probStr}
Observations: ${(ruleInsights || []).join('; ')}

Rules:
- Each insight = 1 sentence, max 14 words
- Mention specific food item names
- Be direct and actionable
- Output ONLY a numbered list: 1. 2. 3.
- No intro, no explanation`;

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 220,
      temperature: 0.2,
    });

    const text  = completion.choices[0]?.message?.content ?? '';
    const lines = text
      .split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(l => l.length > 8);

    if (!lines.length) throw new Error('empty');
    return NextResponse.json({ insights: lines.slice(0, 4) });
  } catch (err) {
    console.error('[insights]', err?.message);
    return NextResponse.json({ insights: ruleInsights });
  }
}
