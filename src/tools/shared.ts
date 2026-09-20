import type { TimeDoctorCredentials } from '../types.js';
import type { CallToolResult } from './types.js';

export function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Returns an error CallToolResult if credentials are missing, else null. */
export function requireCredentials(creds: TimeDoctorCredentials | null): CallToolResult | null {
  if (!creds) {
    return errorResult('No Time Doctor credentials configured. Set TIMEDOCTOR_EMAIL and TIMEDOCTOR_PASSWORD.');
  }
  return null;
}
