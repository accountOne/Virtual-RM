// AI Tool Layer security metadata (Virtual RM security upgrade — see
// docs/security/virtual-rm-security.md). Every tool the Reasoning Engine can call must be
// registered here with an explicit risk classification; a tool with none is refused, not
// silently allowed — see assertToolAllowed() below.

import { Role } from '../auth/types';

export type RiskLevel = 'READ' | 'ANALYZE' | 'PREPARE' | 'SUBMIT' | 'AUTHORIZE' | 'EXECUTE';

export interface SecureToolDefinition {
  name: string;
  riskLevel: RiskLevel;
  readOnly: boolean;
  requiresConfirmation: boolean;
  requiresAuthorization: boolean;
  allowedRoles: Role[];
}

const ALL_ROLES: Role[] = ['MAKER', 'CHECKER', 'ADMIN'];

export const TOOL_SECURITY_REGISTRY: Record<string, SecureToolDefinition> = {};

/** Every tool currently in `tools/index.ts` is a plain `get_*` data read — see that file's own
 * header comment. Called once per tool name from `tools/index.ts` after `toolRegistry` is
 * built, so this registry can never silently drift out of sync with the actual tool list (no
 * hand-maintained name list to forget to update). A future tool that needs a different risk
 * level (PREPARE/SUBMIT/AUTHORIZE/EXECUTE) must call `registerTool()` directly with its real
 * policy instead of this helper. */
export function registerReadOnlyTool(name: string): void {
  registerTool({
    name,
    riskLevel: 'READ',
    readOnly: true,
    requiresConfirmation: false,
    requiresAuthorization: false,
    allowedRoles: ALL_ROLES,
  });
}

export function registerTool(def: SecureToolDefinition): void {
  TOOL_SECURITY_REGISTRY[def.name] = def;
}

export class ToolNotAuthorizedError extends Error {}

/** Fails closed: a tool with no registered security metadata, or a role not in its
 * allowedRoles, throws rather than executing. Wire this at the single call site the Reasoning
 * Engine uses to invoke a tool by name (spec §14: "AI không được gọi tool ngoài whitelist"). */
export function assertToolAllowed(toolName: string, role: Role | undefined): void {
  const def = TOOL_SECURITY_REGISTRY[toolName];
  if (!def) {
    throw new ToolNotAuthorizedError(`Tool "${toolName}" has no registered SecureToolDefinition — refusing to call it.`);
  }
  if (!role || !def.allowedRoles.includes(role)) {
    throw new ToolNotAuthorizedError(`Role "${role ?? 'none'}" is not permitted to call tool "${toolName}".`);
  }
}
