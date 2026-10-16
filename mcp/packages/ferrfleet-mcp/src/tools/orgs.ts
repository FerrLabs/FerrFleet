import { apiRequest, getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';

interface Org {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

export function registerOrgTools(server: McpServer) {
  server.tool(
    'list_ferrfleet_orgs',
    'List the organizations the authenticated user belongs to (id, name, slug, role). Pass the returned id as org_id on the other FerrFleet tools to choose which organization a call targets. The id is stable, so it can be reused for the rest of the conversation.',
    {},
    async () => {
      const token = await getToken();
      const orgs = await apiRequest<Org[]>('/orgs', { token });
      const summary = orgs.map(({ id, name, slug, role }) => ({
        id,
        name,
        slug,
        ...(role !== undefined && { role }),
      }));
      return {
        content: [{ type: 'text' as const, text: toToolText(summary) }],
      };
    },
  );
}
