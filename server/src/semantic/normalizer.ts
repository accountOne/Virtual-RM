import { SemanticRulesPack } from './types';

const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/**
 * Normalizes a raw question per semantic-rules.json's `normalization.steps`:
 * lowercase, trim, remove punctuation, normalize whitespace, normalize abbreviations,
 * strip diacritics. Deterministic, no external calls.
 */
export function normalize(text: string, rules: SemanticRulesPack): string {
  let result = text.toLowerCase().trim();

  if (rules.normalization.steps.includes('removePunctuation')) {
    result = result.replace(/[.,;:!?()"'`]/g, ' ');
  }
  if (rules.normalization.steps.includes('normalizeWhitespace')) {
    result = result.replace(/\s+/g, ' ').trim();
  }
  if (rules.normalization.steps.includes('normalizeAbbreviations')) {
    result = expandAbbreviations(result, rules.normalization.abbreviations);
  }
  if (rules.normalization.steps.includes('stripDiacritics')) {
    result = stripDiacritics(result);
  }
  return result;
}

/**
 * Word-boundary replacement so "tk" inside "thắc mắc" isn't touched, only the standalone
 * token. Deliberately NOT using regex `\b` — JS's `\w` is ASCII-only, so it doesn't recognize
 * Vietnamese diacritic letters as word characters. That makes `\bkh\b` falsely match inside
 * "khả" (the boundary between ASCII "h" and non-ASCII "ả" looks like a word boundary to `\w`),
 * corrupting it into "khách hàngả". The `u` flag + `\p{L}` (any Unicode letter) fixes this.
 */
function expandAbbreviations(text: string, abbreviations: Record<string, string>): string {
  let result = text;
  for (const [abbr, expansion] of Object.entries(abbreviations)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(abbr)}(?![\\p{L}\\p{N}])`, 'gu');
    result = result.replace(re, expansion);
  }
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
