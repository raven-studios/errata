import Anthropic from '@anthropic-ai/sdk';
import { ReviewSchema, meetsThreshold, type Review, type Severity } from './findings.js';

export interface ReviewOptions {
  diffContext: string;
  rules: string;
  stack: string;
  hasTests: boolean;
  minSeverity: Severity;
  apiKey: string;
}

export async function review(opts: ReviewOptions): Promise<Review> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const userMessage = `Review this pull request diff.

Runtime context:
- stack: ${opts.stack}
- has_tests: ${opts.hasTests}
- min_severity: ${opts.minSeverity}

Diff:

${opts.diffContext}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: opts.rules,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const parsed = extractAndParseJson(text);
  const result = ReviewSchema.parse(parsed);

  // Enforce min_severity client-side as a safety net
  result.findings = result.findings.filter(f => meetsThreshold(f, opts.minSeverity));

  return result;
}

function extractAndParseJson(text: string): unknown {
  // Try bare JSON first
  try {
    return JSON.parse(text.trim());
  } catch {
    // Strip markdown fences if present
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1].trim());

    // Last resort: grab the outermost { } block
    const braces = text.match(/\{[\s\S]*\}/);
    if (braces) return JSON.parse(braces[0]);

    throw new Error('Could not extract JSON from review response');
  }
}
