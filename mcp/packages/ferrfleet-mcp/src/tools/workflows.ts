import { z } from 'zod';
import { getToken, type McpServer } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';
import { stepEffortSchema, stepModelSchema } from './model-choice.js';
import { reply } from './reply.js';

const JOIN_CONDITIONS = ['all_completed', 'all_finished', 'any_completed'] as const;

const ENTRY_KINDS = ['event', 'cron', 'manual'] as const;

const OUTPUT_KINDS = [
  'github_comment',
  'github_review',
  'github_issue',
  'ferrtrack_ticket',
  'ferrtrack_comment',
  'webhook',
] as const;

const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MAX_PROJECT_SLUG = 40;

const MAX_OUTPUT_PROJECTS = 20;

const STEP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const stepSchema = z.strictObject({
  id: z
    .string()
    .regex(STEP_ID_PATTERN)
    .describe('Step id, unique in the workflow: lowercase letters, digits and hyphens, up to 40'),
  agent_id: z.string().min(1).describe('Agent that runs this step'),
  needs: z
    .array(z.string().min(1))
    .optional()
    .describe('Ids of the steps that must finish first; omit or leave empty for a root step'),
  when: z
    .enum(JOIN_CONDITIONS)
    .optional()
    .describe(
      'When the step starts once its needs are done: all_completed (default), all_finished or any_completed',
    ),
  instructions: z
    .string()
    .max(4000)
    .optional()
    .describe("Extra instructions appended to the agent's prompt for this step"),
  input: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Structured input passed to the agent, up to 8 KiB'),
  model: stepModelSchema
    .optional()
    .describe(
      'Model for this step: opus, sonnet, haiku or a claude-* id; {"from": "<step id>"} to take it from the model key of that ancestor step\'s result; or "auto" to take it from the model key of the result of the only step in needs. Resolution order: run input (top-level model key of the run body) > step field > agent default',
    ),
  effort: stepEffortSchema
    .optional()
    .describe(
      'Effort for this step: low, medium, high, xhigh or max; {"from": "<step id>"} to take it from the effort key of that ancestor step\'s result; or "auto" to take it from the effort key of the result of the only step in needs. Resolution order: run input (top-level effort key of the run body) > step field > agent default',
    ),
  position: z
    .strictObject({ x: z.number(), y: z.number() })
    .describe('Canvas position of the step in the editor'),
});

const positionSchema = z
  .strictObject({ x: z.number(), y: z.number() })
  .describe('Canvas position in the editor');

const entrySchema = z
  .strictObject({
    id: z
      .string()
      .min(1)
      .describe('Entry id, unique among the steps, entries and outputs of the workflow'),
    kind: z.enum(ENTRY_KINDS).describe('event, cron or manual'),
    cron: z
      .string()
      .optional()
      .describe('Required for cron, refused otherwise: 5 field cron expression, evaluated in UTC'),
    starts: z.array(z.string().min(1)).describe('Ids of the root steps this entry starts'),
    next_run_at: z
      .string()
      .nullable()
      .optional()
      .describe('Returned by get_workflow on cron entries; accepted and dropped, never sent'),
    position: positionSchema,
  })
  .transform(({ next_run_at: _nextRunAt, ...entry }) => entry);

const projectsSchema = z
  .array(z.string().max(MAX_PROJECT_SLUG).regex(PROJECT_SLUG_PATTERN))
  .max(MAX_OUTPUT_PROJECTS)
  .refine((projects) => new Set(projects).size === projects.length, {
    message: 'Project slugs must be unique',
  });

const outputSchema = z
  .strictObject({
    id: z
      .string()
      .min(1)
      .describe('Output id, unique among the steps, entries and outputs of the workflow'),
    from: z
      .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
      .refine((from) => typeof from === 'string' || new Set(from).size === from.length, {
        message: 'Step ids must be unique',
      })
      .describe(
        'Id of the step whose result is delivered, or a non-empty list of distinct step ids: the output waits for all of them, ignores skipped ones and delivers the last listed step that completed with a body',
      ),
    kind: z.enum(OUTPUT_KINDS).describe('Where the result goes'),
    connector_id: z
      .string()
      .optional()
      .describe('Connector of the matching type, from list_connectors (github_*, ferrtrack_*)'),
    url: z.string().optional().describe('Target url for a webhook output'),
    project: z.string().optional().describe('Project slug for a ferrtrack_ticket output'),
    projects: projectsSchema
      .optional()
      .describe(
        'ferrtrack_ticket only: up to 20 distinct project slugs besides project that the items of the result may set as their own project; an item naming another project is refused',
      ),
    repo: z.string().optional().describe('owner/name repository for a github output'),
    position: positionSchema,
  })
  .refine((output) => output.projects === undefined || output.kind === 'ferrtrack_ticket', {
    message: 'projects only applies to a ferrtrack_ticket output',
    path: ['projects'],
  });

const MAX_STEPS = 100;

const workflowFields = {
  name: z.string().trim().min(1).max(100).describe('Workflow name'),
  enabled: z.boolean().optional().describe('Whether the workflow can run; defaults to true'),
  steps: z
    .array(stepSchema)
    .min(1)
    .max(MAX_STEPS)
    .describe(
      `One to ${MAX_STEPS} steps forming an acyclic graph with at least one root. Two steps on the same agent must be ordered with needs`,
    ),
};

