/** Generic, deterministic aggregation helpers used by response-generator.ts.
 * No ML/statistics beyond basic arithmetic — matches the "deterministic, local" constraint. */

export function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((s, item) => s + pick(item), 0);
}

export function count<T>(items: T[]): number {
  return items.length;
}

export function avg<T>(items: T[], pick: (item: T) => number): number {
  return items.length === 0 ? 0 : sum(items, pick) / items.length;
}

export function min<T>(items: T[], pick: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => (best === undefined || pick(item) < pick(best) ? item : best), undefined);
}

export function max<T>(items: T[], pick: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => (best === undefined || pick(item) > pick(best) ? item : best), undefined);
}

export interface CompareResult {
  current: number;
  previous: number;
  delta: number;
  pctChange: number;
  trend: 'tăng' | 'giảm' | 'không đổi';
}

/** Compares a current-period total against a previous-period total (e.g. this month vs last month). */
export function compare(current: number, previous: number): CompareResult {
  const delta = current - previous;
  const pctChange = previous > 0 ? (delta / previous) * 100 : 0;
  const trend = delta > 0 ? 'tăng' : delta < 0 ? 'giảm' : 'không đổi';
  return { current, previous, delta, pctChange: Math.round(pctChange), trend };
}

export function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
