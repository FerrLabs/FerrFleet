import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@ferrlabs/mcp-core';
import { register } from '../register.js';

process.env.FERRLABS_API_TOKEN = 'test-token';

function collect() {
  const tools: string[] = [];
  const prompts: string[] = [];
  const server = {
    tool: vi.fn((name: string) => void tools.push(name)),
    prompt: vi.fn((name: string) => void prompts.push(name)),
  } as unknown as McpServer;
  register(server);
  return { tools, prompts };
}

describe('register', () => {
  it('registers every tool group exactly once', () => {
    const { tools } = collect();
    expect(new Set(tools).size).toBe(tools.length);
    expect(tools).toEqual(
      expect.arrayContaining([
        'list_agents',
        'list_runs',
        'list_connectors',
        'list_marketplace_agents',
        'list_runner_pools',
        'list_repo_bindings',
        'list_github_installations',
        'list_ferrfleet_orgs',
      ]),
    );
  });

  it('registers the review_run prompt', () => {
    expect(collect().prompts).toEqual(['review_run']);
  });
});
