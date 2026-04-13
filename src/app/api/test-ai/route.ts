import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';

/**
 * GET /api/test-ai — verify AI Gateway works on Vercel.
 * Tests text generation and vision analysis.
 * Delete this route after confirming it works.
 */
export async function GET(): Promise<Response> {
  const results: Record<string, unknown> = {};

  // Test 1: Text generation
  try {
    const t = await generateText({
      model: gateway('anthropic/claude-sonnet-4.6'),
      prompt: 'Say exactly: AI Gateway is working. Nothing else.',
    });
    results.text = { status: 'ok', response: t.text };
  } catch (e) {
    results.text = { status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }

  // Test 2: Vision — analyze a YouTube football thumbnail
  try {
    const frameRes = await fetch('https://img.youtube.com/vi/2fHVKtNWKOg/hqdefault.jpg');
    const buf = Buffer.from(await frameRes.arrayBuffer());
    const b64 = buf.toString('base64');

    const schema = z.object({
      description: z.string(),
      isFootball: z.boolean(),
      confidence: z.number().min(0).max(1),
    });

    const v = await generateText({
      model: gateway('anthropic/claude-sonnet-4.6'),
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: `data:image/jpeg;base64,${b64}` },
          { type: 'text', text: 'Is this a football game? Describe what you see in one sentence.' },
        ],
      }],
      output: Output.object({ schema }),
    });
    results.vision = { status: 'ok', response: v.output };
  } catch (e) {
    results.vision = { status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }

  return Response.json(results);
}
