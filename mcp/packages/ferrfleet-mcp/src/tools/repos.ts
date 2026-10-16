import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';

const REPO_FULL_NAME_PATTERN = /^(?!\.+\/)[A-Za-z0-9_.-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;

export function registerRepoTools(server: McpServer) {
  server.tool(
    'list_repo_bindings',
    'List the repositories bound to FerrFleet agents. A runner pool token can only dispatch an agent on a repository bound to that agent.',
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      const bindings = await fleetRequest<unknown>('/repos/bindings', { token, orgId: org_id });
      return {
        content: [{ type: 'text' as const, text: toToolText(bindings) }],
      };
    },
  );

  server.tool(
    'bind_repo',
    'Bind a GitHub repository to an agent, or disable an existing binding. Requires the organization to have a GitHub connector with the repository reachable.',
    {
      repo_full_name: z.string().regex(REPO_FULL_NAME_PATTERN).describe('Repository as owner/name'),
      agent_id: z.string().min(1).describe('Agent id'),
      enabled: z.boolean().optional().describe('Defaults to true; false disables the binding'),
      org_id: orgIdSchema,
    },
    async ({ repo_full_name, agent_id, enabled, org_id }) => {
      const token = await getToken();
      const binding = await fleetRequest<unknown>('/repos/bindings', {
        method: 'POST',
        body: { repo_full_name, agent_id, ...(enabled === undefined ? {} : { enabled }) },
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(binding) }],
      };
    },
  );
}
