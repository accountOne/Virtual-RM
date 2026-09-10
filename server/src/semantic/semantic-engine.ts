import fs from 'fs';
import path from 'path';
import {
  bankGuaranteesRepository,
  collectionsRepository,
  customerRepository,
  letterOfCreditsRepository,
  payablesRepository,
  paymentOrdersRepository,
  receivablesRepository,
  transactionsRepository,
} from '../repositories';
import { getAnchorDates } from '../services/transactions.service';
import { normalize } from './normalizer';
import { resolveDatePeriod, setAnchorDate } from './date-resolver';
import { parseAmountFilter } from './amount-parser';
import { resolveStatus } from './status-resolver';
import { extractEntities, KnownNames } from './entity-extractor';
import { confidenceFromScore, scoreIntents } from './intent-detector';
import { buildQuery } from './query-builder';
import { generateAnswer } from './response-generator';
import {
  AmountOperatorsPack,
  ClarificationResult,
  DatePeriodDef,
  DomainDef,
  EntityDef,
  IntentDef,
  NavigationActionDef,
  SecurityContext,
  SemanticQueryResult,
  SemanticRulesPack,
  StatusDefinitionsPack,
  SynonymDict,
} from './types';

const PACK_DIR = path.join(__dirname, '..', '..', '..', 'business-semantics');

function loadJson<T>(fileName: string): T {
  const raw = fs.readFileSync(path.join(PACK_DIR, fileName), 'utf-8');
  return JSON.parse(raw) as T;
}

interface LoadedPack {
  domains: DomainDef[];
  entities: EntityDef[];
  intents: IntentDef[];
  synonyms: SynonymDict;
  datePeriods: DatePeriodDef[];
  amountOperators: AmountOperatorsPack;
  statusDefinitions: StatusDefinitionsPack;
  semanticRules: SemanticRulesPack;
  navigationActions: NavigationActionDef[];
}

let pack: LoadedPack | null = null;

/** Loads the Business Banking Semantic Pack once (JSON files under /business-semantics) and
 * caches it in memory — this is a demo with static data, no need to re-read on every request. */
function getPack(): LoadedPack {
  if (pack) return pack;
  pack = {
    domains: loadJson<DomainDef[]>('domains.json'),
    entities: loadJson<EntityDef[]>('entities.json'),
    intents: loadJson<IntentDef[]>('intents.json'),
    synonyms: loadJson<SynonymDict>('synonyms.json'),
    datePeriods: loadJson<DatePeriodDef[]>('date-periods.json'),
    amountOperators: loadJson<AmountOperatorsPack>('amount-operators.json'),
    statusDefinitions: loadJson<StatusDefinitionsPack>('status-definitions.json'),
    semanticRules: loadJson<SemanticRulesPack>('semantic-rules.json'),
    navigationActions: loadJson<NavigationActionDef[]>('navigation-actions.json'),
  };
  return pack;
}

/** Test-only hook: clears the in-memory pack cache so a test can reload after editing fixtures. */
export function _resetPackCacheForTests(): void {
  pack = null;
}

function collectKnownNames(): KnownNames {
  const beneficiaries = new Set<string>();
  const customers = new Set<string>();
  const suppliers = new Set<string>();

  for (const t of transactionsRepository.readAll()) beneficiaries.add(t.counterparty);
  for (const o of paymentOrdersRepository.readAll()) beneficiaries.add(o.beneficiary);
  for (const c of collectionsRepository.readAll()) beneficiaries.add(c.counterparty);
  for (const l of letterOfCreditsRepository.readAll()) beneficiaries.add(l.beneficiary);
  for (const g of bankGuaranteesRepository.readAll()) beneficiaries.add(g.beneficiary);
  for (const r of receivablesRepository.readAll()) customers.add(r.customer);
  for (const s of payablesRepository.readAll()) suppliers.add(s.supplier);

  return { beneficiaries: [...beneficiaries], customers: [...customers], suppliers: [...suppliers] };
}

export interface AnswerQueryOptions {
  debug?: boolean;
}

