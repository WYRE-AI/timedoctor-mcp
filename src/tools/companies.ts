import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCompany, getCredentials, listCompanies } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const COMPANIES_TOOLS: Tool[] = [
  {
    name: 'timedoctor_list_companies',
    description: 'List Time Doctor companies (workspaces) the authenticated user owns or administers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'timedoctor_get_company',
    description: 'Get a single Time Doctor company by ID.',
    inputSchema: {
      type: 'object',
      properties: { companyId: { type: 'string', description: 'Company ID.' } },
      required: ['companyId'],
    },
  },
];

export async function handleCompaniesTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'timedoctor_list_companies') {
      return textResult(await listCompanies(creds!));
    }

    if (name === 'timedoctor_get_company') {
      const companyId = args.companyId as string;
      if (!companyId) return errorResult('companyId is required.');
      return textResult(await getCompany(creds!, companyId));
    }

    return errorResult(`Unknown companies tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
