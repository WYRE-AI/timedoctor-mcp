import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { checkInvitation, getCredentials, getUser, listUsers } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const USERS_TOOLS: Tool[] = [
  {
    name: 'timedoctor_list_users',
    description: 'List Time Doctor users, optionally scoped to a company and filtered by email/name.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company ID. If omitted, scope is global to the authenticated user.' },
        email: { type: 'string', description: 'Filter: email starts with this value.' },
        name: { type: 'string', description: 'Filter: name starts with this value.' },
        includeArchivedUsers: { type: 'boolean', description: 'Include archived (hidden by default) users.' },
        page: { type: 'string', description: 'Number of results to skip.' },
        limit: { type: 'string', description: 'Maximum number of results to return.' },
      },
    },
  },
  {
    name: 'timedoctor_get_user',
    description: 'Get a single Time Doctor user by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID.' },
        company: { type: 'string', description: 'Company ID the user belongs to.' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'timedoctor_check_invitation',
    description:
      'Check whether a Time Doctor company invitation exists for an email address (read-only - does not send or manage invitations).',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company ID.' },
        email: { type: 'string', description: 'Email address to check.' },
      },
      required: ['company', 'email'],
    },
  },
];

export async function handleUsersTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'timedoctor_list_users') {
      return textResult(
        await listUsers(creds!, {
          company: args.company as string | undefined,
          email: args.email as string | undefined,
          name: args.name as string | undefined,
          includeArchivedUsers: args.includeArchivedUsers as boolean | undefined,
          page: args.page as string | undefined,
          limit: args.limit as string | undefined,
        })
      );
    }

    if (name === 'timedoctor_get_user') {
      const userId = args.userId as string;
      if (!userId) return errorResult('userId is required.');
      return textResult(await getUser(creds!, userId, args.company as string | undefined));
    }

    if (name === 'timedoctor_check_invitation') {
      const company = args.company as string;
      const email = args.email as string;
      if (!company) return errorResult('company is required.');
      if (!email) return errorResult('email is required.');
      return textResult(await checkInvitation(creds!, company, email));
    }

    return errorResult(`Unknown users tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
