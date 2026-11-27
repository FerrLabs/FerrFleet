import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSmoke } from '../smoke-run.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'root');

describe('runSmoke', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    log.mockClear();
    error.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 0 and prints a summary when every check passes', async () => {
    const code = await runSmoke(root, [
      { pkg: 'stub', serverName: 'stub', expectedTools: ['alpha'], expectedPrompts: ['review'] },
    ]);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith('Smoke: 4/4 OK across 1 servers');
    expect(error).not.toHaveBeenCalled();
  });

  it('returns 1 and reports failures when a check fails', async () => {
    const code = await runSmoke(root, [
      { pkg: 'stub', serverName: 'stub', expectedTools: ['gone'] },
    ]);
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[FAIL] stub: tools/list'));
    expect(error).toHaveBeenCalledWith('Smoke: 1/3 FAILED');
  });

  it('fails without spawning when the package has not been built', async () => {
    const code = await runSmoke(root, [
      { pkg: 'unbuilt', serverName: 'unbuilt', expectedTools: [] },
    ]);
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[FAIL] unbuilt: dist present'));
    expect(error).toHaveBeenCalledWith('Smoke: 1/1 FAILED');
  });
});
