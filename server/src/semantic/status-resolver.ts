import { stripDiacritics } from './normalizer';
import { StatusDefinitionsPack } from './types';

/** Word-boundary containment check, not a raw substring test — a short status keyword like
 * "hủy" (stripped: "huy") is otherwise a false-positive substring of unrelated words after
 * diacritics are stripped (e.g. "chuyển" -> "chuyen" literally contains "huy" at index 1-3,
 * which used to make "Tôi muốn chuyển tiền" resolve a phantom CANCELLED status). Same lookaround
 * technique normalizer.ts::expandAbbreviations already uses for the same reason (JS's `\b` is
 * ASCII-only and unreliable around Vietnamese letters), applied here to already-diacritics-
 * stripped text for consistency. */
function containsWord(text: string, phrase: string): boolean {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'u');
  return re.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolves a Vietnamese status phrase in the (normalized) question to a canonical status id,
 * e.g. "cho duyet" -> "PENDING_APPROVAL". Longest phrase wins to prefer more specific matches. */
export function resolveStatus(normalizedText: string, pack: StatusDefinitionsPack): string | undefined {
  let best: { phrase: string; status: string } | undefined;

  for (const [phrase, status] of Object.entries(pack.vietnameseMap)) {
    const normalizedPhrase = stripDiacritics(phrase.toLowerCase());
    if (containsWord(normalizedText, normalizedPhrase)) {
      if (!best || normalizedPhrase.length > best.phrase.length) {
        best = { phrase: normalizedPhrase, status };
      }
    }
  }

  return best?.status;
}
