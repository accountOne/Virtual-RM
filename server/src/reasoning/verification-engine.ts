// Phase 5.5 Verification Engine (spec §14) — a mandatory gate for MODERATE/COMPLEX reasoning
// answers (SIMPLE deterministic answers from response-generator.ts never reach this). Runs
// deterministic checks against the evidence the Evidence Engine collected; if verification
// fails outright, the caller (reasoning-engine.ts) must not return the invalid answer — it
// falls back to a safe "chưa đủ dữ liệu" message instead (spec §14: "DO NOT return the invalid
// answer. Regenerate or return a safe fallback.").
//
// Of the ten checks spec §14 lists, several are already structurally guaranteed elsewhere and
// are not re-implemented here (documented in docs/phase-5.5-verification.md):
//   - "company access is valid" — buildSecurityContext derives companyId server-side only
//     (semantic-engine.ts), no tool ever accepts a client-supplied companyId (security-isolation
//     tests already cover this).
//   - "dates are valid" / "currency is valid" — date-resolver.ts/amount-parser.ts already parse
//     against a closed vocabulary (business-semantics/*.json); an unparseable date/currency
//     never reaches a tool call in the first place.
// What this file actually checks: data exists, the answer has real content, every metric value
// is a real number (not NaN/undefined), and every navigation entityId traces back either to the
// evidence list or to a returned record — i.e. "no fabricated field" / "navigation entity
// exists" / "recommendation is supported by evidence".

import { SemanticAnswer } from '../semantic/types';
import { ReasoningEvidence, VerificationResult } from './reasoning-types';

export interface VerificationInput {
  answer: SemanticAnswer;
  evidence: ReasoningEvidence[];
  /** Did the underlying tool call(s) return at least one record? An empty-but-valid result
   * (e.g. "0 LC sắp hết hạn") is fine; `hasData` is about the *source* query running at all,
   * not about the result being non-empty. */
  hasData: boolean;
}

function recordEntityIds(records: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const candidate = rec.lcNumber ?? rec.bgNumber ?? rec.collectionNumber ?? rec.mã ?? rec.id;
    if (typeof candidate === 'string') ids.add(candidate);
  }
  return ids;
}

export function verifyReasoning(input: VerificationInput): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { answer, evidence } = input;

  // 1. Data exists — the plan actually ran against something.
  if (!input.hasData) {
    errors.push('Không truy vấn được dữ liệu nguồn cho câu hỏi này.');
  }

  // 2. The answer has real content, not an empty shell.
  if (!answer.summary || !answer.summary.trim()) {
    errors.push('Câu trả lời thiếu nội dung tóm tắt.');
  }

  // 3. No fabricated metric — every value must be a real, finite representation, never a
  // leaked NaN/undefined from a bad calculation.
  for (const m of answer.metrics) {
    if (m.value == null || /\bnan\b|\bundefined\b/i.test(String(m.value))) {
      errors.push(`Chỉ số "${m.label}" có giá trị không hợp lệ.`);
    }
  }

  // 4. Navigation entity exists — every action/actions entityId must be traceable to either
  // the evidence list or a record the answer itself returned (never a made-up id the model
  // invented while phrasing).
  const evidenceIds = new Set(evidence.map((e) => e.entityId));
  const recordIds = recordEntityIds(answer.records);
  const actionsToCheck = [...(answer.actions ?? []), ...(answer.action ? [answer.action] : [])];
  for (const a of actionsToCheck) {
    if (a.entityId && !evidenceIds.has(a.entityId) && !recordIds.has(a.entityId)) {
      warnings.push(`Không tìm thấy bằng chứng cho thực thể điều hướng "${a.entityId}".`);
    }
  }

  // 5. A recommendation, if present, must not be the only content — it must sit alongside at
  // least one metric or evidence row it could plausibly be "supported by" (a bare
  // recommendation with zero backing facts is a warning, not hard-blocked, since some ADVISORY
  // answers legitimately have few numeric metrics).
  if (answer.recommendation && answer.metrics.length === 0 && evidence.length === 0) {
    warnings.push('Khuyến nghị chưa có dữ liệu/bằng chứng đi kèm.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** The safe fallback answer returned instead of an invalid one (spec §14). Never claims a
 * number/fact — it names what failed only at the check-name level, never chain-of-thought. */
export function safeFallbackAnswer(reason: string): SemanticAnswer {
  return {
    title: 'Chưa thể trả lời chính xác',
    summary: `Hệ thống chưa đủ dữ liệu đã được xác minh để trả lời câu hỏi này (${reason}). Anh/chị có thể hỏi cụ thể hơn hoặc liên hệ RM.`,
    metrics: [],
    records: [],
  };
}
