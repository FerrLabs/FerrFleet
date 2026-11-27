import { vi, type Mock } from 'vitest';
import type { ZodTypeAny } from 'zod';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

type Handler = (
  params: Record<string, unknown>,
) => Promise<{ isError?: boolean; content: { text?: string }[] }>;

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

export const handlers = new Map<string, Handler>();
export const schemas = new Map<string, Record<string, ZodTypeAny>>();

export const mockServer = {
  tool: vi.fn(
    (name: string, _desc: string, schema: Record<string, ZodTypeAny>, handler: Handler) => {
      handlers.set(name, handler);
      schemas.set(name, schema);
    },
  ),
} as unknown as McpServer;

export const mockFetch: Mock = vi.fn();
vi.stubGlobal('fetch', mockFetch);

export function callAt(index: number): RecordedCall {
  const [url, init] = mockFetch.mock.calls[index];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
  };
}

export const headersAt = (index: number): Record<string, string> =>
  mockFetch.mock.calls[index][1].headers;

export const lastCall = (): RecordedCall => callAt(0);