interface StoredWorkflow {
  enabled: boolean;
  entries: unknown[];
  outputs: unknown[];
}

const entriesField = z
  .array(entrySchema)
  .max(10)
  .describe('What starts the workflow: cron schedules, event or manual entries');

const outputsField = z
  .array(outputSchema)
  .max(10)
  .describe('Where step results are delivered, for example a github_issue');

const entryAndOutputFields = { entries: entriesField.optional(), outputs: outputsField.optional() };

const workflowIdSchema = z.guid().describe('Workflow id from list_workflows');

export function registerWorkflowTools(server: McpServer) {
  server.tool(
    'list_workflows',
    "List the organization's workflows.",
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      return reply(await fleetRequest('/workflows', { token, orgId: org_id }));
    },
  );

  server.tool(
    'get_workflow',
    'Get a workflow with its entries, steps and outputs.',
    { workflow_id: workflowIdSchema, org_id: orgIdSchema },
    async ({ workflow_id, org_id }) => {
      const token = await getToken();
      return reply(await fleetRequest(`/workflows/${workflow_id}`, { token, orgId: org_id }));
    },
  );

  server.tool(
    'create_workflow',
    'Create a workflow: a graph of agent steps, with optional entries (cron, event, manual) and outputs (github_issue and others). The API refuses cycles, unknown needs or agents, two steps on the same agent that could run at the same time, and invalid entries or outputs. A step may set model and effort; see their descriptions for the resolution order.',
    { ...workflowFields, ...entryAndOutputFields, org_id: orgIdSchema },
    async ({ org_id, ...body }) => {
      const token = await getToken();
      return reply(
        await fleetRequest('/workflows', { token, orgId: org_id, method: 'POST', body }),
      );
    },
  );

  server.tool(
    'update_workflow',
    'Replace a workflow. Send the whole workflow, not a patch: steps you leave out are removed. entries, outputs and enabled keep their current values when omitted; pass entries: [] or outputs: [] to clear them.',
    {
      workflow_id: workflowIdSchema,
      ...workflowFields,
      ...entryAndOutputFields,
      org_id: orgIdSchema,
    },
    async ({ workflow_id, org_id, ...fields }) => {
      const token = await getToken();
      const path = `/workflows/${workflow_id}`;
      const needsCurrent =
        fields.entries === undefined ||
        fields.outputs === undefined ||
        fields.enabled === undefined;
      const current = needsCurrent
        ? await fleetRequest<StoredWorkflow>(path, { token, orgId: org_id })
        : undefined;
      const body = {
        ...fields,
        enabled: fields.enabled ?? current?.enabled,
        entries: fields.entries ?? current?.entries,
        outputs: fields.outputs ?? current?.outputs,
      };
      return reply(await fleetRequest(path, { token, orgId: org_id, method: 'PUT', body }));
    },
  );

  server.tool(
    'delete_workflow',
    'Delete a workflow. Fails with workflow_in_use while an event rule names it; change or delete the rule first.',
    { workflow_id: workflowIdSchema, org_id: orgIdSchema },
    async ({ workflow_id, org_id }) => {
      const token = await getToken();
      await fleetRequest(`/workflows/${workflow_id}`, {
        token,
        orgId: org_id,
        method: 'DELETE',
      });
      return reply({ deleted: workflow_id });
    },
  );

  server.tool(
    'run_workflow',
    'Start a workflow run now. Returns the run; poll get_workflow_run for step states and agent runs. A top-level model or effort key in input overrides every step and agent default for this run.',
    {
      workflow_id: workflowIdSchema,
      org_id: orgIdSchema,
      entry: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Id of a manual entry of the workflow to start from; omit to start every root step',
        ),
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional input object for the run, up to 64 KiB'),
    },
    async ({ workflow_id, input, entry, org_id }) => {
      const token = await getToken();
      const qs = entry !== undefined ? `?entry=${encodeURIComponent(entry)}` : '';
      return reply(
        await fleetRequest(`/workflows/${workflow_id}/runs${qs}`, {
          token,
          orgId: org_id,
          method: 'POST',
          body: input ?? {},
        }),
      );
    },
  );

  server.tool(
    'list_workflow_runs',
    "List a workflow's recent runs, most recent first.",
    {
      workflow_id: workflowIdSchema,
      org_id: orgIdSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Max runs to return (default 50)'),
    },
    async ({ workflow_id, limit, org_id }) => {
      const token = await getToken();
      const qs = limit !== undefined ? `?limit=${limit}` : '';
      return reply(
        await fleetRequest(`/workflows/${workflow_id}/runs${qs}`, { token, orgId: org_id }),
      );
    },
  );

  server.tool(
    'get_workflow_run',
    'Get one workflow run with the state of every step and the agent run behind it.',
    { run_id: z.guid().describe('Workflow run id'), org_id: orgIdSchema },
    async ({ run_id, org_id }) => {
      const token = await getToken();
      return reply(await fleetRequest(`/workflow-runs/${run_id}`, { token, orgId: org_id }));
    },
  );
}
