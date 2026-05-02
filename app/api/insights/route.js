import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const body = await req.json();
  const { tab, overallAvg, totalResponses, ruleInsights } = body;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ insights: ruleInsights });

  const period = tab === 'week' ? '7-day' : '30-day';

  const prompt = `You are writing insights for a busy café owner checking their ${period} feedback report.

Rewrite the following observations into 3 short, clear, human-readable insights.
Overall: ${overallAvg}/5 across ${totalResponses} responses.

Observations:
${(ruleInsights || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Rules:
- Keep each insight to 1 sentence, max 15 words
- Always include the specific food item name if mentioned
- Sound like a real person, not a report
- Output ONLY a numbered list: 1. 2. 3.
- No intro, no closing line, no explanation`;

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.25,
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
