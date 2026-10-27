import { toToolText } from '@ferrlabs/mcp-core';

export function reply(value: unknown) {
  return { content: [{ type: 'text' as const, text: toToolText(value) }] };
}
