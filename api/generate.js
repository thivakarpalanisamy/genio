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

  const prompt = `You are a world-class educational content creator. Generate comprehensive, engaging educational materials for the topic or content below.
Your response must be ONLY valid JSON — no preamble, no markdown fences, no explanation, nothing before or after the JSON object.

Topic/Content: ${topic.trim()}

Return exactly this JSON structure:
{
  "title": "Clear, engaging title for this topic",
  "overview": "Write 3 well-developed paragraphs explaining this topic for a curious learner. Make it vivid, clear, and engaging. Separate paragraphs with \\n\\n.",
  "keyPoints": [
    "Specific, insightful key point as a complete sentence",
    "Another distinct key insight",
    "Another distinct key insight",
    "Another distinct key insight",
    "Another distinct key insight",
    "A final synthesizing insight"
  ],
  "flashcards": [
    {"front": "A meaningful question or term that tests understanding", "back": "A clear, accurate answer or definition"},
    {"front": "...", "back": "..."},
    {"front": "...", "back": "..."},
    {"front": "...", "back": "..."},
    {"front": "...", "back": "..."}
  ],
  "quiz": [
    {"question": "A well-crafted multiple choice question", "options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"], "correct": 0, "explanation": "Clear explanation of why this answer is correct"},
    {"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": 1, "explanation": "..."},
    {"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": 2, "explanation": "..."},
    {"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": 3, "explanation": "..."}
  ]
}`;

  // Model priority list — tries each in order if one fails
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
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
          })
        }
      );

      const data = await response.json();

      // If model not found or quota hit, try next
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
      console.log(`Success with model: ${model}`);
      return res.status(200).json(parsed);

    } catch (err) {
      lastError = err.message;
      console.warn(`Model ${model} threw:`, err.message);
      continue;
    }
  }

  // All models failed
  console.error('All models failed. Last error:', lastError);
  return res.status(500).json({ error: 'Content generation failed. Please try again.' });
};
