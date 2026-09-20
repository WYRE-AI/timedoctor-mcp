import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getProject, listProjects } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const PROJECTS_TOOLS: Tool[] = [
  {
    name: 'timedoctor_list_projects',
    description: 'List Time Doctor projects in a company.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company ID.' },
        name: { type: 'string', description: 'Filter: name starts with this value.' },
        all: { type: 'boolean', description: 'Return all company projects instead of only ones assigned to the caller.' },
        page: { type: 'string', description: 'Number of results to skip.' },
        limit: { type: 'string', description: 'Maximum number of results to return.' },
      },
      required: ['company'],
    },
  },
  {
    name: 'timedoctor_get_project',
    description: 'Get a single Time Doctor project by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID.' },
        company: { type: 'string', description: 'Company ID.' },
      },
      required: ['projectId', 'company'],
    },
  },
];

export async function handleProjectsTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'timedoctor_list_projects') {
      const company = args.company as string;
      if (!company) return errorResult('company is required.');
      return textResult(
        await listProjects(creds!, company, {
          name: args.name as string | undefined,
          all: args.all as boolean | undefined,
          page: args.page as string | undefined,
          limit: args.limit as string | undefined,
        })
      );
    }

    if (name === 'timedoctor_get_project') {
      const projectId = args.projectId as string;
      const company = args.company as string;
      if (!projectId) return errorResult('projectId is required.');
      if (!company) return errorResult('company is required.');
      return textResult(await getProject(creds!, projectId, company));
    }

    return errorResult(`Unknown projects tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
