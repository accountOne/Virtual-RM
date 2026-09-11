import { enrichQuestion, mentionsDocumentNumber, parseEntityFromUrl } from '../rm-context.util';
import { assertEqual, describe, test } from './test-runner';

describe('rm-context.util — parseEntityFromUrl', () => {
  test('recognizes an LC detail route and extracts its id', () => {
    const parsed = parseEntityFromUrl('/trade-finance/lc/LC-2026-001');
    assertEqual(parsed?.entityType, 'LetterOfCredit');
    assertEqual(parsed?.entityId, 'LC-2026-001');
  });

  test('recognizes a Guarantee detail route with a trailing anchor', () => {
    const parsed = parseEntityFromUrl('/trade-finance/guarantees/BG-2026-007#claims');
    assertEqual(parsed?.entityType, 'BankGuarantee');
    assertEqual(parsed?.entityId, 'BG-2026-007');
  });

  test('recognizes a Collection detail route', () => {
    const parsed = parseEntityFromUrl('/trade-finance/collections/COL-2026-003');
    assertEqual(parsed?.entityType, 'Collection');
    assertEqual(parsed?.entityId, 'COL-2026-003');
  });

  test('a list route (no id segment) matches nothing', () => {
    const parsed = parseEntityFromUrl('/trade-finance/lc');
    assertEqual(parsed, undefined);
  });

  test('an unrelated route matches nothing', () => {
    const parsed = parseEntityFromUrl('/dashboard');
    assertEqual(parsed, undefined);
  });
});

describe('rm-context.util — mentionsDocumentNumber', () => {
  test('detects an LC number regardless of case/dash', () => {
    assertEqual(mentionsDocumentNumber('LC-2026-001 còn thiếu gì?'), true);
    assertEqual(mentionsDocumentNumber('lc2026001 còn thiếu gì?'), true);
  });

  test('detects a BG/COL number', () => {
    assertEqual(mentionsDocumentNumber('BG-2026-007 sắp hết hạn'), true);
    assertEqual(mentionsDocumentNumber('COL-2026-003 thế nào'), true);
  });

  test('a question with no document number returns false', () => {
    assertEqual(mentionsDocumentNumber('Còn thiếu gì?'), false);
  });
});

describe('rm-context.util — enrichQuestion (context injection)', () => {
  test('appends the current entity id to an ambiguous question', () => {
    assertEqual(enrichQuestion('Còn thiếu gì?', 'LC-2026-001'), 'Còn thiếu gì? LC-2026-001');
  });

  test('does nothing when there is no current entity', () => {
    assertEqual(enrichQuestion('Còn thiếu gì?', undefined), 'Còn thiếu gì?');
  });

  test('does nothing when the question already names its own document number', () => {
    assertEqual(enrichQuestion('LC-2026-002 còn thiếu gì?', 'LC-2026-001'), 'LC-2026-002 còn thiếu gì?');
  });
});