export function answerQuery(
  rawQuestion: string,
  security: SecurityContext,
  options: AnswerQueryOptions = {},
): SemanticQueryResult | ClarificationResult {
  const p = getPack();
  const anchorToday = getAnchorDates().today;
  setAnchorDate(anchorToday);

  const normalizedText = normalize(rawQuestion, p.semanticRules);
  const dateResolution = resolveDatePeriod(normalizedText, p.datePeriods);
  const amount = parseAmountFilter(normalizedText, p.amountOperators);
  const status = resolveStatus(normalizedText, p.statusDefinitions);
  const known = collectKnownNames();
  const entities = extractEntities(rawQuestion, known);

  const ranked = scoreIntents(normalizedText, p.intents, p.domains, p.synonyms, p.semanticRules, {
    hasDatePeriod: !!dateResolution,
    hasStatus: !!status,
    hasAmount: !!amount,
    entities,
  });

  const top = ranked[0];
  const confidence = top ? confidenceFromScore(top.score) : 0;

  if (!top || top.score === 0) {
    return clarification(0, 'Tôi chưa hiểu rõ câu hỏi này. Anh/chị có thể thử một trong các câu hỏi gợi ý bên dưới không?');
  }

  if (confidence < p.semanticRules.confidenceThreshold) {
    return clarification(
      confidence,
      `Anh/chị muốn hỏi về "${p.domains.find((d) => d.id === top.intent.domain)?.name ?? top.intent.domain}"? Anh/chị có thể hỏi cụ thể hơn được không?`,
    );
  }

  const query = buildQuery({
    intent: top.intent,
    confidence,
    entities,
    dateResolution,
    status,
    amount,
    security,
    matchedTerms: top.matchedTerms,
  });

  const dateRange = dateResolution?.range;
  const answer = generateAnswer({ query, dateRange, anchorToday, navigationActions: p.navigationActions });

  return {
    success: true,
    semantic: {
      intent: query.intent,
      confidence: Math.round(confidence * 100) / 100,
      ...(options.debug ? { matchedTerms: query.matchedTerms, entities: query.entities, filters: query.filters } : {}),
    },
    answer,
  };
}

const BUSINESS_BRIEFING_INTENT: IntentDef = {
  id: 'BUSINESS_BRIEFING',
  domain: 'CUSTOMER_SERVICE',
  entity: 'RelationshipManager',
  description: 'Tổng hợp tình hình doanh nghiệp hôm nay',
  priority: 100,
  synonymConcepts: [],
  supportedEntities: [],
  responseTemplate: 'BUSINESS_BRIEFING',
  navigationAction: 'OPEN_DASHBOARD',
};

/** BUSINESS_BRIEFING is an extension on top of the 50 core intents (see spec §23) — callable
 * directly (e.g. from a dedicated endpoint) without going through intent detection. */
export function businessBriefing(security: SecurityContext): SemanticQueryResult {
  const p = getPack();
  const anchorToday = getAnchorDates().today;
  setAnchorDate(anchorToday);
  const query = buildQuery({
    intent: BUSINESS_BRIEFING_INTENT,
    confidence: 1,
    entities: {},
    security,
    matchedTerms: [],
  });
  const answer = generateAnswer({ query, anchorToday, navigationActions: p.navigationActions });
  return { success: true, semantic: { intent: 'BUSINESS_BRIEFING', confidence: 1 }, answer };
}

function clarification(confidence: number, question: string): ClarificationResult {
  return {
    success: true,
    semantic: { intent: 'CLARIFICATION_NEEDED', confidence },
    answer: {
      title: 'Cần làm rõ thêm',
      summary: question,
      metrics: [],
      records: [],
      suggestedQuestions: pickSuggested(),
    },
  };
}

function pickSuggested(): string[] {
  const samples = loadJson<{ question: string }[]>('sample-queries.json');
  return samples.slice(0, 5).map((s) => s.question);
}

/** companyId/userId server-side derivation. There's no server session in this demo (the
 * backend API is deliberately unauthenticated, matching the "no real auth server"
 * constraint), so userId is the one piece of context the client is trusted to declare —
 * companyId never is: it always comes from the single seeded customer record, so chat input
 * (or a forged userId) can never widen a query beyond this demo's one tenant. */
export function buildSecurityContext(userId: string | undefined, role: SecurityContext['role']): SecurityContext {
  const customer = customerRepository.read();
  return {
    companyId: customer.customerId,
    userId: userId ?? 'anonymous',
    role,
  };
}
