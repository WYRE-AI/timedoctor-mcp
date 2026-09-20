import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getTimeuseStats, getWorklog } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const ACTIVITY_TOOLS: Tool[] = [
  {
    name: 'timedoctor_get_worklog',
    description:
      'Get detailed Time Doctor work-session log (start times, duration, task/project, mode) for a user or company within a time range. For best performance, query <=7-day windows at a time.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company ID.' },
        user: { type: 'string', description: 'Comma-separated user IDs. Defaults to the authenticated user.' },
        from: { type: 'string', description: 'ISO 8601 start of range (inclusive).' },
        to: { type: 'string', description: 'ISO 8601 end of range (exclusive).' },
        taskProjectNames: { type: 'boolean', description: 'Resolve task/project names instead of only IDs.' },
      },
      required: ['company'],
    },
  },
  {
    name: 'timedoctor_get_timeuse_stats',
    description:
      'Get aggregated Time Doctor productivity statistics (time spent per application/category, productive vs. unproductive) for a user or company within a time range.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company ID.' },
        user: { type: 'string', description: 'Comma-separated user IDs. Defaults to the authenticated user.' },
        from: { type: 'string', description: 'ISO 8601 start of range (inclusive).' },
        to: { type: 'string', description: 'ISO 8601 end of range (exclusive).' },
        category: { type: 'string', description: 'Category to fetch the report for.' },
        page: { type: 'string', description: 'Number of results to skip.' },
        limit: { type: 'string', description: 'Maximum number of results to return.' },
      },
      required: ['company'],
    },
  },
];

export async function handleActivityTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'timedoctor_get_worklog') {
      const company = args.company as string;
      if (!company) return errorResult('company is required.');
      return textResult(
        await getWorklog(creds!, company, {
          user: args.user as string | undefined,
          from: args.from as string | undefined,
          to: args.to as string | undefined,
          taskProjectNames: args.taskProjectNames as boolean | undefined,
        })
      );
    }

    if (name === 'timedoctor_get_timeuse_stats') {
      const company = args.company as string;
      if (!company) return errorResult('company is required.');
      return textResult(
        await getTimeuseStats(creds!, company, {
          user: args.user as string | undefined,
          from: args.from as string | undefined,
          to: args.to as string | undefined,
          category: args.category as string | undefined,
          page: args.page as string | undefined,
          limit: args.limit as string | undefined,
        })
      );
    }

    return errorResult(`Unknown activity tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
