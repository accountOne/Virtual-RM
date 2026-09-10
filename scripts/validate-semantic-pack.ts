/**
 * Validates the Business Banking Semantic Pack (/business-semantics/*.json).
 *
 * Checks:
 *   - Required counts: 50 intents, 30 entities, 300 synonym terms, 100 sample questions
 *   - No duplicate intent IDs, entity IDs, or synonym terms
 *   - Every intent's domain/entity/responseTemplate/navigationAction/synonymConcepts reference
 *     something that actually exists
 *   - Every sample question's intent reference is valid
 *   - No malformed JSON, no missing required fields
 *
 * Usage: npm run validate:semantic
 * Exits non-zero (and prints every failure) if anything is wrong.
 */
import fs from 'fs';
import path from 'path';

const PACK_DIR = path.join(__dirname, '..', 'business-semantics');

const errors: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
  errors.push(message);
}

function warn(message: string): void {
  warnings.push(message);
}

function loadJson<T>(fileName: string): T | undefined {
  const filePath = path.join(PACK_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${fileName}`);
    return undefined;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    fail(`Malformed JSON in ${fileName}: ${(e as Error).message}`);
    return undefined;
  }
}

function requireFields(obj: Record<string, unknown>, fields: string[], context: string): void {
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      fail(`${context}: missing required field "${field}"`);
    }
  }
}

function duplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (seen.has(key)) dupes.add(item);
    seen.add(key);
  }
  return [...dupes];
}

function main(): void {
  const domains = loadJson<{ id: string; name: string; description: string }[]>('domains.json') ?? [];
  const entities = loadJson<{ id: string; domain: string; nameVi: string; description: string; aliases: string[] }[]>('entities.json') ?? [];
  const intents = loadJson<
    {
      id: string;
      domain: string;
      entity: string;
      description: string;
      priority: number;
      synonymConcepts: string[];
      supportedEntities: string[];
      responseTemplate: string;
      navigationAction: string;
    }[]
  >('intents.json') ?? [];
  const synonyms = loadJson<Record<string, string[]>>('synonyms.json') ?? {};
  const sampleQueries = loadJson<{ id: number; question: string; intent: string }[]>('sample-queries.json') ?? [];
  const responseTemplates = loadJson<{ id: string; title: string; summary: string }[]>('response-templates.json') ?? [];
  const navigationActions = loadJson<{ id: string; route: string; labelVi: string }[]>('navigation-actions.json') ?? [];
  const datePeriods = loadJson<{ id: string; phrases: string[] }[]>('date-periods.json') ?? [];
  const amountOperators = loadJson<{ operators: unknown[]; units: unknown[]; currencies: unknown[] }>('amount-operators.json');
  const statusDefinitions = loadJson<{ statuses: unknown[]; vietnameseMap: Record<string, string> }>('status-definitions.json');
  const semanticRules = loadJson<{ confidenceThreshold: number; scoring: Record<string, number> }>('semantic-rules.json');
  loadJson<unknown>('business-terms.json');
  loadJson<unknown>('transaction-types.json');
  loadJson<unknown>('payment-types.json');
  loadJson<unknown>('trade-finance.json');
  loadJson<unknown>('product-categories.json');
  loadJson<unknown>('user-roles.json');
  loadJson<unknown>('intent-entity-map.json');

  // ---- Required counts -------------------------------------------------------
  if (intents.length !== 50) fail(`intents.json must have exactly 50 intents, found ${intents.length}`);
  if (entities.length !== 30) fail(`entities.json must have exactly 30 entities, found ${entities.length}`);

  const synonymCount = Object.values(synonyms).reduce((sum, terms) => sum + terms.length, 0);
  if (synonymCount !== 300) fail(`synonyms.json must have exactly 300 total terms, found ${synonymCount}`);

  if (sampleQueries.length !== 100) fail(`sample-queries.json must have exactly 100 questions, found ${sampleQueries.length}`);

  // ---- Duplicates -------------------------------------------------------------
  const dupIntentIds = duplicates(intents.map((i) => i.id));
  if (dupIntentIds.length) fail(`Duplicate intent IDs: ${dupIntentIds.join(', ')}`);

  const dupEntityIds = duplicates(entities.map((e) => e.id));
  if (dupEntityIds.length) fail(`Duplicate entity IDs: ${dupEntityIds.join(', ')}`);

  const dupDomainIds = duplicates(domains.map((d) => d.id));
  if (dupDomainIds.length) fail(`Duplicate domain IDs: ${dupDomainIds.join(', ')}`);

  const allSynonymTerms = Object.values(synonyms).flat();
  const dupSynonyms = duplicates(allSynonymTerms);
  if (dupSynonyms.length) fail(`Duplicate synonym terms (case-insensitive): ${dupSynonyms.join(', ')}`);

  const dupSampleIds = duplicates(sampleQueries.map((s) => String(s.id)));
  if (dupSampleIds.length) fail(`Duplicate sample-query IDs: ${dupSampleIds.join(', ')}`);

  const dupSampleQuestions = duplicates(sampleQueries.map((s) => s.question));
  if (dupSampleQuestions.length) fail(`Duplicate sample questions: ${dupSampleQuestions.join(', ')}`);

  // ---- Required fields ----------------------------------------------------------
  for (const d of domains) requireFields(d, ['id', 'name', 'description'], `domains.json[${d.id}]`);
  for (const e of entities) requireFields(e, ['id', 'domain', 'nameVi', 'description'], `entities.json[${e.id}]`);
  for (const i of intents) {
    requireFields(i, ['id', 'domain', 'entity', 'description', 'priority', 'responseTemplate', 'navigationAction'], `intents.json[${i.id}]`);
  }

  // ---- Cross references -------------------------------------------------------
  const domainIds = new Set(domains.map((d) => d.id));
  const entityIds = new Set(entities.map((e) => e.id));
  const intentIds = new Set(intents.map((i) => i.id));
  const conceptIds = new Set(Object.keys(synonyms));
  const templateIds = new Set(responseTemplates.map((t) => t.id));
  const navIds = new Set(navigationActions.map((n) => n.id));

  for (const i of intents) {
    if (!domainIds.has(i.domain)) fail(`intents.json[${i.id}]: invalid domain reference "${i.domain}"`);
    if (!entityIds.has(i.entity)) fail(`intents.json[${i.id}]: invalid entity reference "${i.entity}"`);
    if (!templateIds.has(i.responseTemplate)) fail(`intents.json[${i.id}]: invalid responseTemplate reference "${i.responseTemplate}"`);
    if (!navIds.has(i.navigationAction)) fail(`intents.json[${i.id}]: invalid navigationAction reference "${i.navigationAction}"`);
    for (const concept of i.synonymConcepts ?? []) {
      if (!conceptIds.has(concept)) fail(`intents.json[${i.id}]: invalid synonymConcepts reference "${concept}"`);
    }
  }

  for (const e of entities) {
    if (!domainIds.has(e.domain)) fail(`entities.json[${e.id}]: invalid domain reference "${e.domain}"`);
  }

  for (const s of sampleQueries) {
    if (!intentIds.has(s.intent) && s.intent !== 'BUSINESS_BRIEFING') {
      fail(`sample-queries.json[id=${s.id}]: invalid intent reference "${s.intent}"`);
    }
  }

  // ---- Referenced-but-unused concepts (warning only, not a failure) -----------
  const usedConcepts = new Set(intents.flatMap((i) => i.synonymConcepts ?? []));
  for (const concept of conceptIds) {
    if (!usedConcepts.has(concept)) warn(`synonyms.json concept "${concept}" is not referenced by any intent`);
  }

  // ---- Sanity on the smaller support packs -------------------------------------
  if (!semanticRules) fail('semantic-rules.json failed to load');
  else if (typeof semanticRules.confidenceThreshold !== 'number') fail('semantic-rules.json missing confidenceThreshold');

  if (!amountOperators) fail('amount-operators.json failed to load');
  if (!statusDefinitions) fail('status-definitions.json failed to load');
  if (datePeriods.length === 0) fail('date-periods.json has no periods');

  // ---- Report -------------------------------------------------------------------
  console.log('Business Banking Semantic Pack validation');
  console.log('  domains:', domains.length);
  console.log('  entities:', entities.length, entities.length === 30 ? '✓' : '✗ (expected 30)');
  console.log('  intents:', intents.length, intents.length === 50 ? '✓' : '✗ (expected 50)');
  console.log('  synonym terms:', synonymCount, synonymCount === 300 ? '✓' : '✗ (expected 300)');
  console.log('  synonym concepts:', Object.keys(synonyms).length);
  console.log('  sample questions:', sampleQueries.length, sampleQueries.length === 100 ? '✓' : '✗ (expected 100)');
  console.log('  navigation actions:', navigationActions.length);
  console.log('  response templates:', responseTemplates.length);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log('  ⚠', w);
  }

  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors) console.log('  ✗', e);
    console.log('\nFAILED');
    process.exit(1);
  }

  console.log('\nPASSED');
}

main();
