#!/usr/bin/env node
import { runMcp, readPackageVersion } from '@ferrlabs/mcp-core';
import { register } from './register.js';

runMcp({
  name: 'ferrfleet',
  version: readPackageVersion(import.meta.url),
  register,
}).catch((err: unknown) => {
  console.error('ferrfleet-mcp fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
