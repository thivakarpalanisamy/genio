module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic } = req.body || {};
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Topic is required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  const prompt = `You are Genio — a world-class AI educational designer and instructional writer.

A user has given you this input:
"""
${topic.trim()}
"""

STEP 1 — DETECT INTENT:
Read the input carefully. Classify it as one of:
- "script": User wants a teaching script, lesson plan, demo class, presentation script, or mentions timestamps/tone/pacing/self-introduction/demo
- "study": User wants to learn or study a topic (flashcards, quiz, overview)
- "both": User wants both a script AND study materials

STEP 2 — GENERATE OUTPUT:
Respond ONLY with valid JSON. No preamble, no markdown fences, nothing outside the JSON.

Always include these base fields:
- title: clear engaging title
- type: one of "script", "study", "both"
- overview: 3 vivid paragraphs separated by \\n\\n
- keyPoints: array of 6 complete-sentence insights
- flashcards: array of 5 objects with "front" and "back"
- quiz: array of 4 objects, each with "question", "options" (array of 4 strings starting with A) B) C) D)), "correct" (0-indexed integer), "explanation"

If type is "script" or "both", also include:
- script: array of segment objects, each with:
  - timestamp: e.g. "0:00 – 1:30"
  - segment: name of this section e.g. "Self Introduction", "Hook", "Concept Explanation", "Solved Problem 1", "Q&A Wrap-up"
  - tone: e.g. "warm and friendly", "energetic", "calm and clear", "encouraging"
  - pacing: one of "slow", "medium", "fast"
  - content: the full word-for-word script for this segment. Be rich, natural, conversational. Include real-life examples, analogies, solved problems inline where appropriate. Write exactly as a teacher would speak — not bullet points, full sentences and natural speech. Include [PAUSE], [WRITE ON BOARD], [SMILE], [LOOK AROUND ROOM] stage directions in brackets where helpful.

Make the script genuinely useful — timestamps that are realistic, tone that matches the segment purpose, pacing that helps the teacher deliver well.

Return the complete JSON now:`;

  const models = [
    'gemini-3.1-flash-lite',
    'gemini-3.0-flash-lite',
    'gemini-2.5-flash',
    'gemma-3-27b-it'
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.75, maxOutputTokens: 4096 }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = data.error?.message || `Model ${model} failed`;
        console.warn(`Model ${model} failed:`, lastError);
        continue;
      }

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON in response');

      const parsed = JSON.parse(raw.slice(start, end + 1));
      console.log(`Success with model: ${model}, type: ${parsed.type}`);
      return res.status(200).json(parsed);

    } catch (err) {
      lastError = err.message;
      console.warn(`Model ${model} threw:`, err.message);
      continue;
    }
  }

  console.error('All models failed. Last error:', lastError);
  return res.status(500).json({ error: 'Content generation failed. Please try again.' });
};
