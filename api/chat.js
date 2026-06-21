// /api/chat.js
//
// This runs on Vercel's servers, NOT in the user's browser.
// The Groq API key lives in a Vercel "Environment Variable" called GROQ_API_KEY.
// It never gets sent to the browser, never appears in page source, and is not
// visible to anyone using the site — only to you, in your Vercel dashboard.
//
// The browser calls THIS endpoint (e.g. https://your-site.vercel.app/api/chat)
// instead of calling Groq directly. This function adds the real key and
// forwards the request to Groq, then sends the answer back.

const WINDOW_MS = 60 * 1000;       // 1 minute window
const MAX_REQUESTS = 15;            // max requests per IP per window
const hits = new Map();             // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_REQUESTS;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing GROQ_API_KEY. Set it in Vercel project settings.'
    });
  }

  try {
    const { messages, model, temperature, max_tokens, response_format } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Request body must include a "messages" array.' });
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 2048,
        ...(response_format ? { response_format } : {}),
      }),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      return res.status(groqRes.status).json({
        error: data.error?.message || 'Groq API request failed.',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('chat.js error:', err);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
        }

