import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkServer, checkVersionFlag, type ServerUnderTest } from '../smoke-checks.js';

const stub = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stub-server.mjs');

const base: ServerUnderTest = { serverName: 'stub', expectedTools: ['alpha', 'beta'] };

const byName = (checks: { name: string }[], name: string) =>
  checks.find((c) => c.name === `stub: ${name}`);

describe('checkVersionFlag', () => {
  it('passes when the binary prints name and version', () => {
    expect(checkVersionFlag(base, stub, '1.2.3')).toMatchObject({ ok: true, detail: 'stub 1.2.3' });
  });

  it('fails with both values when the version differs', () => {
    expect(checkVersionFlag(base, stub, '9.9.9')).toMatchObject({
      ok: false,
      detail: "expected 'stub 9.9.9', got 'stub 1.2.3'",
    });
  });

  it('fails when the entry cannot run', () => {
    const check = checkVersionFlag(base, resolve(stub, '..', 'missing.mjs'), '1.2.3');
    expect(check.ok).toBe(false);
  });
});

describe('checkServer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes every check against a conforming server', async () => {
    const checks = await checkServer(
      {
        ...base,
        expectedPrompts: ['review'],
        expectedResourceTemplates: ['x://{id}'],
        liveCalls: [
          {
            tool: 'alpha',
            arguments: { a: 1 },
            check: (parsed) => (parsed as { echoed: { a: number } }).echoed.a === 1,
            describe: () => 'echoed',
          },
        ],
      },
      stub,
      '1.2.3',
    );
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.name)).toEqual([
      'stub: --version',
      'stub: initialize',
      'stub: tools/list',
      'stub: resources/templates/list',
      'stub: prompts/list',
      'stub: tools/call alpha',
    ]);
  });

  it('lists the missing tools, prompts and templates', async () => {
    const checks = await checkServer(
      {
        ...base,
        expectedTools: ['alpha', 'gamma'],
        expectedPrompts: ['other'],
        expectedResourceTemplates: ['y://{id}'],
      },
      stub,
      '1.2.3',
    );
    expect(byName(checks, 'tools/list')).toMatchObject({ ok: false, detail: 'missing: gamma' });
    expect(byName(checks, 'prompts/list')).toMatchObject({ ok: false, detail: 'missing: other' });
    expect(byName(checks, 'resources/templates/list')).toMatchObject({
      ok: false,
      detail: 'missing: y://{id}',
    });
  });

  it('fails initialize when the server reports another name', async () => {
    const checks = await checkServer({ ...base, serverName: 'other' }, stub, '1.2.3');
    expect(byName(checks, 'initialize')).toBeUndefined();
    expect(checks.find((c) => c.name === 'other: initialize')?.ok).toBe(false);
  });

  it('fails a live call that returns an error result', async () => {
    const checks = await checkServer(
      {
        ...base,
        liveCalls: [{ tool: 'broken', check: () => true, describe: () => 'unused' }],
      },
      stub,
      '1.2.3',
    );
    expect(byName(checks, 'tools/call broken')).toMatchObject({
      ok: false,
      detail: 'unexpected response: boom',
    });
  });

  it('fails a live call whose check rejects the parsed response', async () => {
    const checks = await checkServer(
      { ...base, liveCalls: [{ tool: 'alpha', check: () => false, describe: () => 'unused' }] },
      stub,
      '1.2.3',
    );
    expect(byName(checks, 'tools/call alpha')?.ok).toBe(false);
  });

  it('reports a boot failure when the server rejects a request', async () => {
    vi.stubEnv('STUB_FAIL', 'tools/list');
    const checks = await checkServer(base, stub, '1.2.3');
    expect(byName(checks, 'boot')).toMatchObject({ ok: false, detail: 'tools/list failed: nope' });
  });
});
