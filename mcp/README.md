# FerrFleet MCP

FerrFleet as Model Context Protocol server, so an AI assistant can drive it.

[![npm @ferrfleet/mcp](https://img.shields.io/npm/v/@ferrfleet/mcp)](https://www.npmjs.com/package/@ferrfleet/mcp)

## Quick start

Add to your MCP client configuration (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "ferrfleet": { "command": "npx", "args": ["-y", "@ferrfleet/mcp"] }
  }
}
```

The first tool call that needs auth opens a browser for an OAuth loopback flow and saves the token. To skip it (CI, headless), set `FERRLABS_API_TOKEN`. Details in the [FerrLabs MCP README](https://github.com/FerrLabs/FerrLabs/blob/main/packages/mcp/README.md#how-auth-resolution-works).

## Tools

Tools marked **destructive** are irreversible or high-impact. MCP clients should gate them behind a confirmation.

### `@ferrfleet/mcp`

Every tool except `list_ferrfleet_orgs` takes an optional `org_id` (UUID) that selects the organization for that call, sent as `x-ferrfleet-org`. It overrides `FERRFLEET_ORG_ID`.

| Tool                                                   | Notes                                                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_agents`, `get_agent`                             | read                                                                                                                                                                    |
| `list_runs`, `get_run`, `get_run_transcript`           | read                                                                                                                                                                    |
| `trigger_agent_run`                                    | **destructive**, executes an agent and spends run quota                                                                                                                 |
| `create_agent`                                         | takes `id` (slug), `name`, `prompt`; options and runner mode via `update_agent`                                                                                         |
| `update_agent`                                         | `runner_mode=external` stops FerrFleet starting the agent itself; `runner_pool_id` (pool id or `null`) moves its runs to a runner pool or back to the FerrFleet cluster |
| `list_runner_pools`                                    | read; pools and their tokens are created and rotated in the FerrFleet UI only                                                                                           |
| `list_marketplace_agents`, `import_marketplace_agent`  | marketplace templates; import copies one into the org as a regular agent, optionally under another `id` or `name`                                                       |
| `list_connectors`, `update_connector`                  | read; update changes `name` or `config` (replaces the whole object); secrets never go through this server                                                               |
| `set_agent_connectors`                                 | replaces the agent's whole connector list; `connector_ids: []` detaches all                                                                                             |
| `list_repo_bindings`, `bind_repo`                      | repositories bound to agents; a pool token can only dispatch an agent on a bound repository                                                                             |
| `list_github_installations`, `create_github_connector` | GitHub App installations claimed by the org; the connector repository bindings require                                                                                  |
| `list_ferrfleet_orgs`                                  | read, returns the `org_id` to pass to the other tools                                                                                                                   |

## Resources and prompts

| Kind   | Name         | What it does                                                                                                      |
| ------ | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Prompt | `review_run` | reads a run and reports what it did, what it changed outside its workspace, and whether the result can be trusted |

## Configuration

| Variable                | Description                                                                                                                                      | Default                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `FERRFLEET_API_URL`     | Base URL for the FerrFleet API (`@ferrfleet/mcp`).                                                                                               | `https://api.ferrfleet.com` |
| `FERRFLEET_API_VERSION` | Contract version sent as `x-ferrfleet-api-version` by `@ferrfleet/mcp`.                                                                          | `2026-08-04`                |
| `FERRFLEET_ORG_ID`      | Default organization UUID sent as `x-ferrfleet-org` by `@ferrfleet/mcp` when a tool call has no `org_id`. Must be a UUID; unset sends no header. |                             |

Shared variables (token, OAuth, host allowlist, HTTP transport, output cap) are read by [`@ferrlabs/mcp-core`](https://github.com/FerrLabs/FerrLabs/tree/main/packages/mcp-core) and documented in the [FerrLabs MCP README](https://github.com/FerrLabs/FerrLabs/blob/main/packages/mcp/README.md#configuration).

## Development

```bash
cd mcp
pnpm install
pnpm build
pnpm test
pnpm smoke
```

`pnpm smoke` boots each server over stdio and checks the handshake and the advertised tools.

## License

Mozilla Public License 2.0, see [LICENSE](../LICENSE).
