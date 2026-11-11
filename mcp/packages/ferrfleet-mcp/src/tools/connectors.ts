import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';

const CONNECTOR_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,62}$/;

export function registerConnectorTools(server: McpServer) {
  server.tool(
    'list_connectors',
    'List the connectors of the organization (id, type, name, config, whether a secret is set). Secrets are never returned. Pass connector ids to set_agent_connectors.',
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      const connectors = await fleetRequest<unknown>('/connectors', { token, orgId: org_id });
      return {
        content: [{ type: 'text' as const, text: toToolText(connectors) }],
      };
    },
  );

  server.tool(
    'create_connector',
    'Create a connector of any type the API accepts (github, custom, ferrtrack, ferrvault, ferrgrowth, playwright, gitlab, forgejo, jira, linear). The config shape depends on the type; for custom it is the http transport: url, headers, secret_header. The secret is optional and can be set later in the UI; it is never returned, only has_secret.',
    {
      type: z.string().min(1).describe('Connector type, for example custom'),
      name: z
        .string()
        .regex(CONNECTOR_NAME_PATTERN)
        .describe('Display name: letters, digits, spaces, underscores and hyphens, up to 63 chars'),
      config: z.record(z.string(), z.unknown()).optional().describe('Type specific config object'),
      secret: z
        .string()
        .min(1)
        .optional()
        .describe('Secret such as an API token; omit it to set it later in the UI'),
      org_id: orgIdSchema,
    },
    async ({ type, name, config, secret, org_id }) => {
      const token = await getToken();
      const connector = await fleetRequest<unknown>('/connectors', {
        method: 'POST',
        body: { type, name, config, secret },
        token,
        orgId: org_id,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(connector) }],
      };
    },
  );

  server.tool(
    'set_agent_connectors',
    "Set the connectors attached to an agent. This REPLACES the agent's whole connector list: connectors not in connector_ids are detached, and an empty list detaches all of them. Every id must be a connector of the organization (see list_connectors).",
    {
      agent_id: z.string().min(1).describe('Agent id'),
      org_id: orgIdSchema,
      connector_ids: z
        .array(z.string().min(1))
        .describe('The full list of connector ids the agent should have afterwards'),
    },
    async ({ agent_id, org_id, connector_ids }) => {
      const token = await getToken();
      await fleetRequest<unknown>(`/agents/${encodeURIComponent(agent_id)}/connectors`, {
        token,
        orgId: org_id,
        method: 'PUT',
        body: { connector_ids },
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Agent ${agent_id} now has ${connector_ids.length} connector(s).`,
          },
        ],
      };
    },
  );

  server.tool(
    'update_connector',
    "Update a FerrFleet connector's name or config. Only the fields you pass change; at least one is required. config REPLACES the whole config object, it is not merged with the existing one. Secrets cannot be changed through this server.",
    {
      connector_id: z.string().min(1).describe('Connector id'),
      org_id: orgIdSchema,
      name: z
        .string()
        .regex(CONNECTOR_NAME_PATTERN)
        .optional()
        .describe('Display name: letters, digits, spaces, underscores and hyphens, up to 63 chars'),
      config: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Replaces the whole config object; it is not merged with the existing one'),
    },
    async ({ connector_id, org_id, name, config }) => {
      const body = Object.fromEntries(
        Object.entries({ name, config }).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(body).length === 0) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: 'update_connector needs at least one field to change.' },
          ],
        };
      }
      const token = await getToken();
      const connector = await fleetRequest<unknown>(
        `/connectors/${encodeURIComponent(connector_id)}`,
        { token, orgId: org_id, method: 'PATCH', body },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(connector) }],
      };
    },
  );
}
