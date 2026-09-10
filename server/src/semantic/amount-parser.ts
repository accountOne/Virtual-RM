import { stripDiacritics } from './normalizer';
import { AmountFilter, AmountOperatorId, AmountOperatorsPack } from './types';

const NUMBER_UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(ty|trieu|nghin)?/;

/**
 * Parses an amount condition out of the (already normalized, diacritic-stripped) question,
 * e.g. "tren 5 ty" -> { operator: 'GT', value: 5_000_000_000, currency: 'VND' }, or
 * "tu 500 trieu den 2 ty" -> { operator: 'BETWEEN', min: 500_000_000, max: 2_000_000_000, currency: 'VND' }.
 * Returns undefined when no explicit operator phrase is present — a bare number without an
 * operator ("5 tỷ") is ambiguous, so the engine deliberately doesn't guess.
 */
export function parseAmountFilter(normalizedText: string, pack: AmountOperatorsPack): AmountFilter | undefined {
  const currency = detectCurrency(normalizedText, pack);

  const between = parseBetween(normalizedText, pack, currency);
  if (between) return between;

  const operators = [...pack.operators]
    .filter((o) => o.id !== 'BETWEEN')
    .flatMap((o) => o.phrases.map((phrase) => ({ id: o.id, phrase: stripDiacritics(phrase.toLowerCase()) })))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  let best: { id: AmountOperatorId; index: number; phraseLength: number } | undefined;
  for (const op of operators) {
    const idx = normalizedText.indexOf(op.phrase);
    if (idx === -1) continue;
    if (!best || idx < best.index || (idx === best.index && op.phrase.length > best.phraseLength)) {
      best = { id: op.id, index: idx, phraseLength: op.phrase.length };
    }
  }
  if (!best) return undefined;

  const rest = normalizedText.slice(best.index + best.phraseLength, best.index + best.phraseLength + 24);
  const match = rest.match(NUMBER_UNIT_RE);
  if (!match) return undefined;

  const value = toNumber(match[1], match[2], pack);
  if (value === undefined) return undefined;

  return { operator: best.id, value, currency };
}

function parseBetween(text: string, pack: AmountOperatorsPack, currency: string): AmountFilter | undefined {
  const re = /(?:tu|trong khoang)\s+(\d+(?:[.,]\d+)?)\s*(ty|trieu|nghin)?\s*(?:den|toi|-)\s*(\d+(?:[.,]\d+)?)\s*(ty|trieu|nghin)?/;
  const m = text.match(re);
  if (!m) return undefined;
  const unit2 = m[4] ?? m[2];
  const min = toNumber(m[1], m[2] ?? unit2, pack);
  const max = toNumber(m[3], unit2, pack);
  if (min === undefined || max === undefined) return undefined;
  return { operator: 'BETWEEN', min, max, currency };
}

function toNumber(raw: string, unit: string | undefined, pack: AmountOperatorsPack): number | undefined {
  const n = parseFloat(raw.replace(',', '.'));
  if (Number.isNaN(n)) return undefined;
  if (!unit) return n;
  const unitDef = pack.units.find((u) => u.phrases.some((p) => stripDiacritics(p.toLowerCase()) === unit));
  return unitDef ? n * unitDef.multiplier : n;
}

function detectCurrency(text: string, pack: AmountOperatorsPack): string {
  for (const c of pack.currencies) {
    if (c.default) continue;
    if (c.phrases.some((p) => text.includes(stripDiacritics(p.toLowerCase())))) return c.id;
  }
  return pack.currencies.find((c) => c.default)?.id ?? 'VND';
}
