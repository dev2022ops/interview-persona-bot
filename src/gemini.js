export const MODEL = 'gemini-3.8-flash';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Streams a reply from Gemini. `history` is [{ role: 'user' | 'model', text }].
 * Calls onChunk(text) for each piece and resolves with the full reply.
 */
export async function streamChat({ apiKey, system, history, onChunk, signal }) {
  const res = await fetch(`${BASE}/models/${MODEL}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) throw new Error(await describeError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines; keep any partial event in the buffer.
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop();
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const text = extractText(JSON.parse(line.slice(5)));
        if (text) {
          full += text;
          onChunk(text);
        }
      }
    }
  }

  if (!full) throw new Error('Gemini returned an empty response. Try rephrasing your message.');
  return full;
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}

async function describeError(res) {
  let message = '';
  try {
    message = (await res.json())?.error?.message ?? '';
  } catch {
    // Non-JSON error body; fall back to the status below.
  }
  if (res.status === 400 && /api key/i.test(message)) return 'That API key was rejected by Gemini. Check it and try again.';
  if (res.status === 403) return 'This API key does not have access to the Gemini API.';
  if (res.status === 404) return `Model "${MODEL}" was not found for this API key.`;
  if (res.status === 429) return 'Rate limit reached. Wait a moment and try again.';
  return message || `Gemini request failed (${res.status}).`;
}
