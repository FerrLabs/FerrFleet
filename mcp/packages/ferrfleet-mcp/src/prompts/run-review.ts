import { z } from 'zod';
import type { McpServer } from '@ferrlabs/mcp-core';

export function registerRunReviewPrompt(server: McpServer) {
  server.prompt(
    'review_run',
    'Read a FerrFleet run and summarise what it did, what it changed, and whether it should be trusted.',
    {
      run_id: z.string().min(1).describe('Run id'),
    },
    ({ run_id }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Review FerrFleet run \`${run_id}\`.`,
              '',
              'Call `get_run` first for status and timing. Only pull `get_run_transcript` once that confirms the run is worth reading: a long transcript is capped and arrives truncated.',
              '',
              'Answer in this order: what the agent was asked to do, what it actually did, what it changed outside its own workspace, and where it failed or guessed.',
              '',
              'Call out anything the transcript shows the agent asserting without checking, and anything it retried more than twice. Those are the two places a run tends to go wrong quietly.',
              '',
              'End with whether the result can be taken at face value, needs a spot check, or should be discarded. Say which, and why.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
