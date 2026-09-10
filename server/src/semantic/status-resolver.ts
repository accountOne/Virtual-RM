import { stripDiacritics } from './normalizer';
import { StatusDefinitionsPack } from './types';

/** Resolves a Vietnamese status phrase in the (normalized) question to a canonical status id,
 * e.g. "cho duyet" -> "PENDING_APPROVAL". Longest phrase wins to prefer more specific matches. */
export function resolveStatus(normalizedText: string, pack: StatusDefinitionsPack): string | undefined {
  let best: { phrase: string; status: string } | undefined;

  for (const [phrase, status] of Object.entries(pack.vietnameseMap)) {
    const normalizedPhrase = stripDiacritics(phrase.toLowerCase());
    if (normalizedText.includes(normalizedPhrase)) {
      if (!best || normalizedPhrase.length > best.phrase.length) {
        best = { phrase: normalizedPhrase, status };
      }
    }
  }

  return best?.status;
}
