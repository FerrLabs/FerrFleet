import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z, type ZodTypeAny } from 'zod';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

type Handler = (
  params: Record<string, unknown>,
) => Promise<{ isError?: boolean; content: { text?: string }[] }>;

const handlers = new Map<string, Handler>();
const schemas = new Map<string, Record<string, ZodTypeAny>>();
const mockServer = {
  tool: vi.fn(
    (name: string, _desc: string, schema: Record<string, ZodTypeAny>, handler: Handler) => {
      handlers.set(name, handler);
      schemas.set(name, schema);
    },
  ),
} as unknown as McpServer;

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function respond(status: number, body?: unknown): Response {
  return {
    ok: status < 400,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function lastCall(): { url: string; method: string; body: unknown } {
  const [url, init] = mockFetch.mock.calls[0];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
  };
}

function callAt(index: number): { url: string; method: string; body: unknown } {
  const [url, init] = mockFetch.mock.calls[index];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
  };
}

const cronEntry = {
  id: 'nightly',
  kind: 'cron',
  cron: '0 6 * * *',
  starts: ['review'],
  position: { x: 0, y: 0 },
};
const issueOutput = {
  id: 'file-issue',
  from: 'review',
  kind: 'github_issue',
  connector_id: 'conn-1',
  repo: 'FerrLabs/FerrFleet',
  position: { x: 5, y: 5 },
};

const FLEET = 'https://api.ferrfleet.com';
const ID = '3f0c6a52-8d1e-4b7a-9c2f-5e6d7a8b9c01';
const OTHER_ID = '7a1d9e34-2b5c-4f80-8e6a-1c3b5d7f9a02';

const step = { id: 'review', agent_id: 'reviewer', position: { x: 10, y: 20 } };
const fullStep = {
  ...step,
  needs: ['lint'],
  when: 'any_completed',
  instructions: 'Be strict',
  input: { depth: 2 },
};

function field(tool: string, name: string): ZodTypeAny {
  return schemas.get(tool)![name];
}

function accepts(tool: string, name: string, value: unknown): boolean {
  return field(tool, name).safeParse(value).success;
}

