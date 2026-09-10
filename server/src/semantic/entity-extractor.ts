import { SemanticQuery } from './types';

export interface KnownNames {
  /** Counterparty names pulled live from transactions/payment-orders/collections/LC/BG data. */
  beneficiaries: string[];
  /** Customer names pulled live from receivables.json. */
  customers: string[];
  /** Supplier names pulled live from payables.json. */
  suppliers: string[];
}

const DOCUMENT_ID_RE = /\b(LC|BG|COL|LN|INV|PO)-[\w-]+\b/i;
const ACCOUNT_NO_RE = /\b\d{9,}\b/;

/**
 * Extracts structured entities (beneficiary/customer/supplier/documentId/accountNo) from the
 * *original* question text (case preserved, so proper names like "FPT Software" still match) —
 * matching is a deterministic substring lookup against names that actually exist in the mock
 * data, never a guess.
 */
export function extractEntities(originalText: string, known: KnownNames): SemanticQuery['entities'] {
  const entities: SemanticQuery['entities'] = {};
  const haystack = originalText.toLowerCase();

  const supplier = findFirst(haystack, known.suppliers);
  if (supplier) {
    entities.supplier = supplier;
    entities.beneficiary = supplier;
  }

  const customer = findFirst(haystack, known.customers);
  if (customer) {
    entities.customer = customer;
    if (!entities.beneficiary) entities.beneficiary = customer;
  }

  if (!entities.beneficiary) {
    const beneficiary = findFirst(haystack, known.beneficiaries);
    if (beneficiary) entities.beneficiary = beneficiary;
  }

  const docMatch = originalText.match(DOCUMENT_ID_RE);
  if (docMatch) entities.documentId = docMatch[0].toUpperCase();

  const acctMatch = originalText.match(ACCOUNT_NO_RE);
  if (acctMatch) entities.accountNo = acctMatch[0];

  return entities;
}

function findFirst(haystackLower: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  for (const name of candidates) {
    if (!name) continue;
    if (haystackLower.includes(name.toLowerCase())) {
      if (!best || name.length > best.length) best = name;
    }
  }
  return best;
}
