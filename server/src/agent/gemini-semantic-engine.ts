// Orchestrates the Gemini semantic-understanding call: build prompt -> call gemini-client ->
// parse JSON -> validate with Zod -> merge known context. Implements the 3-tier fallback chain
// from spec §20 end to end:
//   1. Gemini (real model call)
//   2. fallback-rule-engine.ts (deterministic keyword rules — no model, never fails)
//   3. Tier 2 never throws, so there is no true "tier 3" failure inside this file; a caller
//      that gets back a low-confidence `unknown` result is what "generic clarification" means
//      in practice (handled by the Workflow Engine, Phase D).
//
// This file NEVER calls a tool and NEVER decides a workflow's next state — see
// docs/GEMINI_AGENT_AUDIT.md §10 on why that split matters (LLM understands, orchestrator
// decides).

import { classifyWithRules } from './fallback-rule-engine';
import { GeminiRequestError, generateStructuredResponse, geminiConfigured } from './gemini-client';
import { BuildPromptInput, buildSemanticPrompt } from './prompt-builder';
import { buildSemanticSystemPrompt } from './prompts/semantic-system.prompt';
import { AgentEntities, SemanticUnderstanding, semanticUnderstandingSchema } from './schemas/semantic-understanding.schema';

export type UnderstandingSource = 'gemini' | 'fallback_rules';

export interface UnderstandResult {
  understanding: SemanticUnderstanding;
  source: UnderstandingSource;
}

function mergeKnownEntities(understanding: SemanticUnderstanding, known: AgentEntities | undefined): SemanticUnderstanding {
  if (!known || Object.keys(known).length === 0) return understanding;
  // Gemini-extracted entities from THIS turn win on conflict — they're the most recent, most
  // specific signal (e.g. the customer correcting an earlier amount).
  const merged: AgentEntities = { ...known, ...understanding.entities };
  const stillMissing = understanding.missingFields.filter((field) => !merged[field as keyof AgentEntities]);
  return { ...understanding, entities: merged, missingFields: stillMissing };
}

function parseGeminiJson(raw: string): unknown {
  // Gemini's responseMimeType: 'application/json' should already return clean JSON, but a
  // defensive strip of a stray ```json fence costs nothing and avoids a false "invalid JSON"
  // fallback for an otherwise-good response.
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  return JSON.parse(cleaned);
}

/**
 * Understands one customer message. `input.knownEntities` carries anything already confirmed
 * earlier in the current workflow (Phase D) so a short follow-up ("5 triệu") merges instead of
 * starting over. Never throws — a total Gemini failure still returns a valid (if low-confidence)
 * `SemanticUnderstanding` via the rule-based fallback, so callers never need a try/catch of
 * their own around this function.
 */
export async function understand(input: BuildPromptInput, anchorDateIso: string): Promise<UnderstandResult> {
  if (!geminiConfigured()) {
    return { understanding: withKnown(classifyWithRules(input.message), input.knownEntities), source: 'fallback_rules' };
  }

  try {
    const raw = await generateStructuredResponse({
      systemInstruction: buildSemanticSystemPrompt(anchorDateIso),
      prompt: buildSemanticPrompt(input),
    });
    const json = parseGeminiJson(raw);
    const validated = semanticUnderstandingSchema.parse(json);
    return { understanding: withKnown(validated, input.knownEntities), source: 'gemini' };
  } catch (err) {
    logFailure(err);
    return { understanding: withKnown(classifyWithRules(input.message), input.knownEntities), source: 'fallback_rules' };
  }
}

function withKnown(understanding: SemanticUnderstanding, known: AgentEntities | undefined): SemanticUnderstanding {
  return mergeKnownEntities(understanding, known);
}

function logFailure(err: unknown): void {
  // Never logs prompt/response content (may carry customer-provided text) — only the failure
  // class, matching gemini-client.ts's own logging discipline.
  const kind = err instanceof GeminiRequestError ? err.constructor.name : err instanceof SyntaxError ? 'InvalidJson' : err instanceof Error ? 'ZodOrOther' : 'Unknown';
  console.error('agent.semantic.gemini_failed_fallback_to_rules', { kind });
}
