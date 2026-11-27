import { z } from 'zod';
import { ApiRequestError, getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';
import { effortSchema } from './model-choice.js';
import { reply } from './reply.js';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  first_party_for_product: string | null;
  created_at: string;
  updated_at: string;
}

const RUNNER_MODES = ['managed', 'external'] as const;
const AGENT_CAPABILITIES = [
  'code_review',
  'debug_action',
  'ticket_implementation',
  'review_response',
  'review_followup',
] as const;
export const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

function deleteRefusal(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  if (error.status === 404) return 'Agent not found.';
  if (error.status !== 409) return undefined;
  if (error.code === 'agent_in_use') {
    return `${error.message}. Remove that step from the workflow first, then delete the agent.`;
  }
  return 'The agent is still referenced by another resource (such as an event rule) and cannot be deleted. Change or delete that resource first, or disable the agent with update_agent and enabled: false.';
}

export function registerAgentTools(server: McpServer) {
  server.tool(
    'list_agents',
    'List FerrFleet agents available to the authenticated user (marketplace + custom).',
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      const agents = await fleetRequest<Agent[]>('/agents', { token, orgId: org_id });
      return {
        content: [{ type: 'text' as const, text: toToolText(agents) }],
      };
    },
  );

  server.tool(
    'get_agent',
    'Get full details of a FerrFleet agent (manifest, scopes, last run).',
    {
      agent_id: z.string().min(1).describe('Agent id'),
      org_id: orgIdSchema,
    },
    async ({ agent_id, org_id }) => {
      const token = await getToken();
      const agent = await fleetRequest<Agent>(`/agents/${encodeURIComponent(agent_id)}`, {
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(agent) }],
      };
    },
  );

  server.tool(
    'trigger_agent_run',
    'Trigger a new run of a FerrFleet agent. Returns the freshly-created run id — poll get_run for status or pull get_run_transcript when finished.',
    {
      agent_id: z.string().min(1).describe('Agent id'),
      org_id: orgIdSchema,
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional structured input passed to the agent at run start.'),
      reason: z
        .string()
        .max(500)
        .optional()
        .describe('Free-text reason recorded with the run (audit trail).'),
    },
    async ({ agent_id, input, reason, org_id }) => {
      const token = await getToken();
      const run = await fleetRequest<{ id: string; status: string; created_at: string }>(
        `/agents/${encodeURIComponent(agent_id)}/runs`,
        {
          token,
          orgId: org_id,
          method: 'POST',
          body: { input: input ?? {}, reason: reason ?? null },
        },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(run) }],
      };
    },
  );

  server.tool(
    'create_agent',
    'Create a FerrFleet agent in the organization. The agent starts with default options unless you pass options, and runner_mode=managed; use update_agent to change runner_mode or to set enabled.',
    {
      id: z
        .string()
        .regex(AGENT_ID_PATTERN)
        .describe('Unique slug: lowercase letters, digits and hyphens, 2 to 64 characters'),
      org_id: orgIdSchema,
      name: z.string().min(1).max(100).describe('Display name'),
      prompt: z.string().min(1).max(20000).describe('System prompt'),
      additional_prompt: z
        .string()
        .max(20000)
        .optional()
        .describe('Extra prompt appended to the base prompt'),
      model: z.string().min(1).max(100).optional().describe('Model id; omit for the CLI default'),
      effort: effortSchema
        .optional()
        .describe('Default effort: low, medium, high, xhigh or max; omit for the CLI default'),
      working_dir: z
        .string()
        .min(1)
        .max(256)
        .optional()
        .describe('Working directory of the run; defaults to /workdir'),
      description: z.string().max(500).optional().describe('Short description'),
      notify_url: z
        .string()
        .url()
        .max(2048)
        .optional()
        .describe('Webhook notified when a run finishes'),
      options: z.record(z.string(), z.unknown()).optional().describe('Agent options object'),
      capabilities: z
        .array(z.enum(AGENT_CAPABILITIES))
        .optional()
        .describe('Capabilities the agent can be assigned; duplicates are removed'),
    },
    async ({ org_id, ...fields }) => {
      const body = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      const token = await getToken();
      const agent = await fleetRequest<Agent>('/agents', {
        token,
        orgId: org_id,
        method: 'POST',
        body,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(agent) }],
      };
    },
  );

  server.tool(
    'update_agent',
    "Update a FerrFleet agent. Only the fields you pass change; at least one is required. WARNING: setting runner_mode=external stops FerrFleet starting that agent itself for every caller (schedules, webhooks and tickets stop producing runs); its own pipeline must then create and execute the runs. Use runner_mode=managed to hand it back. Setting runner_pool_id changes where the agent's runs execute: on that runner pool instead of the FerrFleet cluster. runner_pool_id=null hands the agent back to the FerrFleet cluster.",
    {
      agent_id: z.string().min(1).describe('Agent id'),
      org_id: orgIdSchema,
      name: z.string().min(1).max(100).optional().describe('Display name'),
      prompt: z.string().min(1).max(20000).optional().describe('System prompt'),
      additional_prompt: z
        .string()
        .max(20000)
        .optional()
        .describe('Extra prompt appended to the base prompt'),
      model: z
        .string()
        .max(100)
        .optional()
        .describe('Model id; an empty string restores the CLI default'),
      effort: z
        .union([effortSchema, z.literal('')])
        .optional()
        .describe(
          'Default effort: low, medium, high, xhigh or max; an empty string clears it; omit to leave it unchanged',
        ),
      working_dir: z.string().min(1).max(256).optional().describe('Working directory of the run'),
      description: z.string().max(500).optional().describe('Short description'),
      enabled: z.boolean().optional().describe('Whether the agent can be triggered'),
      notify_url: z
        .string()
        .url()
        .max(2048)
        .optional()
        .describe('Webhook notified when a run finishes'),
      options: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Replaces the whole options object; it is not merged with the existing one'),
      capabilities: z
        .array(z.enum(AGENT_CAPABILITIES))
        .optional()
        .describe(
          'Replaces the whole capability list, it is not merged with the existing one; [] clears it; omit to leave it unchanged; duplicates are removed',
        ),
      runner_mode: z
        .enum(RUNNER_MODES)
        .optional()
        .describe('managed: FerrFleet starts the runner. external: the caller starts it'),
      runner_pool_id: z
        .guid()
        .nullable()
        .optional()
        .describe(
          'Runner pool id from list_runner_pools to run this agent on; null detaches it and returns the agent to the FerrFleet cluster; omit to leave it unchanged',
        ),
    },
    async ({ agent_id, org_id, ...fields }) => {
      const body = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(body).length === 0) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: 'update_agent needs at least one field to change.' },
          ],
        };
      }
      const token = await getToken();
      const agent = await fleetRequest<Agent>(`/agents/${encodeURIComponent(agent_id)}`, {
        token,
        orgId: org_id,
        method: 'PATCH',
        body,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(agent) }],
      };
    },
  );

  server.tool(
    'delete_agent',
    "Delete a FerrFleet agent. Irreversible: the agent's runs and transcripts, schedules, skills, repository bindings and connector attachments are deleted with it (the connectors and repositories themselves stay). Refused with agent_in_use while a workflow step uses the agent (remove the step first), and refused while an event rule names it. To stop an agent without deleting it, use update_agent with enabled: false.",
    { agent_id: z.string().min(1).describe('Agent id'), org_id: orgIdSchema },
    async ({ agent_id, org_id }) => {
      const token = await getToken();
      try {
        await fleetRequest(`/agents/${encodeURIComponent(agent_id)}`, {
          token,
          orgId: org_id,
          method: 'DELETE',
        });
      } catch (error) {
        const refusal = deleteRefusal(error);
        if (refusal === undefined) throw error;
        return { isError: true, content: [{ type: 'text' as const, text: refusal }] };
      }
      return reply({ deleted: agent_id });
    },
  );
}
