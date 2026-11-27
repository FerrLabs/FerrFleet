import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkServer, type Check, type ServerUnderTest } from './smoke-checks.js';

export interface Target extends ServerUnderTest {
  pkg: string;
}

async function checkTarget(root: string, server: Target): Promise<Check[]> {
  const pkgDir = resolve(root, 'packages', server.pkg);
  const entry = resolve(pkgDir, 'dist', 'index.js');
  if (!existsSync(entry)) {
    return [
      {
        name: `${server.serverName}: dist present`,
        ok: false,
        detail: `${entry} missing, run 'pnpm build' first`,
      },
    ];
  }
  const { version } = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  return checkServer(server, entry, version);
}

export async function runSmoke(root: string, servers: Target[]): Promise<number> {
  const checks: Check[] = [];
  for (const server of servers) {
    checks.push(...(await checkTarget(root, server)));
  }
  for (const c of checks) {
    console.log(`[${c.ok ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log('');
  if (failed === 0) {
    console.log(`Smoke: ${checks.length}/${checks.length} OK across ${servers.length} servers`);
    return 0;
  }
  console.error(`Smoke: ${failed}/${checks.length} FAILED`);
  return 1;
}
