/** All "today" calculations are anchored to the latest transaction date in the mock data,
 * so the demo always looks current regardless of when it is actually run. */
export function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  const d = new Date(dateOnly + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromDateOnly: string, toDateOnlyStr: string): number {
  const a = new Date(fromDateOnly + 'T00:00:00Z').getTime();
  const b = new Date(toDateOnlyStr + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function isSameDate(iso: string, dateOnly: string): boolean {
  return toDateOnly(iso) === dateOnly;
}

/** True when iso's date falls within the n days up to and including anchorDateOnly. */
export function isWithinLastNDays(iso: string, anchorDateOnly: string, n: number): boolean {
  const diff = daysBetween(toDateOnly(iso), anchorDateOnly); // anchor - txnDate, in days
  return diff >= 0 && diff <= n;
}
