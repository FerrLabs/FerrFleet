import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runMcp = vi.fn();
vi.mock('@ferrlabs/mcp-core', () => ({
  runMcp,
  readPackageVersion: () => '9.9.9',
}));

describe('entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    runMcp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the server under the ferrfleet name with the package version', async () => {
    runMcp.mockResolvedValue(undefined);
    await import('../index.js');
    const { register } = await import('../register.js');
    expect(runMcp).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ferrfleet', version: '9.9.9', register }),
    );
  });

  it('logs the failure and exits 1 when the server crashes', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runMcp.mockRejectedValue(new Error('boom'));
    await import('../index.js');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(error).toHaveBeenCalledWith('ferrfleet-mcp fatal:', 'boom');
  });

  it('stringifies a non-Error failure', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runMcp.mockRejectedValue('plain');
    await import('../index.js');
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('ferrfleet-mcp fatal:', 'plain'));
  });
});
