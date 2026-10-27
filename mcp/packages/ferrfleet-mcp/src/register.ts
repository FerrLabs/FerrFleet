import type { McpServer } from '@ferrlabs/mcp-core';
import { registerAgentTools } from './tools/agents.js';
import { registerConnectorTools } from './tools/connectors.js';
import { registerEventRuleTools } from './tools/event-rules.js';
import { registerGithubTools } from './tools/github.js';
import { registerMarketplaceTools } from './tools/marketplace.js';
import { registerOrgTools } from './tools/orgs.js';
import { registerRepoTools } from './tools/repos.js';
import { registerRunnerPoolTools } from './tools/runner-pools.js';
import { registerRunTools } from './tools/runs.js';
import { registerWorkflowTools } from './tools/workflows.js';
import { registerRunReviewPrompt } from './prompts/run-review.js';

export function register(server: McpServer): void {
  registerAgentTools(server);
  registerConnectorTools(server);
  registerEventRuleTools(server);
  registerGithubTools(server);
  registerMarketplaceTools(server);
  registerOrgTools(server);
  registerRepoTools(server);
  registerRunnerPoolTools(server);
  registerRunTools(server);
  registerWorkflowTools(server);
  registerRunReviewPrompt(server);
}
