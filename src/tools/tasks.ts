import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getTask, listTasks } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const TASKS_TOOLS: Tool[] = [
  {
    name: 'timedoctor_list_tasks',
    description: 'List Time Doctor tasks in a company, optionally filtered by project, name, or open/closed status.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company ID.' },
        projects: { type: 'string', description: 'Comma-separated project IDs to filter by.' },
        name: { type: 'string', description: 'Filter: name starts with this value.' },
        status: { type: 'string', enum: ['open', 'closed'], description: 'Filter by task status.' },
        page: { type: 'string', description: 'Number of results to skip.' },
        limit: { type: 'string', description: 'Maximum number of results to return.' },
      },
      required: ['company'],
    },
  },
  {
    name: 'timedoctor_get_task',
    description: 'Get a single Time Doctor task by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID.' },
        company: { type: 'string', description: 'Company ID.' },
      },
      required: ['taskId', 'company'],
    },
  },
];

export async function handleTasksTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'timedoctor_list_tasks') {
      const company = args.company as string;
      if (!company) return errorResult('company is required.');
      return textResult(
        await listTasks(creds!, company, {
          projects: args.projects as string | undefined,
          name: args.name as string | undefined,
          status: args.status as 'open' | 'closed' | undefined,
          page: args.page as string | undefined,
          limit: args.limit as string | undefined,
        })
      );
    }

    if (name === 'timedoctor_get_task') {
      const taskId = args.taskId as string;
      const company = args.company as string;
      if (!taskId) return errorResult('taskId is required.');
      if (!company) return errorResult('company is required.');
      return textResult(await getTask(creds!, taskId, company));
    }

    return errorResult(`Unknown tasks tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
