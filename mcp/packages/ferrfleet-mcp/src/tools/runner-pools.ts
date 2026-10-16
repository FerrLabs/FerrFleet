import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { fleetRequest, orgIdSchema } from '../api-base.js';

export function registerRunnerPoolTools(server: McpServer) {
  server.tool(
    'list_runner_pools',
    'List the runner pools of the organization. Pass a pool id as runner_pool_id to update_agent to run an agent on that pool. Pools and their tokens are created and rotated in the FerrFleet UI only.',
    { org_id: orgIdSchema },
    async ({ org_id }) => {
      const token = await getToken();
      const pools = await fleetRequest<unknown>('/runner-pools', { token, orgId: org_id });
      return {
        content: [{ type: 'text' as const, text: toToolText(pools) }],
      };
    },
  );
}
