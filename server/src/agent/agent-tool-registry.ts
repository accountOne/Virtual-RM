// Agent Tool Registry (spec §10) — the whitelist an AgentTool must be registered in before the
// Workflow Engine can ever call it. Mirrors server/src/tools/tool-security.ts's fail-closed
// posture (assertToolAllowed) and reuses its exact `RiskLevel` union rather than declaring a
// second one — a tool with no registration, or a role not in its allowedRoles, is refused, never
// silently skipped.
//
// Deliberate, documented deviation from the spec's literal `AgentTool.execute(input: unknown)`
// shape: this codebase never lets identity/role come from the same bag as user-supplied
// parameters (see server/src/tools/index.ts's own header comment) — so `execute` here takes the
// server-derived UserContext as its own first argument, exactly like the existing read-only tool
// layer, instead of folding it into `input`.

import { UserContext } from '../ai/types';
import { Role } from '../auth/types';
import { RiskLevel } from '../tools/tool-security';

export interface AgentTool<Params = unknown, Result = unknown> {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  /** Spec §10/§11 — true for every tool with a real side effect (transfer/LC/guarantee/
   * collection submission). The Approval Gate (Phase F) refuses to run any tool with this set
   * to true unless its workflow is in WAITING_APPROVAL and the customer has explicitly clicked
   * Approve — never inferred from the model's own output. */
  requiresApproval: boolean;
  allowedRoles: Role[];
  execute: (ctx: UserContext, params: Params) => Promise<Result> | Result;
}

const registry = new Map<string, AgentTool<any, any>>();

export function registerAgentTool<Params, Result>(tool: AgentTool<Params, Result>): AgentTool<Params, Result> {
  registry.set(tool.name, tool);
  return tool;
}

export function getAgentTool(name: string): AgentTool<any, any> | undefined {
  return registry.get(name);
}

export class AgentToolNotAuthorizedError extends Error {}

/** Same fail-closed shape as tools/tool-security.ts::assertToolAllowed — an unregistered tool
 * or a disallowed role always throws, never falls through to a default allow. */
export function assertAgentToolAllowed(toolName: string, role: Role | undefined): AgentTool<any, any> {
  const tool = registry.get(toolName);
  if (!tool) throw new AgentToolNotAuthorizedError(`Agent tool "${toolName}" is not registered — refusing to call it.`);
  if (!role || !tool.allowedRoles.includes(role)) {
    throw new AgentToolNotAuthorizedError(`Role "${role ?? 'none'}" is not permitted to call agent tool "${toolName}".`);
  }
  return tool;
}

export function _resetAgentToolRegistryForTests(): void {
  registry.clear();
}
