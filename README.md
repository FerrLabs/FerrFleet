<div align="center">

<h1><img src=".github/logo.svg" alt="" width="48" height="48" align="absmiddle"> FerrFleet</h1>

**Drive FerrFleet agents, runs and workflows from an AI assistant.**

MCP server for [FerrFleet](https://ferrlabs.com), the service that runs Claude agents against your repositories.

[![npm @ferrfleet/mcp](https://img.shields.io/npm/v/@ferrfleet/mcp)](https://www.npmjs.com/package/@ferrfleet/mcp)
[![CI](https://github.com/FerrLabs/FerrFleet/actions/workflows/ci.yml/badge.svg)](https://github.com/FerrLabs/FerrFleet/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/FerrLabs/FerrFleet)](LICENSE)

[MCP server](mcp/README.md) | [npm](https://www.npmjs.com/package/@ferrfleet/mcp) | [FerrLabs](https://ferrlabs.com)

</div>

## What is in this repository

This repository holds the open source parts of FerrFleet. For now that is the MCP server in [`mcp/`](mcp), published to npm as [`@ferrfleet/mcp`](https://www.npmjs.com/package/@ferrfleet/mcp). The product itself lives in [FerrFleet-Cloud](https://github.com/FerrLabs/FerrFleet-Cloud).

## MCP server

Tools cover agents (list, create, update, trigger a run), runs and their transcripts, workflows, event rules, connectors, repository bindings, GitHub installations, runner pools and the agent marketplace. Tools that execute work or delete things are marked destructive so clients can ask for confirmation. A `review_run` prompt reads a run and reports what it did.

### Install

Add it to your MCP client configuration (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "ferrfleet": { "command": "npx", "args": ["-y", "@ferrfleet/mcp"] }
  }
}
```

The first tool call that needs auth opens a browser for an OAuth loopback flow and saves the token. To skip it (CI, headless), set `FERRLABS_API_TOKEN`.

### Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `FERRFLEET_API_URL` | Base URL of the FerrFleet API. | `https://api.ferrfleet.com` |
| `FERRFLEET_API_VERSION` | Contract version sent as `x-ferrfleet-api-version`. | `2026-08-04` |
| `FERRFLEET_ORG_ID` | Default organization UUID sent as `x-ferrfleet-org` when a tool call has no `org_id`. | unset |

The full tool list, resources, prompts and the shared variables (token, OAuth, host allowlist, HTTP transport, output cap) are documented in [`mcp/README.md`](mcp/README.md) and the [FerrLabs MCP README](https://github.com/FerrLabs/FerrLabs/blob/main/packages/mcp/README.md#configuration).

## Development

Node 22 or later and pnpm 12.

```bash
cd mcp
pnpm install
pnpm build
pnpm test
pnpm smoke
```

`pnpm smoke` boots the server over stdio and checks the handshake and the advertised tools.

## License

Mozilla Public License 2.0, see [LICENSE](LICENSE).
