import { stripDiacritics } from './normalizer';
import { DomainDef, IntentDef, SemanticQuery, SemanticRulesPack, SynonymDict } from './types';

export interface IntentScore {
  intent: IntentDef;
  score: number;
  matchedTerms: string[];
}

export interface DetectionContext {
  hasDatePeriod: boolean;
  hasStatus: boolean;
  hasAmount: boolean;
  entities: SemanticQuery['entities'];
}

/**
 * Deterministic intent scoring per business-semantics/semantic-rules.json:
 *   multi-word synonym phrase match  +exactPhraseMatch (a specific phrase like "cần duyệt" found verbatim)
 *   single-word synonym match        +synonymMatch     (a bare word like "duyệt" — weaker alone)
 *   entity match                     +entityMatch      (once per supported entity actually extracted)
 *   domain name match                +domainMatch
 *   date condition present   +dateCondition  (only if the intent supports datePeriod)
 *   status condition present +statusCondition (only if the intent supports status)
 * Intents are ranked by score, ties broken by the intent's declared `priority` (more specific
 * intents are authored with a higher priority — see business-semantics/intents.json).
 */
export function scoreIntents(
  normalizedText: string,
  intents: IntentDef[],
  domains: DomainDef[],
  synonyms: SynonymDict,
  rules: SemanticRulesPack,
  ctx: DetectionContext,
): IntentScore[] {
  const domainById = new Map(domains.map((d) => [d.id, d]));

  const results: IntentScore[] = intents.map((intent) => {
    let score = 0;
    const matchedTerms: string[] = [];

    for (const concept of intent.synonymConcepts) {
      const terms = synonyms[concept] ?? [];
      for (const term of terms) {
        const normalizedTerm = stripDiacritics(term.toLowerCase());
        if (normalizedText.includes(normalizedTerm)) {
          // A multi-word synonym phrase ("cần duyệt", "số dư khả dụng") appearing verbatim is
          // treated as an exact-phrase match — strong, specific evidence of intent. A bare
          // single word ("duyệt", "tiền") is much more ambiguous on its own, so it only earns
          // the weaker synonym-match score; real single-word questions still clear the
          // confidence threshold by accumulating several such matches.
          //
          // The "amount" concept is a special case: its operator words ("trên", "từ", "dưới")
          // are individually one word but only meaningful paired with an actual parsed amount
          // (amount-parser.ts already validated a number+unit follows it) — that combination is
          // as strong a signal as a multi-word phrase, so it's scored at the same tier.
          const isPhrase = normalizedTerm.includes(' ') || (concept === 'amount' && ctx.hasAmount);
          score += isPhrase ? rules.scoring.exactPhraseMatch : rules.scoring.synonymMatch;
          matchedTerms.push(term);
        }
      }
    }

    // "Intent keyword" — the intent's own id, lowercased with underscores as spaces, appearing
    // literally (e.g. a debug/power-user query that names the intent directly).
    const idAsPhrase = intent.id.toLowerCase().replace(/_/g, ' ');
    if (normalizedText.includes(stripDiacritics(idAsPhrase))) {
      score += rules.scoring.intentKeyword;
      matchedTerms.push(idAsPhrase);
    }

    const domain = domainById.get(intent.domain);
    if (domain && normalizedText.includes(stripDiacritics(domain.name.toLowerCase()))) {
      score += rules.scoring.domainMatch;
    }

    if (matchedTerms.length > 0) {
      for (const field of intent.supportedEntities) {
        if (field === 'datePeriod' && ctx.hasDatePeriod) score += rules.scoring.dateCondition;
        else if (field === 'status' && ctx.hasStatus) score += rules.scoring.statusCondition;
        else if (field === 'amount' && ctx.hasAmount) score += rules.scoring.entityMatch;
        else if (isEntityFieldPresent(field, ctx.entities)) score += rules.scoring.entityMatch;
      }
    }

    return { intent, score: Math.min(score, rules.maxScorePerConcept * 3), matchedTerms };
  });

  return results.sort((a, b) => b.score - a.score || b.intent.priority - a.intent.priority);
}

function isEntityFieldPresent(field: string, entities: SemanticQuery['entities']): boolean {
  switch (field) {
    case 'beneficiary':
      return !!entities.beneficiary;
    case 'supplier':
      return !!entities.supplier;
    case 'customer':
      return !!entities.customer;
    case 'documentId':
      return !!entities.documentId;
    case 'accountNo':
    case 'accountId':
      return !!entities.accountNo || !!entities.accountId;
    default:
      return false;
  }
}

/** confidence = top score normalized to [0,1], capped — compared against semantic-rules.json's confidenceThreshold. */
export function confidenceFromScore(score: number): number {
  return Math.min(score / 100, 1);
}
