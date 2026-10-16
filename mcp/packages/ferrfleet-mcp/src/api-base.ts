import { z } from 'zod';
import { apiRequest } from '@ferrlabs/mcp-core';

export const FLEET_API_URL = process.env.FERRFLEET_API_URL ?? 'https://api.ferrfleet.com';

const API_VERSION_HEADER = 'x-ferrfleet-api-version';
const ORG_HEADER = 'x-ferrfleet-org';

export const FLEET_API_VERSION = process.env.FERRFLEET_API_VERSION ?? '2026-08-04';

export const orgIdSchema = z
  .guid()
  .optional()
  .describe('Organization id. Find it with list_ferrfleet_orgs.');

interface FleetRequestOptions {
  method?: string;
  body?: unknown;
  token: string;
  orgId?: string | undefined;
}

function orgHeader(orgId: string | undefined): Record<string, string> {
  if (orgId !== undefined) {
    if (!z.guid().safeParse(orgId).success) {
      throw new Error('org_id must be a UUID');
    }
    return { [ORG_HEADER]: orgId };
  }
  const fallback = process.env.FERRFLEET_ORG_ID;
  if (fallback === undefined || fallback === '') return {};
  if (!z.guid().safeParse(fallback).success) {
    throw new Error('FERRFLEET_ORG_ID must be a UUID');
  }
  return { [ORG_HEADER]: fallback };
}

export async function fleetRequest<T>(path: string, options: FleetRequestOptions): Promise<T> {
  const { token, orgId, ...rest } = options;
  return apiRequest<T>(path, {
    ...rest,
    token,
    baseUrl: FLEET_API_URL,
    headers: { [API_VERSION_HEADER]: FLEET_API_VERSION, ...orgHeader(orgId) },
  });
}
