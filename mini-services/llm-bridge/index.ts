/**
 * Autoclip LLM Bridge — scores transcript segments for viral potential.
 * Python engine calls POST /analyze; response is structured JSON.
 */
const PORT = 8002;

let zai: any = null;
async function getClient() {
  if (!zai) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zai = await ZAI.create();
  }
  return zai;
}

const SYSTEM_PROMPT = `You are a short-form video editor who has produced viral clips for YouTube Shorts, TikTok and Reels.
You will receive a JSON array of transcript sentences from one source video, each with id, start, end and text.
Pick the strongest standalone moments ("clips") that would perform as short vertical videos.

Selection criteria (in order):
1. Strong hook in the first 1-2 sentences (bold claim, question, surprising fact, emotional peak).
2. Self-contained idea: a viewer with zero context still understands and cares.
3. Payoff / punchline / actionable insight inside the segment.
4. Emotional charge: humor, outrage, inspiration, curiosity, controversy.
5. No mid-word or mid-thought cuts — always start at a sentence boundary and end after a complete thought.

Rules:
- Each clip must be between minLen and maxLen seconds (provided in the request).
- Clips may combine consecutive sentences; never overlap two clips.
- Output at most maxClips clips, ranked best-first.
- For each clip write a "title": punchy, <= 60 characters, no quotes, no clickbait symbols like !!! or ALL CAPS.
- "score": 0-100 estimate of viral potential.
- "reason": one short sentence explaining why this moment works.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{"clips":[{"start":<number seconds>,"end":<number seconds>,"title":"...","score":<int>,"reason":"..."}]}`;

type Sentence = { id: number; start: number; end: number; text: string };
type AnalyzeBody = {
  sentences: Sentence[];
  duration: number;
  minLen: number;
  maxLen: number;
  maxClips: number;
  videoTitle?: string;
};

function sanitize(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 900);
}

async function analyze(body: AnalyzeBody) {
  const { sentences, duration, minLen, maxLen, maxClips, videoTitle } = body;
  const zai = await getClient();
  const userPayload = {
    videoTitle: videoTitle ?? 'unknown',
    duration,
    constraints: { minLen, maxLen, maxClips },
    sentences: sentences.map((s) => ({ id: s.id, start: s.start, end: s.end, text: sanitize(s.text) })),
  };
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    thinking: { type: 'disabled' },
    temperature: 0.4,
    max_tokens: 3000,
  });
  const content: string = completion?.choices?.[0]?.message?.content ?? '';
  // Strip markdown code fences (LLMs often wrap JSON in ```json ... ```)
  const stripped = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in LLM response');
  const parsed = JSON.parse(stripped.slice(start, end + 1));
  if (!parsed.clips || !Array.isArray(parsed.clips)) throw new Error('missing clips array');
  return parsed;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, uptime: process.uptime() });
    }
    if (req.method === 'POST' && url.pathname === '/analyze') {
      try {
        const body = (await req.json()) as AnalyzeBody;
        if (!body?.sentences?.length) {
          return Response.json({ error: 'sentences required' }, { status: 400 });
        }
        const result = await analyze(body);
        return Response.json({ ok: true, ...result });
      } catch (err: any) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  },
});

console.log(`[llm-bridge] listening on :${PORT}`);
export default server;
