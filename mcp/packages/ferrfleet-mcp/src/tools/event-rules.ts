import { z } from 'zod';
import { getToken, type McpServer } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';
import { reply } from './reply.js';

const EVENT_KINDS = [
  'pull_request_opened',
  'pull_request_updated',
  'review_requested',
  'pipeline_failed',
] as const;
const UPDATE_TYPES = ['patch', 'minor', 'major'] as const;
const DEDUP_MODES = ['head_commit', 'none'] as const;

const MAX_PATTERNS = 50;

const patterns = (what: string) =>
  z.array(z.string().trim().min(1)).max(MAX_PATTERNS).describe(what);

const actorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('bot') }),
  z.strictObject({ kind: z.literal('human') }),
  z.strictObject({ kind: z.literal('login'), logins: patterns('GitHub logins').min(1) }),
]);

const conditionsSchema = z
  .strictObject({
    sources: z.array(z.literal('github')).describe('Event sources; github today'),
    kinds: z.array(z.enum(EVENT_KINDS)).describe('Event kinds'),
    opened_by: actorSchema.describe('Pull request author'),
    triggered_by: actorSchema.describe('Account that caused this delivery'),
    repositories: patterns('owner/name globs, case-insensitive'),
    target_branches: patterns('Base branch globs'),
    head_branches: patterns('Head branch globs'),
    labels: patterns('Pull request labels, any of'),
    paths: z
      .strictObject({
        mode: z.enum(['any', 'all']),
        globs: patterns('Changed-file globs').min(1),
      })
      .describe('all: every changed file matches a glob. any: at least one does'),
    update_types: z.array(z.enum(UPDATE_TYPES)).describe('Dependency update size'),
  })
  .partial()
  .describe('Every condition is optional and they combine with AND; none matches every event');

const outcomeSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('run'),
    agent_id: z
      .string()
      .min(1)
      .optional()
      .describe('Agent to run instead of the repository-bound one'),
    instructions: z.string().max(4000).optional().describe("Appended to the agent's prompt"),
    dedup: z
      .enum(DEDUP_MODES)
      .optional()
      .describe('head_commit (default): one run per head commit. none: every event runs'),
  }),
  z.strictObject({
    action: z.literal('skip'),
    reason: z.string().trim().min(1).max(500).describe('Shown in the decision trace'),
  }),
  z.strictObject({
    action: z.literal('workflow'),
    workflow_id: z.guid().describe('Workflow from list_workflows'),
  }),
]);

const ruleFields = {
  name: z.string().trim().min(1).max(100).describe('Rule name'),
  enabled: z.boolean().optional().describe('Disabled rules are skipped; defaults to true'),
  conditions: conditionsSchema.optional(),
  outcome: outcomeSchema,
};

const ruleIdSchema = z.guid().describe('Rule id from list_event_rules');

export function registerEventRuleTools(server: McpServer) {
  server.tool(
    'list_event_rules',
    "List the organization's event rules in evaluation order.",
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      return reply(await fleetRequest('/event-rules', { token, orgId: org_id }));
    },
  );

  server.tool(
    'create_event_rule',
    'Add an event rule at the end of the list. Rules are evaluated in order and the first match wins; without a match the bound agent runs once per head commit. The outcome is run, skip (needs a reason) or workflow.',
    { ...ruleFields, org_id: orgIdSchema },
    async ({ org_id, ...body }) => {
      const token = await getToken();
      return reply(
        await fleetRequest('/event-rules', { token, orgId: org_id, method: 'POST', body }),
      );
    },
  );

  server.tool(
    'update_event_rule',
    'Replace an event rule. Send the whole rule, not a patch; omitted conditions are cleared.',
    { rule_id: ruleIdSchema, ...ruleFields, org_id: orgIdSchema },
    async ({ rule_id, org_id, ...body }) => {
      const token = await getToken();
      return reply(
        await fleetRequest(`/event-rules/${rule_id}`, {
          token,
          orgId: org_id,
          method: 'PUT',
          body,
        }),
      );
    },
  );

  server.tool(
    'delete_event_rule',
    'Delete an event rule.',
    { rule_id: ruleIdSchema, org_id: orgIdSchema },
    async ({ rule_id, org_id }) => {
      const token = await getToken();
      await fleetRequest(`/event-rules/${rule_id}`, {
        token,
        orgId: org_id,
        method: 'DELETE',
      });
      return reply({ deleted: rule_id });
    },
  );

  server.tool(
    'reorder_event_rules',
    'Set the evaluation order. ids must list every rule exactly once, first evaluated first.',
    { ids: z.array(z.guid()).describe('All rule ids in the new order'), org_id: orgIdSchema },
    async ({ ids, org_id }) => {
      const token = await getToken();
      return reply(
        await fleetRequest('/event-rules/order', {
          token,
          orgId: org_id,
          method: 'PUT',
          body: { ids },
        }),
      );
    },
  );

  server.tool(
    'list_event_decisions',
    'List the most recent event decisions: which rule matched each event and what happened (triggered, queued, skipped, deduplicated, no_agent, failed). Kept 30 days.',
    {
      org_id: orgIdSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Max decisions to return (default 100)'),
    },
    async ({ limit, org_id }) => {
      const token = await getToken();
      const qs = limit !== undefined ? `?limit=${limit}` : '';
      return reply(await fleetRequest(`/event-decisions${qs}`, { token, orgId: org_id }));
    },
  );
}
