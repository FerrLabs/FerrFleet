import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';
import { AGENT_ID_PATTERN } from './agents.js';

export function registerMarketplaceTools(server: McpServer) {
  server.tool(
    'list_marketplace_agents',
    'List the marketplace agent templates an organization can import, each flagged with whether the organization already has an agent under that id. Pass a template id to import_marketplace_agent.',
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      const templates = await fleetRequest<unknown>('/marketplace/agents', {
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(templates) }],
      };
    },
  );

  server.tool(
    'import_marketplace_agent',
    'Import a marketplace agent template into the organization as a regular agent. The import is a copy: later edits to the template never reach it. Fails with a conflict when the organization already has an agent under the resulting id; pass id to import it under another one.',
    {
      template_id: z.string().min(1).describe('Template id from list_marketplace_agents'),
      org_id: orgIdSchema,
      id: z
        .string()
        .regex(AGENT_ID_PATTERN)
        .optional()
        .describe(
          'Id for the new agent: lowercase letters, digits and hyphens, 2 to 64 characters; defaults to the template id',
        ),
      name: z
        .string()
        .min(1)
        .max(100)
        .optional()
        .describe('Display name; defaults to the template name'),
    },
    async ({ template_id, org_id, id, name }) => {
      const body = Object.fromEntries(
        Object.entries({ id, name }).filter(([, value]) => value !== undefined),
      );
      const token = await getToken();
      const agent = await fleetRequest<unknown>(
        `/marketplace/agents/${encodeURIComponent(template_id)}/import`,
        { token, orgId: org_id, method: 'POST', body },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(agent) }],
      };
    },
  );
}