describe('workflow and event rule tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    schemas.clear();
    mockFetch.mockResolvedValue(respond(200, { id: ID }));
    const { registerWorkflowTools } = await import('../workflows.js');
    const { registerEventRuleTools } = await import('../event-rules.js');
    registerWorkflowTools(mockServer);
    registerEventRuleTools(mockServer);
  });

  describe('workflows', () => {
    it('list_workflows reads the collection', async () => {
      await handlers.get('list_workflows')!({});
      expect(lastCall()).toMatchObject({ url: `${FLEET}/workflows`, method: 'GET' });
    });

    it('get_workflow reads one workflow', async () => {
      await handlers.get('get_workflow')!({ workflow_id: ID });
      expect(lastCall()).toMatchObject({ url: `${FLEET}/workflows/${ID}`, method: 'GET' });
    });

    it('create_workflow posts name, enabled and steps without org_id', async () => {
      await handlers.get('create_workflow')!({
        name: 'Review',
        enabled: false,
        steps: [fullStep],
        org_id: OTHER_ID,
      });
      expect(lastCall()).toEqual({
        url: `${FLEET}/workflows`,
        method: 'POST',
        body: { name: 'Review', enabled: false, steps: [fullStep] },
      });
    });

    it('create_workflow posts entries and outputs', async () => {
      await handlers.get('create_workflow')!({
        name: 'Review',
        steps: [step],
        entries: [cronEntry],
        outputs: [issueOutput],
      });
      expect(lastCall().body).toEqual({
        name: 'Review',
        steps: [step],
        entries: [cronEntry],
        outputs: [issueOutput],
      });
    });

    it('update_workflow keeps stored entries, outputs and enabled when omitted', async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, {
          id: ID,
          enabled: false,
          entries: [{ ...cronEntry, next_run_at: '2026-11-12T06:00:00Z' }],
          outputs: [issueOutput],
        }),
      );
      await handlers.get('update_workflow')!({ workflow_id: ID, name: 'Review', steps: [step] });
      expect(callAt(0)).toMatchObject({ url: `${FLEET}/workflows/${ID}`, method: 'GET' });
      expect(callAt(1)).toEqual({
        url: `${FLEET}/workflows/${ID}`,
        method: 'PUT',
        body: {
          name: 'Review',
          steps: [step],
          enabled: false,
          entries: [{ ...cronEntry, next_run_at: '2026-11-12T06:00:00Z' }],
          outputs: [issueOutput],
        },
      });
    });

    it('update_workflow clears entries and outputs only when given empty arrays', async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, { id: ID, enabled: true, entries: [cronEntry], outputs: [issueOutput] }),
      );
      await handlers.get('update_workflow')!({
        workflow_id: ID,
        name: 'Review',
        steps: [step],
        entries: [],
        outputs: [],
      });
      expect(callAt(1).body).toMatchObject({ entries: [], outputs: [], enabled: true });
    });

    it('update_workflow sends the given entries and outputs over the stored ones', async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, { id: ID, enabled: true, entries: [], outputs: [issueOutput] }),
      );
      await handlers.get('update_workflow')!({
        workflow_id: ID,
        name: 'Review',
        steps: [step],
        entries: [cronEntry],
      });
      expect(callAt(1).body).toMatchObject({ entries: [cronEntry], outputs: [issueOutput] });
    });

    it('update_workflow skips the read when everything is given', async () => {
      await handlers.get('update_workflow')!({
        workflow_id: ID,
        name: 'Review',
        steps: [step],
        enabled: true,
        entries: [cronEntry],
        outputs: [issueOutput],
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(lastCall()).toMatchObject({ method: 'PUT' });
    });

    it('update_workflow does not write when the stored workflow cannot be read', async () => {
      mockFetch.mockResolvedValueOnce(respond(404, { error: 'not_found' }));
      await expect(
        handlers.get('update_workflow')!({ workflow_id: ID, name: 'Review', steps: [step] }),
      ).rejects.toThrow('not_found');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    describe('entries and outputs schemas', () => {
      it('accepts cron and manual entries and a github_issue output', () => {
        expect(accepts('create_workflow', 'entries', [cronEntry])).toBe(true);
        expect(
          accepts('create_workflow', 'entries', [
            { id: 'go', kind: 'manual', starts: ['review'], position: { x: 0, y: 0 } },
          ]),
        ).toBe(true);
        expect(accepts('update_workflow', 'outputs', [issueOutput])).toBe(true);
      });

      it('rejects unknown kinds and keys', () => {
        expect(accepts('create_workflow', 'entries', [{ ...cronEntry, kind: 'weekly' }])).toBe(
          false,
        );
        expect(accepts('create_workflow', 'entries', [{ ...cronEntry, extra: 1 }])).toBe(false);
        expect(accepts('create_workflow', 'outputs', [{ ...issueOutput, kind: 'sms' }])).toBe(
          false,
        );
      });

      it('requires starts on an entry and from on an output', () => {
        const { starts: _starts, ...noStarts } = cronEntry;
        const { from: _from, ...noFrom } = issueOutput;
        expect(accepts('create_workflow', 'entries', [noStarts])).toBe(false);
        expect(accepts('create_workflow', 'outputs', [noFrom])).toBe(false);
      });

      it('caps entries and outputs at 10', () => {
        const entries = Array.from({ length: 11 }, (_, i) => ({ ...cronEntry, id: `e${i}` }));
        const outputs = Array.from({ length: 11 }, (_, i) => ({ ...issueOutput, id: `o${i}` }));
        expect(accepts('create_workflow', 'entries', entries)).toBe(false);
        expect(accepts('create_workflow', 'outputs', outputs)).toBe(false);
      });
    });

    it('delete_workflow sends DELETE and reports the id on 204', async () => {
      mockFetch.mockResolvedValue(respond(204));
      const result = await handlers.get('delete_workflow')!({ workflow_id: ID });
      expect(lastCall()).toMatchObject({ url: `${FLEET}/workflows/${ID}`, method: 'DELETE' });
      expect(JSON.parse(result.content[0].text!)).toEqual({ deleted: ID });
    });

    it('run_workflow posts the input object as the body', async () => {
      await handlers.get('run_workflow')!({ workflow_id: ID, input: { pr: 4 } });
      expect(lastCall()).toEqual({
        url: `${FLEET}/workflows/${ID}/runs`,
        method: 'POST',
        body: { pr: 4 },
      });
    });

    it('run_workflow starts a workflow that has a cron entry without naming an entry', async () => {
      await handlers.get('run_workflow')!({ workflow_id: ID });
      expect(lastCall().url).toBe(`${FLEET}/workflows/${ID}/runs`);
    });

    it('run_workflow sends an empty object when no input is given', async () => {
      await handlers.get('run_workflow')!({ workflow_id: ID });
      expect(lastCall().body).toEqual({});
    });

    it('run_workflow only accepts an object as input', () => {
      expect(accepts('run_workflow', 'input', { a: 1 })).toBe(true);
      expect(accepts('run_workflow', 'input', 'x')).toBe(false);
      expect(accepts('run_workflow', 'input', [1])).toBe(false);
    });

    it('list_workflow_runs passes limit as a query parameter', async () => {
      await handlers.get('list_workflow_runs')!({ workflow_id: ID, limit: 20 });
      expect(lastCall().url).toBe(`${FLEET}/workflows/${ID}/runs?limit=20`);
    });

    it('list_workflow_runs omits the query string without a limit', async () => {
      await handlers.get('list_workflow_runs')!({ workflow_id: ID });
      expect(lastCall().url).toBe(`${FLEET}/workflows/${ID}/runs`);
    });

    it('list_workflow_runs bounds limit to 1..200', () => {
      expect(accepts('list_workflow_runs', 'limit', 200)).toBe(true);
      expect(accepts('list_workflow_runs', 'limit', 201)).toBe(false);
      expect(accepts('list_workflow_runs', 'limit', 0)).toBe(false);
      expect(accepts('list_workflow_runs', 'limit', 1.5)).toBe(false);
    });

    it('get_workflow_run reads the workflow-runs resource', async () => {
      await handlers.get('get_workflow_run')!({ run_id: ID });
      expect(lastCall()).toMatchObject({ url: `${FLEET}/workflow-runs/${ID}`, method: 'GET' });
    });

    it.each(['get_workflow', 'update_workflow', 'delete_workflow', 'run_workflow'])(
      '%s rejects a workflow_id that is not a uuid',
      (tool) => {
        expect(accepts(tool, 'workflow_id', '../runs')).toBe(false);
        expect(accepts(tool, 'workflow_id', ID)).toBe(true);
      },
    );

    describe('steps schema', () => {
      const steps = () => field('create_workflow', 'steps');
      const parse = (value: unknown) => steps().safeParse([value]).success;

      it('accepts a minimal and a full step', () => {
        expect(parse(step)).toBe(true);
        expect(parse(fullStep)).toBe(true);
      });

      it('requires agent_id, id and position', () => {
        expect(parse({ id: 'a', position: step.position })).toBe(false);
        expect(parse({ agent_id: 'x', position: step.position })).toBe(false);
        expect(parse({ id: 'a', agent_id: 'x' })).toBe(false);
        expect(parse({ ...step, agent_id: '' })).toBe(false);
      });

      it('rejects an unknown join condition', () => {
        expect(parse({ ...step, when: 'all_completed' })).toBe(true);
        expect(parse({ ...step, when: 'all_finished' })).toBe(true);
        expect(parse({ ...step, when: 'first' })).toBe(false);
        expect(parse({ ...step, when: 'ALL_COMPLETED' })).toBe(false);
      });

      it('only accepts step ids the API accepts', () => {
        expect(parse({ ...step, id: 'step-1' })).toBe(true);
        expect(parse({ ...step, id: 'Step' })).toBe(false);
        expect(parse({ ...step, id: '-a' })).toBe(false);
        expect(parse({ ...step, id: 'a'.repeat(41) })).toBe(false);
      });

      it('requires numeric x and y and rejects extra position keys', () => {
        expect(parse({ ...step, position: { x: 1 } })).toBe(false);
        expect(parse({ ...step, position: { x: '1', y: 2 } })).toBe(false);
        expect(parse({ ...step, position: { x: 1, y: 2, z: 3 } })).toBe(false);
      });

      it('caps instructions at 4000 characters', () => {
        expect(parse({ ...step, instructions: 'a'.repeat(4000) })).toBe(true);
        expect(parse({ ...step, instructions: 'a'.repeat(4001) })).toBe(false);
      });

      it('rejects unknown step keys like the API does', () => {
        expect(parse({ ...step, retries: 3 })).toBe(false);
      });

      it('rejects non-array needs and non-object input', () => {
        expect(parse({ ...step, needs: 'lint' })).toBe(false);
        expect(parse({ ...step, input: 'x' })).toBe(false);
      });

      it('bounds the step count to 1..20', () => {
        const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...step, id: `s${i}` }));
        expect(steps().safeParse(many(20)).success).toBe(true);
        expect(steps().safeParse(many(21)).success).toBe(false);
        expect(steps().safeParse([]).success).toBe(false);
      });
    });

    it('create_workflow requires a name of 1 to 100 characters', () => {
      expect(accepts('create_workflow', 'name', undefined)).toBe(false);
      expect(accepts('create_workflow', 'name', '')).toBe(false);
      expect(accepts('create_workflow', 'name', 'a'.repeat(101))).toBe(false);
      expect(accepts('create_workflow', 'enabled', undefined)).toBe(true);
    });
  });

  describe('event rules', () => {
    const skip = { action: 'skip', reason: 'noise' };

    it('list_event_rules reads the collection', async () => {
      await handlers.get('list_event_rules')!({});
      expect(lastCall()).toMatchObject({ url: `${FLEET}/event-rules`, method: 'GET' });
    });

    it('create_event_rule posts the rule without org_id', async () => {
      const rule = {
        name: 'Renovate',
        enabled: true,
        conditions: { kinds: ['pull_request_opened'], opened_by: { kind: 'bot' } },
        outcome: { action: 'run', agent_id: 'reviewer', dedup: 'none' },
      };
      await handlers.get('create_event_rule')!({ ...rule, org_id: OTHER_ID });
      expect(lastCall()).toEqual({ url: `${FLEET}/event-rules`, method: 'POST', body: rule });
    });

    it('update_event_rule replaces with PUT and keeps rule_id out of the body', async () => {
      await handlers.get('update_event_rule')!({ rule_id: ID, name: 'R', outcome: skip });
      expect(lastCall()).toEqual({
        url: `${FLEET}/event-rules/${ID}`,
        method: 'PUT',
        body: { name: 'R', outcome: skip },
      });
    });

    it('update_event_rule forwards entry_id of a workflow outcome', async () => {
      const outcome = { action: 'workflow', workflow_id: ID, entry_id: 'renovate-pr' };
      await handlers.get('update_event_rule')!({ rule_id: ID, name: 'R', outcome });
      expect(lastCall().body).toEqual({ name: 'R', outcome });
    });

    it('create_event_rule forwards entry_id of a workflow outcome', async () => {
      const outcome = { action: 'workflow', workflow_id: ID, entry_id: 'pr' };
      await handlers.get('create_event_rule')!({ name: 'R', outcome });
      expect(lastCall().body).toEqual({ name: 'R', outcome });
    });

    it('a workflow outcome without entry_id sends none', async () => {
      const outcome = { action: 'workflow', workflow_id: ID };
      await handlers.get('create_event_rule')!({ name: 'R', outcome });
      expect(lastCall().body).toEqual({ name: 'R', outcome });
    });

    it('delete_event_rule sends DELETE and reports the id on 204', async () => {
      mockFetch.mockResolvedValue(respond(204));
      const result = await handlers.get('delete_event_rule')!({ rule_id: ID });
      expect(lastCall()).toMatchObject({ url: `${FLEET}/event-rules/${ID}`, method: 'DELETE' });
      expect(JSON.parse(result.content[0].text!)).toEqual({ deleted: ID });
    });

    it('reorder_event_rules puts the ids to /event-rules/order', async () => {
      await handlers.get('reorder_event_rules')!({ ids: [ID, OTHER_ID] });
      expect(lastCall()).toEqual({
        url: `${FLEET}/event-rules/order`,
        method: 'PUT',
        body: { ids: [ID, OTHER_ID] },
      });
    });

    it('reorder_event_rules rejects ids that are not uuids', () => {
      expect(accepts('reorder_event_rules', 'ids', [ID])).toBe(true);
      expect(accepts('reorder_event_rules', 'ids', ['first'])).toBe(false);
      expect(accepts('reorder_event_rules', 'ids', undefined)).toBe(false);
    });

    it('list_event_decisions passes limit as a query parameter', async () => {
      await handlers.get('list_event_decisions')!({ limit: 500 });
      expect(lastCall().url).toBe(`${FLEET}/event-decisions?limit=500`);
    });

    it('list_event_decisions omits the query string without a limit', async () => {
      await handlers.get('list_event_decisions')!({});
      expect(lastCall().url).toBe(`${FLEET}/event-decisions`);
    });

    it('list_event_decisions bounds limit to 1..500', () => {
      expect(accepts('list_event_decisions', 'limit', 501)).toBe(false);
      expect(accepts('list_event_decisions', 'limit', 0)).toBe(false);
    });

    describe('outcome schema', () => {
      const ok = (value: unknown) => accepts('create_event_rule', 'outcome', value);

      it('accepts run, skip and workflow outcomes', () => {
        expect(ok({ action: 'run' })).toBe(true);
        expect(ok({ action: 'run', agent_id: 'a', instructions: 'x', dedup: 'head_commit' })).toBe(
          true,
        );
        expect(ok(skip)).toBe(true);
        expect(ok({ action: 'workflow', workflow_id: ID })).toBe(true);
        expect(ok({ action: 'workflow', workflow_id: ID, entry_id: 'pr' })).toBe(true);
      });

      it('rejects an empty or non-string entry_id', () => {
        expect(ok({ action: 'workflow', workflow_id: ID, entry_id: '' })).toBe(false);
        expect(ok({ action: 'workflow', workflow_id: ID, entry_id: 1 })).toBe(false);
      });

      it('rejects an unknown action', () => {
        expect(ok({ action: 'notify' })).toBe(false);
        expect(ok({ action: 'RUN' })).toBe(false);
        expect(ok({})).toBe(false);
      });

      it('requires a skip reason of 1 to 500 characters', () => {
        expect(ok({ action: 'skip' })).toBe(false);
        expect(ok({ action: 'skip', reason: '  ' })).toBe(false);
        expect(ok({ action: 'skip', reason: 'a'.repeat(501) })).toBe(false);
      });

      it('requires a uuid workflow_id for the workflow action', () => {
        expect(ok({ action: 'workflow' })).toBe(false);
        expect(ok({ action: 'workflow', workflow_id: 'wf' })).toBe(false);
      });

      it('rejects an unknown dedup mode and over-long instructions', () => {
        expect(ok({ action: 'run', dedup: 'always' })).toBe(false);
        expect(ok({ action: 'run', instructions: 'a'.repeat(4001) })).toBe(false);
      });

      it('rejects fields from another variant', () => {
        expect(ok({ action: 'skip', reason: 'x', agent_id: 'a' })).toBe(false);
        expect(ok({ action: 'run', workflow_id: ID })).toBe(false);
        expect(ok({ action: 'skip', reason: 'x', entry_id: 'pr' })).toBe(false);
      });
    });

    describe('conditions schema', () => {
      const ok = (value: unknown) => accepts('create_event_rule', 'conditions', value);

      it('accepts empty and fully populated conditions', () => {
        expect(ok({})).toBe(true);
        expect(
          ok({
            sources: ['github'],
            kinds: ['pipeline_failed', 'review_requested'],
            opened_by: { kind: 'login', logins: ['renovate[bot]'] },
            triggered_by: { kind: 'human' },
            repositories: ['acme/*'],
            target_branches: ['main'],
            head_branches: ['renovate/*'],
            labels: ['bug'],
            paths: { mode: 'all', globs: ['docs/**'] },
            update_types: ['patch', 'minor', 'major'],
          }),
        ).toBe(true);
      });

      it('rejects a misspelt condition', () => {
        expect(ok({ label: ['bug'] })).toBe(false);
      });

      it('rejects unknown kinds, sources and update types', () => {
        expect(ok({ kinds: ['push'] })).toBe(false);
        expect(ok({ sources: ['gitlab'] })).toBe(false);
        expect(ok({ update_types: ['tiny'] })).toBe(false);
      });

      it('rejects blank and empty entries', () => {
        expect(ok({ labels: [' '] })).toBe(false);
        expect(ok({ paths: { mode: 'any', globs: [] } })).toBe(false);
        expect(ok({ opened_by: { kind: 'login', logins: [] } })).toBe(false);
      });

      it('rejects a bad actor kind or path mode', () => {
        expect(ok({ opened_by: { kind: 'robot' } })).toBe(false);
        expect(ok({ opened_by: { kind: 'bot', logins: ['x'] } })).toBe(false);
        expect(ok({ paths: { mode: 'some', globs: ['a'] } })).toBe(false);
      });

      it('caps a list at 50 entries', () => {
        const labels = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);
        expect(ok({ labels: labels(50) })).toBe(true);
        expect(ok({ labels: labels(51) })).toBe(false);
      });
    });

    it('create_event_rule requires name and outcome', () => {
      expect(accepts('create_event_rule', 'name', undefined)).toBe(false);
      expect(accepts('create_event_rule', 'name', '')).toBe(false);
      expect(accepts('create_event_rule', 'outcome', undefined)).toBe(false);
      expect(accepts('create_event_rule', 'conditions', undefined)).toBe(true);
    });
  });

  it('every new tool is registered with a description and an object schema', () => {
    const tools = mockServer.tool as unknown as {
      mock: { calls: [string, string, Record<string, ZodTypeAny>][] };
    };
    const names = tools.mock.calls.map(([name]) => name);
    expect(names).toEqual([
      'list_workflows',
      'get_workflow',
      'create_workflow',
      'update_workflow',
      'delete_workflow',
      'run_workflow',
      'list_workflow_runs',
      'get_workflow_run',
      'list_event_rules',
      'create_event_rule',
      'update_event_rule',
      'delete_event_rule',
      'reorder_event_rules',
      'list_event_decisions',
    ]);
    for (const [, description, shape] of tools.mock.calls) {
      expect(description.length).toBeGreaterThan(10);
      expect(z.object(shape).safeParse({ org_id: 'nope' }).success).toBe(false);
    }
  });
});
