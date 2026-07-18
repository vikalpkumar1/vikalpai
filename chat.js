// /api/chat.js — Vercel serverless function
// Proxies chat requests from the Vikalp AI frontend to Groq (api.groq.com).
// Keeps GROQ_API_KEY on the server — the browser never sees it.
//
// Setup on Vercel:
//   1. Project Settings → Environment Variables → add GROQ_API_KEY = <your Groq console key>
//   2. Put this file at api/chat.js in your project root (same repo as the HTML file)
//   3. Redeploy
//
// Note: the model IDs this app sends (openai/gpt-oss-120b, openai/gpt-oss-20b,
// qwen/qwen3.6-27b) are Groq's current models as of July 2026 — Groq retired the old
// llama-3.3-70b-versatile / llama-3.1-8b-instant models in June 2026, so make sure
// your key has access to the newer ones (it should, by default).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY is not set on the server. Add it in Vercel → Project Settings → Environment Variables.' });
    return;
  }

  const { model, messages, stream } = req.body || {};
  if (!model || !messages) {
    res.status(400).json({ error: 'Missing model or messages in request body' });
    return;
  }

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: !!stream,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!stream) {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
      return;
    }

    // Streaming: pipe Groq's SSE bytes straight through to the browser.
    if (!upstream.ok || !upstream.body) {
      const data = await upstream.json().catch(() => ({ error: 'Upstream error' }));
      res.status(upstream.status || 500).json(data);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Server error contacting Groq' });
    } else {
      res.end();
    }
  }
}
