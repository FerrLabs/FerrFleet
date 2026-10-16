import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';

const CONNECTOR_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,62}$/;

export function registerGithubTools(server: McpServer) {
  server.tool(
    'list_github_installations',
    'List the GitHub App installations claimed by the organization.',
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      const installations = await fleetRequest<unknown>('/github/installations', {
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(installations) }],
      };
    },
  );

  server.tool(
    'create_github_connector',
    'Create the GitHub connector of the organization, which repository bindings require. Orphaned installations of the organization are attached to it.',
    {
      name: z.string().regex(CONNECTOR_NAME_PATTERN).describe('Connector name'),
      org_id: orgIdSchema,
    },
    async ({ name, org_id }) => {
      const token = await getToken();
      const connector = await fleetRequest<unknown>('/connectors', {
        method: 'POST',
        body: { type: 'github', name },
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(connector) }],
      };
    },
  );
}
