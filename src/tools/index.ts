import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { COMPANIES_TOOLS, handleCompaniesTool } from './companies.js';
import { USERS_TOOLS, handleUsersTool } from './users.js';
import { PROJECTS_TOOLS, handleProjectsTool } from './projects.js';
import { TASKS_TOOLS, handleTasksTool } from './tasks.js';
import { ACTIVITY_TOOLS, handleActivityTool } from './activity.js';
import type { CallToolResult } from './types.js';

export const ALL_TOOLS: Tool[] = [
  ...COMPANIES_TOOLS,
  ...USERS_TOOLS,
  ...PROJECTS_TOOLS,
  ...TASKS_TOOLS,
  ...ACTIVITY_TOOLS,
];

const COMPANIES_NAMES = new Set(COMPANIES_TOOLS.map((t) => t.name));
const USERS_NAMES = new Set(USERS_TOOLS.map((t) => t.name));
const PROJECTS_NAMES = new Set(PROJECTS_TOOLS.map((t) => t.name));
const TASKS_NAMES = new Set(TASKS_TOOLS.map((t) => t.name));
const ACTIVITY_NAMES = new Set(ACTIVITY_TOOLS.map((t) => t.name));

export async function dispatchToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (COMPANIES_NAMES.has(name)) return handleCompaniesTool(name, args);
  if (USERS_NAMES.has(name)) return handleUsersTool(name, args);
  if (PROJECTS_NAMES.has(name)) return handleProjectsTool(name, args);
  if (TASKS_NAMES.has(name)) return handleTasksTool(name, args);
  if (ACTIVITY_NAMES.has(name)) return handleActivityTool(name, args);
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
