import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from '../mcp-client.js';

const stub = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stub-server.mjs');

describe('McpClient', () => {
  let client: McpClient | undefined;

  afterEach(() => {
    client?.dispose();
    client = undefined;
    vi.restoreAllMocks();
  });

  it('resolves a request with the matching response result', async () => {
    client = new McpClient(stub);
    const result = await client.rpc<{ tools: { name: string }[] }>('tools/list');
    expect(result.tools.map((t) => t.name)).toEqual(['alpha', 'beta']);
  });

  it('keeps concurrent requests apart by id', async () => {
    client = new McpClient(stub);
    const [tools, prompts] = await Promise.all([
      client.rpc<{ tools: unknown[] }>('tools/list'),
      client.rpc<{ prompts: unknown[] }>('prompts/list'),
    ]);
    expect(tools.tools).toHaveLength(2);
    expect(prompts.prompts).toHaveLength(1);
  });

  it('rejects when the server answers with an error', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    client = new McpClient(stub);
    await expect(client.rpc('fail')).rejects.toThrow('fail failed: nope');
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('non-JSON line from server: not json'),
    );
  });

  it('rejects when the server never answers', async () => {
    client = new McpClient(stub, 50);
    await expect(client.rpc('silent')).rejects.toThrow('timed out waiting for silent');
  });

  it('accepts notifications without expecting a response', async () => {
    client = new McpClient(stub);
    client.notify('notifications/initialized');
    await expect(client.rpc('initialize')).resolves.toMatchObject({ serverInfo: { name: 'stub' } });
  });
});
