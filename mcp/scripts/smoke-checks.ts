import { execFileSync } from 'node:child_process';
import { McpClient, TIMEOUT_MS } from './mcp-client.js';

export interface ServerUnderTest {
  serverName: string;
  expectedTools: string[];
  liveCalls?: LiveCall[];
  expectedResourceTemplates?: string[];
  expectedPrompts?: string[];
}

interface LiveCall {
  tool: string;
  arguments?: Record<string, unknown>;
  check: (parsed: unknown) => boolean;
  describe: (parsed: unknown) => string;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface ToolResult {
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function checkVersionFlag(server: ServerUnderTest, entry: string, version: string): Check {
  const expected = `${server.serverName} ${version}`;
  const name = `${server.serverName}: --version`;
  try {
    const output = execFileSync(process.execPath, [entry, '--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
    }).trim();
    const ok = output === expected;
    return { name, ok, detail: ok ? output : `expected '${expected}', got '${output}'` };
  } catch (err) {
    return { name, ok: false, detail: errorMessage(err) };
  }
}

function checkAdvertised(
  server: ServerUnderTest,
  method: string,
  expected: string[],
  advertised: string[],
  noun: string,
): Check {
  const present = new Set(advertised);
  const missing = expected.filter((item) => !present.has(item));
  return {
    name: `${server.serverName}: ${method}`,
    ok: missing.length === 0,
    detail:
      missing.length === 0 ? `${advertised.length} ${noun}` : `missing: ${missing.join(', ')}`,
  };
}

async function checkLiveCall(
  client: McpClient,
  server: ServerUnderTest,
  call: LiveCall,
): Promise<Check> {
  const result = await client.rpc<ToolResult>('tools/call', {
    name: call.tool,
    arguments: call.arguments ?? {},
  });
  const text = result.content?.[0]?.text ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const ok = !result.isError && call.check(parsed);
  return {
    name: `${server.serverName}: tools/call ${call.tool}`,
    ok,
    detail: ok ? call.describe(parsed) : `unexpected response: ${text.slice(0, 120)}`,
  };
}

async function checkListings(client: McpClient, server: ServerUnderTest): Promise<Check[]> {
  const checks: Check[] = [];
  const list = await client.rpc<{ tools: { name: string }[] }>('tools/list');
  checks.push(
    checkAdvertised(
      server,
      'tools/list',
      server.expectedTools,
      list.tools.map((t) => t.name),
      'tools registered',
    ),
  );
  if (server.expectedResourceTemplates) {
    const listed = await client.rpc<{ resourceTemplates: { uriTemplate: string }[] }>(
      'resources/templates/list',
    );
    checks.push(
      checkAdvertised(
        server,
        'resources/templates/list',
        server.expectedResourceTemplates,
        listed.resourceTemplates.map((r) => r.uriTemplate),
        'templates advertised',
      ),
    );
  }
  if (server.expectedPrompts) {
    const listed = await client.rpc<{ prompts: { name: string }[] }>('prompts/list');
    checks.push(
      checkAdvertised(
        server,
        'prompts/list',
        server.expectedPrompts,
        listed.prompts.map((p) => p.name),
        'prompts advertised',
      ),
    );
  }
  return checks;
}

export async function checkServer(
  server: ServerUnderTest,
  entry: string,
  version: string,
): Promise<Check[]> {
  const checks = [checkVersionFlag(server, entry, version)];
  const client = new McpClient(entry);
  try {
    const init = await client.rpc<{ serverInfo: { name: string; version: string } }>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ferrlabs-mcp-smoke', version: '1.0.0' },
    });
    checks.push({
      name: `${server.serverName}: initialize`,
      ok: init.serverInfo.name === server.serverName,
      detail: `serverInfo: ${init.serverInfo.name}@${init.serverInfo.version}`,
    });
    client.notify('notifications/initialized');
    checks.push(...(await checkListings(client, server)));
    for (const call of server.liveCalls ?? []) {
      checks.push(await checkLiveCall(client, server, call));
    }
  } catch (err) {
    checks.push({ name: `${server.serverName}: boot`, ok: false, detail: errorMessage(err) });
  } finally {
    client.dispose();
  }
  return checks;
}
