import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';
import { reply } from './reply.js';

interface Run {
  id: string;
  agent_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  triggered_by: string;
  created_at: string;
  repo: string | null;
  pr_number: number | null;
  queue_position: number | null;
}

const RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
  'expired',
  'queued',
  'superseded',
] as const;

export function registerRunTools(server: McpServer) {
  server.tool(
    'list_runs',
    'List recent FerrFleet runs for the authenticated org (most recent first).',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max runs to return (default 25)'),
      status: z.enum(RUN_STATUSES).optional().describe('Only runs in this status'),
      org_id: orgIdSchema,
    },
    async ({ limit, status, org_id }) => {
      const token = await getToken();
      const params = new URLSearchParams();
      if (status !== undefined) params.set('status', status);
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.size > 0 ? `?${params}` : '';
      const runs = await fleetRequest<Run[]>(`/runs${qs}`, { token, orgId: org_id });
      return {
        content: [{ type: 'text' as const, text: toToolText(runs) }],
      };
    },
  );

  server.tool(
    'get_run',
    'Get the metadata of a single FerrFleet run (status, timing, agent, trigger). Use get_run_transcript for the captured output.',
    {
      run_id: z.string().min(1).describe('Run id'),
      org_id: orgIdSchema,
    },
    async ({ run_id, org_id }) => {
      const token = await getToken();
      const run = await fleetRequest<Run>(`/runs/${encodeURIComponent(run_id)}`, {
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(run) }],
      };
    },
  );

  server.tool(
    'get_run_transcript',
    'Get the full captured transcript of a FerrFleet run — every event the runner emitted, in order. Heavy for long runs; consider get_run first to confirm the run is interesting before pulling the transcript.',
    {
      run_id: z.string().min(1).describe('Run id'),
      org_id: orgIdSchema,
    },
    async ({ run_id, org_id }) => {
      const token = await getToken();
      const transcript = await fleetRequest<unknown>(
        `/runs/${encodeURIComponent(run_id)}/transcript`,
        { token, orgId: org_id },
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: toToolText(transcript, {
              narrowWith:
                'Use get_run first to confirm the run is worth reading; a long run cannot be returned whole.',
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'retry_run',
    'Retry a failed or timed out FerrFleet run of any capability: creates the next attempt as a new run and returns its id, the id of the run it retries and the attempt number. Refused with 409 while the run or another run of the same commit is in flight, when the run was already retried, and for a run of an external agent. Requires a FerrFleet API that has POST /runs/{id}/retry.',
    {
      run_id: z.string().min(1).describe('Id of the failed or timed out run to retry'),
      org_id: orgIdSchema,
    },
    async ({ run_id, org_id }) => {
      const token = await getToken();
      return reply(
        await fleetRequest(`/runs/${encodeURIComponent(run_id)}/retry`, {
          token,
          orgId: org_id,
          method: 'POST',
        }),
      );
    },
  );

  server.tool(
    'move_run_to_front',
    'Move a waiting FerrFleet run to the front of the line it waits in: its runner pool, or the cluster slot line. Only runs waiting in a runner pool or for cluster capacity can move. Returns the line and how many runs it moved ahead of (0 when it was already first). Refused with 409 when the run is not waiting (leased, running, finished, held for credits, or an external pipeline run) and with 403 for an org token: needs a personal token. Requires a FerrFleet API that has POST /runs/{id}/move-to-front.',
    {
      run_id: z.string().min(1).describe('Id of the waiting run to move to the front'),
      org_id: orgIdSchema,
    },
    async ({ run_id, org_id }) => {
      const token = await getToken();
      return reply(
        await fleetRequest(`/runs/${encodeURIComponent(run_id)}/move-to-front`, {
          token,
          orgId: org_id,
          method: 'POST',
        }),
      );
    },
  );
}
