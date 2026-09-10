import { addDays, toDateOnly } from '../utils/date.util';
import { stripDiacritics } from './normalizer';
import { DatePeriodDef, DateRange } from './types';

export interface DateResolution {
  periodId: string;
  matchedPhrase: string;
  range: DateRange;
}

/** Finds the longest matching date-period phrase in the (already normalized/diacritic-stripped)
 * question text. Longest match wins so "7 ngày qua" isn't shadowed by a shorter false positive. */
export function resolveDatePeriod(normalizedText: string, periods: DatePeriodDef[]): DateResolution | undefined {
  let best: { period: DatePeriodDef; phrase: string } | undefined;

  for (const period of periods) {
    for (const phrase of period.phrases) {
      const normalizedPhrase = stripDiacritics(phrase.toLowerCase());
      if (normalizedText.includes(normalizedPhrase)) {
        if (!best || normalizedPhrase.length > best.phrase.length) {
          best = { period, phrase: normalizedPhrase };
        }
      }
    }
  }

  if (!best) return undefined;
  return { periodId: best.period.id, matchedPhrase: best.phrase, range: computeDateRange(best.period, todayAnchor()) };
}

let anchor = new Date().toISOString().slice(0, 10);

/** The semantic engine is told "today" by the caller (anchored to the mock data's latest
 * transaction date, same convention as transactions.service.ts's getAnchorDates()) so date
 * math stays consistent with the rest of the app instead of using the real wall-clock date. */
export function setAnchorDate(dateOnly: string): void {
  anchor = dateOnly;
}

function todayAnchor(): string {
  return anchor;
}

export function computeDateRange(period: DatePeriodDef, anchorDateOnly: string): DateRange {
  switch (period.rule) {
    case 'DAY_OFFSET': {
      const d = addDays(anchorDateOnly, period.offset ?? 0);
      return { from: d, to: d };
    }
    case 'WEEK_OFFSET': {
      const weekStart = startOfWeek(anchorDateOnly);
      const from = addDays(weekStart, (period.offset ?? 0) * 7);
      const to = addDays(from, 6);
      return { from, to };
    }
    case 'MONTH_OFFSET': {
      const { from, to } = monthRange(anchorDateOnly, period.offset ?? 0);
      return { from, to };
    }
    case 'QUARTER_OFFSET': {
      const { from, to } = quarterRange(anchorDateOnly, period.offset ?? 0);
      return { from, to };
    }
    case 'YTD': {
      const year = anchorDateOnly.slice(0, 4);
      return { from: `${year}-01-01`, to: anchorDateOnly };
    }
    case 'DAY_WINDOW': {
      const days = period.days ?? 7;
      return period.direction === 'FUTURE'
        ? { from: anchorDateOnly, to: addDays(anchorDateOnly, days) }
        : { from: addDays(anchorDateOnly, -days), to: anchorDateOnly };
    }
    case 'MONTH_WINDOW': {
      const months = period.months ?? 1;
      const from = addDays(monthRange(anchorDateOnly, -months + 1).from, 0);
      return { from, to: anchorDateOnly };
    }
    default:
      return { from: anchorDateOnly, to: anchorDateOnly };
  }
}

function startOfWeek(dateOnly: string): string {
  const d = new Date(dateOnly + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(dateOnly, diffToMonday);
}

function monthRange(anchorDateOnly: string, monthOffset: number): DateRange {
  const [y, m] = anchorDateOnly.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
  const from = base.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

function quarterRange(anchorDateOnly: string, quarterOffset: number): DateRange {
  const [y, m] = anchorDateOnly.split('-').map(Number);
  const currentQuarter = Math.floor((m - 1) / 3);
  const targetQuarterIndex = currentQuarter + quarterOffset;
  const base = new Date(Date.UTC(y, targetQuarterIndex * 3, 1));
  const from = base.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 3, 0));
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

export function isWithinRange(dateOnlyOrIso: string, range: DateRange): boolean {
  const d = toDateOnly(dateOnlyOrIso);
  return d >= range.from && d <= range.to;
}
