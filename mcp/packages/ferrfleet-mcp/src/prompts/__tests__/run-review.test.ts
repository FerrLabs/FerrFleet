import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@ferrlabs/mcp-core';
import { registerRunReviewPrompt } from '../run-review.js';

type PromptHandler = (args: { run_id: string }) => {
  messages: { role: string; content: { type: string; text: string } }[];
};

function registered() {
  const prompt = vi.fn();
  registerRunReviewPrompt({ prompt } as unknown as McpServer);
  const [name, description, schema, handler] = prompt.mock.calls[0] as [
    string,
    string,
    { run_id: { safeParse: (v: unknown) => { success: boolean } } },
    PromptHandler,
  ];
  return { name, description, schema, handler };
}

describe('review_run prompt', () => {
  it('is registered once under the review_run name', () => {
    const { name, description } = registered();
    expect(name).toBe('review_run');
    expect(description).toContain('FerrFleet run');
  });

  it('requires a non-empty run id', () => {
    const { schema } = registered();
    expect(schema.run_id.safeParse('run-1').success).toBe(true);
    expect(schema.run_id.safeParse('').success).toBe(false);
  });

  it('interpolates the run id and orders get_run before the transcript', () => {
    const { handler } = registered();
    const [message] = handler({ run_id: 'run-42' }).messages;
    expect(message.role).toBe('user');
    const text = message.content.text;
    expect(text).toContain('Review FerrFleet run `run-42`.');
    expect(text.indexOf('get_run`')).toBeLessThan(text.indexOf('get_run_transcript'));
  });
});
