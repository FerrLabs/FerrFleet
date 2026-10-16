import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ZodTypeAny } from 'zod';
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

function ok(body: unknown = { id: 'run-1', status: 'queued' }): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function lastCall(): {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
} {
  const [url, init] = mockFetch.mock.calls[0];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
    headers: init.headers as Record<string, string>,
  };
}

const FLEET = 'https://api.ferrfleet.com';
const ORG_ID = '3f0c6a52-8d1e-4b7a-9c2f-5e6d7a8b9c01';
const POOL_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const ENV_ORG_ID = '7a1d9e34-2b5c-4f80-8e6a-1c3b5d7f9a02';

describe('ferrfleet tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    schemas.clear();
    mockFetch.mockResolvedValue(ok());
    const { registerAgentTools } = await import('../agents.js');
    const { registerRunTools } = await import('../runs.js');
    const { registerOrgTools } = await import('../orgs.js');
    const { registerRunnerPoolTools } = await import('../runner-pools.js');
    registerAgentTools(mockServer);
    registerRunTools(mockServer);
    registerOrgTools(mockServer);
    const { registerRepoTools } = await import('../repos.js');
    const { registerGithubTools } = await import('../github.js');
    registerRunnerPoolTools(mockServer);
    registerRepoTools(mockServer);
    registerGithubTools(mockServer);
    const { registerMarketplaceTools } = await import('../marketplace.js');
    const { registerConnectorTools } = await import('../connectors.js');
    registerMarketplaceTools(mockServer);
    registerConnectorTools(mockServer);
  });

  it('every call goes to the FerrFleet API', async () => {
    await handlers.get('list_agents')!({});
    expect(lastCall().url.startsWith(FLEET)).toBe(true);
    expect(lastCall().url).not.toContain('api.ferrlabs.com');
  });

  it('negotiates the contract by date header, since the API has no version prefix', async () => {
    await handlers.get('list_agents')!({});

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/agents`);
    expect(call.url).not.toContain('/v1/');
    expect(call.headers['x-ferrfleet-api-version']).toBe('2026-08-04');
  });

  it('trigger_agent_run posts to the agent runs collection', async () => {
    await handlers.get('trigger_agent_run')!({ agent_id: 'a1', reason: 'nightly' });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/agents/a1/runs`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ input: {}, reason: 'nightly' });
  });

  it('trigger_agent_run defaults input and reason rather than omitting them', async () => {
    await handlers.get('trigger_agent_run')!({ agent_id: 'a1' });
    expect(lastCall().body).toEqual({ input: {}, reason: null });
  });

  it('get_run_transcript reads the transcript sub-resource', async () => {
    await handlers.get('get_run_transcript')!({ run_id: 'run-9' });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/runs/run-9/transcript`);
    expect(call.method).toBe('GET');
  });

  it('list_runs passes limit as a query parameter, not a path segment', async () => {
    await handlers.get('list_runs')!({ limit: 10 });
    expect(lastCall().url).toBe(`${FLEET}/runs?limit=10`);
  });

  it('list_runs omits the query string entirely when no limit is given', async () => {
    await handlers.get('list_runs')!({});
    expect(lastCall().url).toBe(`${FLEET}/runs`);
  });

  it('escapes an agent id so it cannot climb the path', async () => {
    await handlers.get('get_agent')!({ agent_id: '../runs' });
    expect(lastCall().url).toBe(`${FLEET}/agents/..%2Fruns`);
  });

  it('rejects a run limit outside the declared bounds', () => {
    const limit = schemas.get('list_runs')!.limit;
    expect(limit.safeParse(25).success).toBe(true);
    expect(limit.safeParse(0).success).toBe(false);
    expect(limit.safeParse(101).success).toBe(false);
  });

  it('create_agent posts only the fields given', async () => {
    await handlers.get('create_agent')!({
      id: 'triage-bot',
      name: 'Triage bot',
      prompt: 'Triage issues',
      org_id: ORG_ID,
    });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/agents`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ id: 'triage-bot', name: 'Triage bot', prompt: 'Triage issues' });
  });

  it('create_agent forwards the optional fields', async () => {
    const params = {
      id: 'triage-bot',
      name: 'Triage bot',
      prompt: 'Triage issues',
      additional_prompt: 'Be brief',
      model: 'sonnet',
      working_dir: '/repo',
      description: 'Triages',
      notify_url: 'https://example.com/hook',
    };
    await handlers.get('create_agent')!(params);
    expect(lastCall().body).toEqual(params);
  });

  it('create_agent requires id, name and prompt', () => {
    const shape = schemas.get('create_agent')!;
    expect(shape.id.safeParse(undefined).success).toBe(false);
    expect(shape.name.safeParse(undefined).success).toBe(false);
    expect(shape.prompt.safeParse(undefined).success).toBe(false);
    expect(shape.model.safeParse(undefined).success).toBe(true);
  });

  it('create_agent only accepts ids the API accepts', () => {
    const id = schemas.get('create_agent')!.id;
    expect(id.safeParse('triage-bot').success).toBe(true);
    expect(id.safeParse('ab').success).toBe(true);
    expect(id.safeParse('Triage').success).toBe(false);
    expect(id.safeParse('a').success).toBe(false);
    expect(id.safeParse('-bot').success).toBe(false);
    expect(id.safeParse('bot-').success).toBe(false);
    expect(id.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('create_agent exposes no fields the API ignores', () => {
    const keys = Object.keys(schemas.get('create_agent')!);
    expect(keys).not.toContain('runner_mode');
    expect(keys).not.toContain('enabled');
    expect(keys).not.toContain('options');
  });

  it('update_agent patches the agent with only the fields given', async () => {
    await handlers.get('update_agent')!({ agent_id: 'a1', runner_mode: 'external' });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/agents/a1`);
    expect(call.method).toBe('PATCH');
    expect(call.body).toEqual({ runner_mode: 'external' });
  });

  it('update_agent keeps falsy values that are real changes', async () => {
    await handlers.get('update_agent')!({
      agent_id: 'a1',
      enabled: false,
      model: '',
      additional_prompt: '',
    });
    expect(lastCall().body).toEqual({ enabled: false, model: '', additional_prompt: '' });
  });

  it('update_agent refuses an empty update without calling the API', async () => {
    const result = await handlers.get('update_agent')!({ agent_id: 'a1' });

    expect(result).toMatchObject({ isError: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('update_agent only accepts the runner modes the API knows', () => {
    const mode = schemas.get('update_agent')!.runner_mode;
    expect(mode.safeParse('managed').success).toBe(true);
    expect(mode.safeParse('external').success).toBe(true);
    expect(mode.safeParse('hybrid').success).toBe(false);
    expect(mode.safeParse('External').success).toBe(false);
  });

  it('update_agent sets the runner pool by id', async () => {
    await handlers.get('update_agent')!({ agent_id: 'a1', runner_pool_id: POOL_ID });
    expect(lastCall().body).toEqual({ runner_pool_id: POOL_ID });
  });

  it('update_agent sends a null runner_pool_id to detach the pool', async () => {
    await handlers.get('update_agent')!({ agent_id: 'a1', runner_pool_id: null });
    expect(lastCall().body).toEqual({ runner_pool_id: null });
    expect(lastCall().body).toHaveProperty('runner_pool_id', null);
  });

  it('update_agent leaves runner_pool_id out of the body when omitted', async () => {
    await handlers.get('update_agent')!({ agent_id: 'a1', enabled: true });
    expect(lastCall().body).not.toHaveProperty('runner_pool_id');
  });

  it('update_agent accepts a pool change as the only field', async () => {
    const result = await handlers.get('update_agent')!({ agent_id: 'a1', runner_pool_id: null });
    expect(result.isError).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('update_agent only accepts a uuid or null as runner_pool_id', () => {
    const pool = schemas.get('update_agent')!.runner_pool_id;
    expect(pool.safeParse(POOL_ID).success).toBe(true);
    expect(pool.safeParse(null).success).toBe(true);
    expect(pool.safeParse(undefined).success).toBe(true);
    expect(pool.safeParse('default').success).toBe(false);
    expect(pool.safeParse('').success).toBe(false);
  });

  it('list_runner_pools reads the runner pool collection and returns it unchanged', async () => {
    const pools = [{ id: POOL_ID, name: 'build-farm', status: 'active' }];
    mockFetch.mockResolvedValue(ok(pools));
    const result = await handlers.get('list_runner_pools')!({});

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/runner-pools`);
    expect(call.method).toBe('GET');
    expect(JSON.parse(result.content[0].text!)).toEqual(pools);
  });

  it('exposes no tool that creates or rotates a pool token', () => {
    const names = [...handlers.keys()].filter((name) => /pool|token/.test(name));
    expect(names).toEqual(['list_runner_pools']);
  });

  it('bind_repo upserts the binding with the repository and agent', async () => {
    await handlers.get('bind_repo')!({
      repo_full_name: 'IdleWarden/idlewarden',
      agent_id: 'pr-review',
    });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/repos/bindings`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ repo_full_name: 'IdleWarden/idlewarden', agent_id: 'pr-review' });
  });

  it('bind_repo keeps enabled=false so a binding can be switched off', async () => {
    await handlers.get('bind_repo')!({
      repo_full_name: 'IdleWarden/idlewarden',
      agent_id: 'pr-review',
      enabled: false,
    });
    expect(lastCall().body).toEqual({
      repo_full_name: 'IdleWarden/idlewarden',
      agent_id: 'pr-review',
      enabled: false,
    });
  });

  it('bind_repo only accepts owner/name repositories', () => {
    const repo = schemas.get('bind_repo')!.repo_full_name;
    expect(repo.safeParse('IdleWarden/idlewarden').success).toBe(true);
    expect(repo.safeParse('idlewarden').success).toBe(false);
    expect(repo.safeParse('a/b/c').success).toBe(false);
    expect(repo.safeParse('../agents').success).toBe(false);
  });

  it('list_repo_bindings reads the bindings collection', async () => {
    mockFetch.mockResolvedValue(ok([]));
    await handlers.get('list_repo_bindings')!({});

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/repos/bindings`);
    expect(call.method).toBe('GET');
  });

  it('create_github_connector posts a github connector with only the name', async () => {
    await handlers.get('create_github_connector')!({ name: 'github' });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/connectors`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ type: 'github', name: 'github' });
  });

  it('create_github_connector only accepts names the API accepts', () => {
    const name = schemas.get('create_github_connector')!.name;
    expect(name.safeParse('github').success).toBe(true);
    expect(name.safeParse('').success).toBe(false);
    expect(name.safeParse('-github').success).toBe(false);
    expect(name.safeParse('a/b').success).toBe(false);
  });

  it('list_github_installations reads the installations collection', async () => {
    mockFetch.mockResolvedValue(ok([]));
    await handlers.get('list_github_installations')!({});

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/github/installations`);
    expect(call.method).toBe('GET');
  });

  it('update_agent escapes the agent id', async () => {
    await handlers.get('update_agent')!({ agent_id: '../runs', enabled: true });
    expect(lastCall().url).toBe(`${FLEET}/agents/..%2Fruns`);
  });

  it('list_marketplace_agents reads the catalog and returns it unchanged', async () => {
    const templates = [{ id: 'pr-review', name: 'PR review', imported: false }];
    mockFetch.mockResolvedValue(ok(templates));
    const result = await handlers.get('list_marketplace_agents')!({});

    expect(lastCall().url).toBe(`${FLEET}/marketplace/agents`);
    expect(lastCall().method).toBe('GET');
    expect(JSON.parse(result.content[0].text!)).toEqual(templates);
  });

  it('import_marketplace_agent escapes the template id and sends an empty body by default', async () => {
    await handlers.get('import_marketplace_agent')!({ template_id: '../agents' });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/marketplace/agents/..%2Fagents/import`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({});
  });

  it('import_marketplace_agent sends only the overrides given', async () => {
    await handlers.get('import_marketplace_agent')!({ template_id: 'pr-review', name: 'Mine' });
    expect(lastCall().body).toEqual({ name: 'Mine' });

    mockFetch.mockClear();
    await handlers.get('import_marketplace_agent')!({ template_id: 'pr-review', id: 'my-pr' });
    expect(lastCall().body).toEqual({ id: 'my-pr' });
  });

  it('import_marketplace_agent only accepts ids the API accepts for agents', () => {
    const id = schemas.get('import_marketplace_agent')!.id;
    expect(id.safeParse('my-pr-agent').success).toBe(true);
    expect(id.safeParse('My_Agent').success).toBe(false);
    expect(id.safeParse('-bad').success).toBe(false);
    expect(id.safeParse('a').success).toBe(false);
    expect(id.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('list_connectors reads the connector collection', async () => {
    const connectors = [{ id: 'c1', type: 'github', name: 'Gh', has_secret: true }];
    mockFetch.mockResolvedValue(ok(connectors));
    const result = await handlers.get('list_connectors')!({});

    expect(lastCall().url).toBe(`${FLEET}/connectors`);
    expect(lastCall().method).toBe('GET');
    expect(JSON.parse(result.content[0].text!)).toEqual(connectors);
  });

  it('set_agent_connectors puts exactly the given list and escapes the agent id', async () => {
    await handlers.get('set_agent_connectors')!({
      agent_id: '../runs',
      connector_ids: ['c1', 'c2'],
    });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/agents/..%2Fruns/connectors`);
    expect(call.method).toBe('PUT');
    expect(call.body).toEqual({ connector_ids: ['c1', 'c2'] });
  });

  it('set_agent_connectors sends an empty list to detach everything', async () => {
    await handlers.get('set_agent_connectors')!({ agent_id: 'a1', connector_ids: [] });
    expect(lastCall().body).toEqual({ connector_ids: [] });
  });

  it('set_agent_connectors requires the list and rejects empty ids', () => {
    const ids = schemas.get('set_agent_connectors')!.connector_ids;
    expect(ids.safeParse(undefined).success).toBe(false);
    expect(ids.safeParse(['']).success).toBe(false);
    expect(ids.safeParse(['c1']).success).toBe(true);
  });

  it('update_connector patches with only the fields given', async () => {
    await handlers.get('update_connector')!({ connector_id: 'c1', name: 'Renamed' });

    const call = lastCall();
    expect(call.url).toBe(`${FLEET}/connectors/c1`);
    expect(call.method).toBe('PATCH');
    expect(call.body).toEqual({ name: 'Renamed' });
  });

  it('update_connector sends config as given, without merging it client side', async () => {
    await handlers.get('update_connector')!({ connector_id: 'c1', config: { url: 'https://x' } });
    expect(lastCall().body).toEqual({ config: { url: 'https://x' } });
  });

  it('update_connector refuses an empty update without calling the API', async () => {
    const result = await handlers.get('update_connector')!({ connector_id: 'c1' });
    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('update_connector escapes the connector id', async () => {
    await handlers.get('update_connector')!({ connector_id: '../agents', name: 'x' });
    expect(lastCall().url).toBe(`${FLEET}/connectors/..%2Fagents`);
  });

  it('update_connector does not expose the secret', async () => {
    expect(Object.keys(schemas.get('update_connector')!)).not.toContain('secret');
    await handlers.get('update_connector')!({ connector_id: 'c1', name: 'x', secret: 'hunter2' });
    expect(lastCall().body).toEqual({ name: 'x' });
  });

  it('update_connector only accepts names the API accepts', () => {
    const name = schemas.get('update_connector')!.name;
    expect(name.safeParse('GitHub main_1').success).toBe(true);
    expect(name.safeParse('').success).toBe(false);
    expect(name.safeParse(' lead').success).toBe(false);
    expect(name.safeParse('a'.repeat(64)).success).toBe(false);
  });

  it('update_connector only accepts an object as config', () => {
    const config = schemas.get('update_connector')!.config;
    expect(config.safeParse('x').success).toBe(false);
    expect(config.safeParse(['a']).success).toBe(false);
  });

  describe('org selection', () => {
    afterEach(() => {
      delete process.env.FERRFLEET_ORG_ID;
    });

    const CALLS: readonly (readonly [string, Record<string, unknown>])[] = [
      ['list_agents', {}],
      ['get_agent', { agent_id: 'a1' }],
      ['trigger_agent_run', { agent_id: 'a1' }],
      ['create_agent', { id: 'bot', name: 'Bot', prompt: 'Go' }],
      ['update_agent', { agent_id: 'a1', enabled: true }],
      ['list_runner_pools', {}],
      ['list_marketplace_agents', {}],
      ['import_marketplace_agent', { template_id: 't1' }],
      ['list_connectors', {}],
      ['set_agent_connectors', { agent_id: 'a1', connector_ids: [] }],
      ['update_connector', { connector_id: 'c1', name: 'Gh' }],
      ['list_runs', {}],
      ['get_run', { run_id: 'r1' }],
      ['get_run_transcript', { run_id: 'r1' }],
    ];

    it.each(CALLS)('%s sends the org_id param as x-ferrfleet-org', async (name, params) => {
      await handlers.get(name)!({ ...params, org_id: ORG_ID });
      expect(lastCall().headers['x-ferrfleet-org']).toBe(ORG_ID);
    });

    it.each(CALLS)('%s declares an optional uuid org_id', (name) => {
      const orgId = schemas.get(name)!.org_id;
      expect(orgId.safeParse(undefined).success).toBe(true);
      expect(orgId.safeParse(ORG_ID).success).toBe(true);
      expect(orgId.safeParse('nope').success).toBe(false);
    });

    it.each(CALLS)('%s accepts the non RFC 4122 ids FerrLabs issues', (name) => {
      const orgId = schemas.get(name)!.org_id;
      expect(orgId.safeParse('019ddfca-92ba-e1e5-2a5d-7602d4b77ae6').success).toBe(true);
    });

    it('org_id is not forwarded in the update_agent body', async () => {
      await handlers.get('update_agent')!({ agent_id: 'a1', enabled: true, org_id: ORG_ID });
      expect(lastCall().body).toEqual({ enabled: true });
    });

    it('org_id param overrides FERRFLEET_ORG_ID', async () => {
      process.env.FERRFLEET_ORG_ID = ENV_ORG_ID;
      await handlers.get('list_agents')!({ org_id: ORG_ID });
      expect(lastCall().headers['x-ferrfleet-org']).toBe(ORG_ID);
    });

    it('falls back to FERRFLEET_ORG_ID when org_id is absent', async () => {
      process.env.FERRFLEET_ORG_ID = ENV_ORG_ID;
      await handlers.get('list_agents')!({});
      expect(lastCall().headers['x-ferrfleet-org']).toBe(ENV_ORG_ID);
    });

    it('sends no org header when neither is set', async () => {
      await handlers.get('list_agents')!({});
      expect(lastCall().headers).not.toHaveProperty('x-ferrfleet-org');
    });

    it('rejects an invalid org_id before any fetch', async () => {
      await expect(handlers.get('list_agents')!({ org_id: 'nope' })).rejects.toThrow(/org_id/);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('list_ferrfleet_orgs', () => {
    it('reads /orgs from the identity API, not FerrFleet, with no org header', async () => {
      process.env.FERRFLEET_ORG_ID = ENV_ORG_ID;
      mockFetch.mockResolvedValue(ok([]));
      await handlers.get('list_ferrfleet_orgs')!({});

      const call = lastCall();
      expect(call.method).toBe('GET');
      expect(new URL(call.url).pathname).toMatch(/\/orgs$/);
      expect(call.url.startsWith(FLEET)).toBe(false);
      expect(call.headers).not.toHaveProperty('x-ferrfleet-org');
      delete process.env.FERRFLEET_ORG_ID;
    });

    it('returns id, name, slug and role only', async () => {
      mockFetch.mockResolvedValue(
        ok([
          { id: ORG_ID, name: 'Acme', slug: 'acme', role: 'admin', member_count: 3 },
          { id: ENV_ORG_ID, name: 'Beta', slug: 'beta', member_count: 1 },
        ]),
      );
      const result = await handlers.get('list_ferrfleet_orgs')!({});

      expect(JSON.parse(result.content[0].text!)).toEqual([
        { id: ORG_ID, name: 'Acme', slug: 'acme', role: 'admin' },
        { id: ENV_ORG_ID, name: 'Beta', slug: 'beta' },
      ]);
    });
  });
});
