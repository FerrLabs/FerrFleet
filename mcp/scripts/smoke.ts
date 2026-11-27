import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSmoke, type Target } from './smoke-run.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SERVERS: Target[] = [
  {
    pkg: 'ferrfleet-mcp',
    serverName: 'ferrfleet',
    expectedTools: ['list_agents', 'get_agent', 'trigger_agent_run', 'list_runs', 'get_run'],
    expectedPrompts: ['review_run'],
  },
];

try {
  process.exit(await runSmoke(root, SERVERS));
} catch (err: unknown) {
  console.error('Smoke aborted:', err instanceof Error ? err.message : err);
  process.exit(1);
}
